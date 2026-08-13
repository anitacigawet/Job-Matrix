import { invokeLLM } from "./_core/llm";
import { TrackedJob } from "../drizzle/schema";
import fs from "fs";

/**
 * User profile data used to dynamically customize AI filtering prompts
 */
export interface UserProfileForFilter {
  state: string;
  city: string;
  stateAbbr: string;
  remotePreference: "remote_only" | "hybrid" | "on_site" | "any";
  educationLevel: "no_degree" | "high_school" | "associates" | "bachelors" | "masters" | "phd";
  yearsExperience: string;
  skillsParsed: string | null;
  searchRadiusMiles?: number;
  minSalary?: number | null;
  salaryFilterEnabled?: boolean;
  isRealProfile?: boolean;
}

export const DEFAULT_PROFILE: UserProfileForFilter = {
  state: "",
  city: "",
  stateAbbr: "",
  remotePreference: "any",
  educationLevel: "no_degree",
  yearsExperience: "0-1",
  skillsParsed: null,
  searchRadiusMiles: 50,
  minSalary: null,
  salaryFilterEnabled: false,
  isRealProfile: false,
};

function getMaxYearsFromRange(range: string): number {
  switch (range) {
    case "0-1": return 1;
    case "1-3": return 3;
    case "3-5": return 5;
    case "5-10": return 10;
    case "10+": return 99;
    default: return 2;
  }
}

function getEducationDescription(level: string): string {
  switch (level) {
    case "no_degree": return "no college degree";
    case "high_school": return "a high school diploma only";
    case "associates": return "an associate's degree";
    case "bachelors": return "a bachelor's degree";
    case "masters": return "a master's degree";
    case "phd": return "a PhD/doctorate";
    default: return "no college degree";
  }
}

function getDegreesToReject(level: string): string {
  switch (level) {
    case "no_degree": return "any college degree (associate's, bachelor's, master's, PhD)";
    case "high_school": return "any college degree (associate's, bachelor's, master's, PhD)";
    case "associates": return "a bachelor's degree or higher";
    case "bachelors": return "a master's degree or higher";
    case "masters": return "a PhD/doctorate";
    case "phd": return "none - user has the highest degree level";
    default: return "any college degree";
  }
}

const DEBUG_LOG_FILE = "/tmp/ai-analysis-debug.log";

function logToFile(message: string) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(DEBUG_LOG_FILE, "[" + timestamp + "] " + message + "\n", "utf8");
}

export function initializeDebugLog() {
  const timestamp = new Date().toISOString();
  fs.writeFileSync(DEBUG_LOG_FILE, "=== AI Job Filtering Debug Log ===\nStarted: " + timestamp + "\n\n", "utf8");
}

/**
 * Robust extraction of text content from LLM response.
 * Handles: plain string, array of content parts (thinking mode), nested objects.
 */
function extractTextFromContent(content: any): string {
  // Plain string
  if (typeof content === "string") {
    return content.trim();
  }
  
  // Array of content parts (common with thinking mode)
  if (Array.isArray(content)) {
    // Find the text part (skip thinking parts)
    for (const part of content) {
      if (part && typeof part === "object") {
        if (part.type === "text" && typeof part.text === "string") {
          return part.text.trim();
        }
      }
      if (typeof part === "string") {
        return part.trim();
      }
    }
    // Fallback: stringify the whole array
    return JSON.stringify(content);
  }
  
  // Object with text property
  if (content && typeof content === "object" && typeof content.text === "string") {
    return content.text.trim();
  }
  
  // Last resort
  return JSON.stringify(content);
}

/**
 * Parse JSON from LLM response text, handling markdown code blocks and other wrapping.
 */
function parseJsonFromResponse(text: string): any {
  let clean = text.trim();
  
  // Remove markdown code blocks
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?\s*```\s*$/, "");
  }
  
  // Try direct parse
  try {
    return JSON.parse(clean);
  } catch (e) {
    // Try to find JSON object in the text
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e2) {
        // ignore
      }
    }
    throw new Error("Could not parse JSON from response: " + clean.slice(0, 200));
  }
}

/**
 * Retry helper with exponential backoff
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 2,
  baseDelayMs: number = 1000,
  operationName: string = "Operation"
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
        console.log("[" + operationName + "] Retry " + attempt + "/" + maxRetries + " after " + delayMs + "ms...");
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      return await operation();
    } catch (error: any) {
      lastError = error;
      console.error("[" + operationName + "] Attempt " + (attempt + 1) + "/" + (maxRetries + 1) + " failed:", error.message);
      if (attempt === maxRetries) break;
    }
  }
  throw new Error(operationName + " failed after " + (maxRetries + 1) + " attempts: " + (lastError?.message || "Unknown error"));
}

/**
 * Convert jobs to a compact CSV string for embedding in prompts.
 */
function jobsToCompactCSV(jobs: TrackedJob[]): string {
  const headers = "job_id,title,location,description";
  const rows = jobs.map(job => {
    const desc = (job.description || "").replace(/"/g, '""').replace(/\n/g, " ").slice(0, 400);
    const title = (job.title || "").replace(/"/g, '""');
    const loc = (job.location || "Unknown").replace(/"/g, '""');
    const id = job.jobId;
    return '"' + id + '","' + title + '","' + loc + '","' + desc + '"';
  });
  return [headers, ...rows].join("\n");
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

const BATCH_SIZE = 80;

/**
 * Call LLM for a batch and parse the jobs array from the response.
 * Returns the parsed jobs array or throws.
 */
async function callLLMForBatch(
  systemPrompt: string,
  userPrompt: string,
  batchName: string
): Promise<any[]> {
  return retryWithBackoff(
    async () => {
      const result = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
      });
      
      if (!result?.choices?.length) {
        throw new Error("LLM returned empty response");
      }
      
      const rawContent = result.choices[0].message.content;
      const text = extractTextFromContent(rawContent);
      
      console.log("[" + batchName + "] Raw content type: " + typeof rawContent + ", extracted text length: " + text.length);
      logToFile("[" + batchName + "] Response preview: " + text.slice(0, 300));
      
      const parsed = parseJsonFromResponse(text);
      
      if (!parsed.jobs || !Array.isArray(parsed.jobs)) {
        const possibleKeys = Object.keys(parsed);
        
        // Check if it's a named array under a different key
        for (const key of possibleKeys) {
          if (Array.isArray(parsed[key]) && parsed[key].length > 0 && parsed[key][0]?.job_id) {
            console.log("[" + batchName + "] Found jobs under key '" + key + "'");
            return parsed[key];
          }
        }
        
        // Check if the model returned a flat object with numeric keys (0, 1, 2, ...)
        // This happens when the model returns results as {"0": {...}, "1": {...}, ...}
        const numericKeys = possibleKeys.filter(k => /^\d+$/.test(k));
        if (numericKeys.length > 0) {
          const items = numericKeys.sort((a, b) => Number(a) - Number(b)).map(k => parsed[k]);
          // Check if items have job_id
          if (items.length > 0 && items[0]?.job_id) {
            console.log("[" + batchName + "] Converted " + items.length + " numeric-keyed items to array");
            return items;
          }
        }
        
        // Check if the parsed object itself looks like a single job result
        if (parsed.job_id) {
          console.log("[" + batchName + "] Single job result, wrapping in array");
          return [parsed];
        }
        
        throw new Error("Response missing jobs array. Keys found: " + possibleKeys.slice(0, 10).join(", ") + (possibleKeys.length > 10 ? "..." : ""));
      }
      
      return parsed.jobs;
    },
    3, // 4 total attempts
    2000,
    batchName
  );
}

/**
 * Stage 1: Remote/Location Eligibility Filter
 */
export async function filterRemoteEligibility(jobs: TrackedJob[], profile: UserProfileForFilter = DEFAULT_PROFILE): Promise<{
  eligible: TrackedJob[];
  filtered: TrackedJob[];
  stats: { total: number; remote: number; hybrid: number; notRemote: number; stateExcluded: number };
}> {
  console.log("[AI Filter Stage 1] Starting remote/location check for " + jobs.length + " jobs (State: " + profile.state + ")");
  
  let locationInstructions = "";
  if (profile.remotePreference === "remote_only") {
    locationInstructions = "The user is looking for REMOTE ONLY positions.\n- \"remote\" means the job can be done entirely from home\n- Check if the job explicitly excludes " + profile.state + " or restricts to specific states that don't include " + profile.state + "\n- If a job lists specific states and " + profile.state + " is NOT in that list, mark state_excluded: true\n- If no state restrictions mentioned, assume available nationwide (state_excluded: false)\n- ONLY pass jobs that are fully remote AND available in " + profile.state;
  } else if (profile.remotePreference === "hybrid") {
    locationInstructions = "The user is open to REMOTE or HYBRID positions in " + profile.city + ", " + profile.state + ".\n- PASS jobs that are remote (available in " + profile.state + ") OR hybrid near " + profile.city;
  } else if (profile.remotePreference === "on_site") {
    locationInstructions = "The user is looking for ON-SITE positions near " + profile.city + ", " + profile.state + ".\n- PASS jobs located in or near " + profile.city + " (within " + (profile.searchRadiusMiles || 50) + " miles)";
  } else {
    locationInstructions = "The user is open to ANY work arrangement in " + profile.city + ", " + profile.state + ".\n- PASS remote jobs available in " + profile.state + ", AND local jobs near " + profile.city;
  }

  const allResults: Array<{ job_id: string; work_type: string; state_excluded: boolean; reasoning: string }> = [];
  const skippedJobs: TrackedJob[] = [];
  const batches = chunkArray(jobs, BATCH_SIZE);
  
  console.log("[AI Filter Stage 1] Processing " + batches.length + " batches of ~" + BATCH_SIZE + " jobs each");
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const csv = jobsToCompactCSV(batch);
    
    console.log("[AI Filter Stage 1] Processing batch " + (i + 1) + "/" + batches.length + " (" + batch.length + " jobs)");
    
    const prompt = "Analyze these " + batch.length + " job listings and classify each one based on remote work and location eligibility.\n\n" + locationInstructions + "\n\nFor each job, determine:\n1. Work type: \"remote\", \"hybrid\", or \"not_remote\"\n2. State eligibility: is the job available for someone in " + profile.state + "?\n\nIMPORTANT: Use natural language processing, NOT keyword matching.\n\nHere are the jobs in CSV format:\n\n" + csv + "\n\nReturn a JSON object with this exact structure:\n{\"jobs\": [{\"job_id\": \"string\", \"work_type\": \"remote\"|\"hybrid\"|\"not_remote\", \"state_excluded\": true|false, \"reasoning\": \"brief\"}]}\n\nYou MUST include ALL " + batch.length + " jobs in the response. Respond with ONLY valid JSON, no other text.";

    try {
      const batchResults = await callLLMForBatch(
        "You are an expert at analyzing job listings for remote work eligibility and location restrictions. The user lives in " + profile.city + ", " + profile.state + ". Always respond with valid JSON only, no markdown, no explanation.",
        prompt,
        "Stage1-B" + (i + 1)
      );
      allResults.push(...batchResults);
    } catch (error: any) {
      // Graceful degradation: skip this batch, mark jobs as filtered (conservative)
      console.error("[AI Filter Stage 1] Batch " + (i + 1) + " failed permanently, skipping " + batch.length + " jobs: " + error.message);
      logToFile("[Stage 1] BATCH " + (i + 1) + " FAILED: " + error.message + " — " + batch.length + " jobs skipped (treated as filtered)");
      skippedJobs.push(...batch);
    }
  }
  
  console.log("[AI Filter Stage 1] All batches done. Got " + allResults.length + " results, " + skippedJobs.length + " skipped");
  
  logToFile("\n=== STAGE 1: Remote/Location Filter ===");
  logToFile("User: " + profile.city + ", " + profile.state + " | Preference: " + profile.remotePreference);
  logToFile("Total analyzed: " + allResults.length + " | Skipped: " + skippedJobs.length);
  
  // Determine eligible based on preference
  let eligibleJobIds: Set<string>;
  if (profile.remotePreference === "remote_only") {
    eligibleJobIds = new Set(allResults.filter(j => j.work_type === "remote" && !j.state_excluded).map(j => j.job_id));
  } else if (profile.remotePreference === "hybrid") {
    eligibleJobIds = new Set(allResults.filter(j => (j.work_type === "remote" || j.work_type === "hybrid") && !j.state_excluded).map(j => j.job_id));
  } else if (profile.remotePreference === "on_site") {
    eligibleJobIds = new Set(allResults.filter(j => !j.state_excluded).map(j => j.job_id));
  } else {
    eligibleJobIds = new Set(allResults.filter(j => !j.state_excluded).map(j => j.job_id));
  }

  const eligible = jobs.filter(job => eligibleJobIds.has(job.jobId));
  // Filtered = not eligible (includes skipped jobs which are conservatively treated as filtered)
  const filtered = jobs.filter(job => !eligibleJobIds.has(job.jobId));

  const stats = {
    total: jobs.length,
    remote: allResults.filter(j => j.work_type === "remote").length,
    hybrid: allResults.filter(j => j.work_type === "hybrid").length,
    notRemote: allResults.filter(j => j.work_type === "not_remote").length,
    stateExcluded: allResults.filter(j => j.state_excluded).length,
  };

  console.log("[AI Filter Stage 1] Complete: " + eligible.length + "/" + jobs.length + " passed");
  return { eligible, filtered, stats };
}

/**
 * Stage 2: Degree Requirement Filter
 */
export async function filterDegreeRequirements(jobs: TrackedJob[], profile: UserProfileForFilter = DEFAULT_PROFILE): Promise<{
  eligible: TrackedJob[];
  filtered: TrackedJob[];
  stats: { total: number; required: number; preferred: number; notRequired: number };
}> {
  console.log("[AI Filter Stage 2] Starting degree check for " + jobs.length + " jobs (Education: " + profile.educationLevel + ")");
  
  const userEducation = getEducationDescription(profile.educationLevel);
  const degreesToReject = getDegreesToReject(profile.educationLevel);

  const allResults: Array<{ job_id: string; degree_requirement: string; reasoning: string }> = [];
  const skippedJobs: TrackedJob[] = [];
  const batches = chunkArray(jobs, BATCH_SIZE);
  
  console.log("[AI Filter Stage 2] Processing " + batches.length + " batches");
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const csv = jobsToCompactCSV(batch);
    
    console.log("[AI Filter Stage 2] Batch " + (i + 1) + "/" + batches.length + " (" + batch.length + " jobs)");
    
    const prompt = "Analyze these " + batch.length + " job listings and classify each based on degree requirements.\n\nThe user has " + userEducation + ". Filter out jobs that REQUIRE education higher than the user has.\n\nFor each job, classify the degree requirement as:\n- \"required\": Job explicitly requires " + degreesToReject + " (must have, required, mandatory)\n- \"preferred\": Job prefers a higher degree but doesn't require it (preferred, nice to have, or equivalent experience accepted)\n- \"not_required\": No degree mentioned, or user's education meets/exceeds the requirement\n\nIMPORTANT:\n- \"Bachelor's or equivalent experience\" = \"preferred\" (not strictly required)\n- \"Degree strongly preferred\" = \"preferred\"\n- Use natural language processing, NOT keyword matching\n\nHere are the jobs in CSV format:\n\n" + csv + "\n\nReturn a JSON object: {\"jobs\": [{\"job_id\": \"string\", \"degree_requirement\": \"required\"|\"preferred\"|\"not_required\", \"reasoning\": \"brief\"}]}\n\nYou MUST include ALL " + batch.length + " jobs. Respond with ONLY valid JSON.";

    try {
      const batchResults = await callLLMForBatch(
        "You are an expert at analyzing job listings for education requirements. The user has " + userEducation + ". Always respond with valid JSON only, no markdown, no explanation.",
        prompt,
        "Stage2-B" + (i + 1)
      );
      allResults.push(...batchResults);
    } catch (error: any) {
      console.error("[AI Filter Stage 2] Batch " + (i + 1) + " failed, skipping " + batch.length + " jobs: " + error.message);
      logToFile("[Stage 2] BATCH " + (i + 1) + " FAILED: " + error.message);
      skippedJobs.push(...batch);
    }
  }
  
  logToFile("\n=== STAGE 2: Degree Requirement Filter ===");
  logToFile("User Education: " + userEducation + " | Analyzed: " + allResults.length + " | Skipped: " + skippedJobs.length);
  
  const eligibleJobIds = new Set(
    allResults.filter(j => j.degree_requirement === "preferred" || j.degree_requirement === "not_required").map(j => j.job_id)
  );

  const eligible = jobs.filter(job => eligibleJobIds.has(job.jobId));
  const filtered = jobs.filter(job => !eligibleJobIds.has(job.jobId));

  const stats = {
    total: jobs.length,
    required: allResults.filter(j => j.degree_requirement === "required").length,
    preferred: allResults.filter(j => j.degree_requirement === "preferred").length,
    notRequired: allResults.filter(j => j.degree_requirement === "not_required").length,
  };

  console.log("[AI Filter Stage 2] Complete: " + eligible.length + "/" + jobs.length + " passed");
  return { eligible, filtered, stats };
}

/**
 * Stage 3: Experience Requirement Filter
 */
export async function filterExperienceRequirements(jobs: TrackedJob[], profile: UserProfileForFilter = DEFAULT_PROFILE): Promise<{
  eligible: TrackedJob[];
  filtered: TrackedJob[];
  stats: { total: number; tooMuchRequired: number; acceptable: number };
}> {
  const maxYears = getMaxYearsFromRange(profile.yearsExperience);
  console.log("[AI Filter Stage 3] Starting experience check for " + jobs.length + " jobs (Max: " + maxYears + " years)");
  
  const allResults: Array<{ job_id: string; experience_requirement: string; reasoning: string }> = [];
  const skippedJobs: TrackedJob[] = [];
  const batches = chunkArray(jobs, BATCH_SIZE);
  
  console.log("[AI Filter Stage 3] Processing " + batches.length + " batches");
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const csv = jobsToCompactCSV(batch);
    
    console.log("[AI Filter Stage 3] Batch " + (i + 1) + "/" + batches.length + " (" + batch.length + " jobs)");
    
    const prompt = "Analyze these " + batch.length + " job listings and classify each based on experience requirements.\n\nThe user has " + profile.yearsExperience + " years of experience" + (profile.skillsParsed ? " in: " + profile.skillsParsed : "") + ".\n\nFor each job, classify:\n- \"too_much\": Requires more than " + maxYears + " years of experience\n- \"acceptable\": Requires " + maxYears + " years or less, or no specific requirement\n\nIMPORTANT:\n- Focus on MINIMUM required experience, not preferred\n- \"Entry level\" or no experience mentioned = \"acceptable\"\n- Use natural language processing, NOT keyword matching\n\nHere are the jobs in CSV format:\n\n" + csv + "\n\nReturn a JSON object: {\"jobs\": [{\"job_id\": \"string\", \"experience_requirement\": \"too_much\"|\"acceptable\", \"reasoning\": \"brief\"}]}\n\nYou MUST include ALL " + batch.length + " jobs. Respond with ONLY valid JSON.";

    try {
      const batchResults = await callLLMForBatch(
        "You are an expert at analyzing job listings for experience requirements. The user has " + profile.yearsExperience + " years of experience. Always respond with valid JSON only, no markdown, no explanation.",
        prompt,
        "Stage3-B" + (i + 1)
      );
      allResults.push(...batchResults);
    } catch (error: any) {
      console.error("[AI Filter Stage 3] Batch " + (i + 1) + " failed, skipping " + batch.length + " jobs: " + error.message);
      logToFile("[Stage 3] BATCH " + (i + 1) + " FAILED: " + error.message);
      skippedJobs.push(...batch);
    }
  }
  
  logToFile("\n=== STAGE 3: Experience Requirement Filter ===");
  logToFile("User Experience: " + profile.yearsExperience + " years | Analyzed: " + allResults.length + " | Skipped: " + skippedJobs.length);
  
  const eligibleJobIds = new Set(
    allResults.filter(j => j.experience_requirement === "acceptable").map(j => j.job_id)
  );

  const eligible = jobs.filter(job => eligibleJobIds.has(job.jobId));
  const filtered = jobs.filter(job => !eligibleJobIds.has(job.jobId));

  const stats = {
    total: jobs.length,
    tooMuchRequired: allResults.filter(j => j.experience_requirement === "too_much").length,
    acceptable: allResults.filter(j => j.experience_requirement === "acceptable").length,
  };

  console.log("[AI Filter Stage 3] Complete: " + eligible.length + "/" + jobs.length + " passed");
  return { eligible, filtered, stats };
}

// Types for batchAnalyzeJobs
type JobInput = {
  id: string;
  title: string;
  description: string;
  company: string;
  location: string;
};

type AnalysisResult = {
  eligible: boolean;
  reason: string;
  details: {
    requiresBachelors: boolean;
    requiresYearsExperience: number | null;
    remoteStateRestriction: string | null;
    isScamOrMLM: boolean;
    redFlags: string[];
  };
  confidence: number;
};

/**
 * Main batch analysis function that runs all 3 stages sequentially
 */
export async function batchAnalyzeJobs(
  jobs: JobInput[],
  progressCallback?: (current: number, total: number) => void,
  profile?: UserProfileForFilter
): Promise<Map<string, AnalysisResult>> {
  const userProfile = profile || DEFAULT_PROFILE;
  console.log("[AI Filter] Starting 3-stage analysis for " + jobs.length + " jobs (Profile: " + userProfile.city + ", " + userProfile.state + ")");
  
  const trackedJobsInput: TrackedJob[] = jobs.map(j => ({
    jobId: j.id,
    title: j.title,
    description: j.description,
    company: j.company,
    location: j.location,
  } as TrackedJob));
  
  // Stage 1
  if (progressCallback) progressCallback(0, jobs.length);
  const stage1Result = await filterRemoteEligibility(trackedJobsInput, userProfile);
  console.log("[AI Filter] Stage 1 complete: " + stage1Result.eligible.length + " passed");
  
  // Stage 2
  const stage1Progress = Math.floor(jobs.length / 3);
  if (progressCallback) progressCallback(stage1Progress, jobs.length);
  const stage2Result = await filterDegreeRequirements(stage1Result.eligible, userProfile);
  console.log("[AI Filter] Stage 2 complete: " + stage2Result.eligible.length + " passed");
  
  // Stage 3
  const stage2Progress = Math.floor((jobs.length * 2) / 3);
  if (progressCallback) progressCallback(stage2Progress, jobs.length);
  const stage3Result = await filterExperienceRequirements(stage2Result.eligible, userProfile);
  console.log("[AI Filter] Stage 3 complete: " + stage3Result.eligible.length + " passed");
  
  // Stage 4 (Soft): Salary filter
  let salaryFiltered: TrackedJob[] = [];
  let finalEligible = stage3Result.eligible;
  
  if (userProfile.salaryFilterEnabled && userProfile.minSalary && userProfile.minSalary > 0) {
    const minSalary = userProfile.minSalary;
    console.log("[AI Filter] Salary soft filter: minimum $" + minSalary.toLocaleString() + "/year");
    logToFile("\n=== SALARY SOFT FILTER ===");
    logToFile("Minimum salary: $" + minSalary.toLocaleString() + "/year");
    
    salaryFiltered = [];
    finalEligible = [];
    
    for (const job of stage3Result.eligible) {
      const originalJob = jobs.find(j => j.id === job.jobId);
      const trackedJob = job as any;
      const salaryMin = trackedJob.salaryMin;
      const salaryMax = trackedJob.salaryMax;
      
      if (!salaryMin && !salaryMax) {
        finalEligible.push(job);
        continue;
      }
      
      const maxSalaryNum = salaryMax ? Number(salaryMax) : null;
      const minSalaryNum = salaryMin ? Number(salaryMin) : null;
      const bestSalary = maxSalaryNum || minSalaryNum || 0;
      
      if (bestSalary > 0 && bestSalary < minSalary) {
        salaryFiltered.push(job);
      } else {
        finalEligible.push(job);
      }
    }
    
    console.log("[AI Filter] Salary filter: " + salaryFiltered.length + " below minimum, " + finalEligible.length + " passed");
  }
  
  if (progressCallback) progressCallback(jobs.length, jobs.length);
  console.log("[AI Filter] Analysis complete: " + finalEligible.length + "/" + jobs.length + " eligible");
  
  // Build result map
  const resultMap = new Map<string, AnalysisResult>();
  const eligibleIds = new Set(finalEligible.map(j => j.jobId));
  const salaryFilteredIds = new Set(salaryFiltered.map(j => j.jobId));
  const stage1FilteredIds = new Set(stage1Result.filtered.map(j => j.jobId));
  const stage2FilteredIds = new Set(stage2Result.filtered.map(j => j.jobId));
  const stage3FilteredIds = new Set(stage3Result.filtered.map(j => j.jobId));
  
  const maxYears = getMaxYearsFromRange(userProfile.yearsExperience);
  const userEducation = getEducationDescription(userProfile.educationLevel);
  
  for (const job of jobs) {
    if (eligibleIds.has(job.id)) {
      resultMap.set(job.id, {
        eligible: true,
        reason: "Job meets all criteria: available in " + userProfile.state + ", education compatible with " + userEducation + ", experience within " + userProfile.yearsExperience + " years range.",
        details: { requiresBachelors: false, requiresYearsExperience: null, remoteStateRestriction: null, isScamOrMLM: false, redFlags: [] },
        confidence: 95,
      });
    } else if (stage1FilteredIds.has(job.id)) {
      resultMap.set(job.id, {
        eligible: false,
        reason: "Job does not meet location/remote requirements for " + userProfile.state + " (preference: " + userProfile.remotePreference + ").",
        details: { requiresBachelors: false, requiresYearsExperience: null, remoteStateRestriction: "Not available in " + userProfile.state, isScamOrMLM: false, redFlags: [] },
        confidence: 90,
      });
    } else if (stage2FilteredIds.has(job.id)) {
      resultMap.set(job.id, {
        eligible: false,
        reason: "Job requires education level higher than user's " + userEducation + ".",
        details: { requiresBachelors: true, requiresYearsExperience: null, remoteStateRestriction: null, isScamOrMLM: false, redFlags: [] },
        confidence: 90,
      });
    } else if (stage3FilteredIds.has(job.id)) {
      resultMap.set(job.id, {
        eligible: false,
        reason: "Job requires more than " + maxYears + " years of experience.",
        details: { requiresBachelors: false, requiresYearsExperience: maxYears + 1, remoteStateRestriction: null, isScamOrMLM: false, redFlags: [] },
        confidence: 90,
      });
    } else if (salaryFilteredIds.has(job.id)) {
      resultMap.set(job.id, {
        eligible: false,
        reason: "Job salary is below minimum threshold of $" + (userProfile.minSalary?.toLocaleString() || "0") + "/year (soft filter).",
        details: { requiresBachelors: false, requiresYearsExperience: null, remoteStateRestriction: null, isScamOrMLM: false, redFlags: ["salary_below_minimum"] },
        confidence: 85,
      });
    }
  }
  
  return resultMap;
}
