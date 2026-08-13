/**
 * Cross-Platform Deduplication & LLM-Powered Fit Scoring Service
 * 
 * 1. Deduplication: Identifies the same job posted on multiple platforms
 *    by comparing title + company + location similarity.
 * 2. Fit Scoring: Uses the configured LLM to score each eligible job against
 *    the user's profile (skills, education, experience, location).
 */

import { TrackedJob } from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";
import type { UserProfileForFilter } from "../ai-job-filter-csv";

// ─── DEDUPLICATION ──────────────────────────────────────────────────

interface DuplicateGroup {
  /** The "primary" job ID (earliest firstSeenAt or highest platform priority) */
  primaryId: number;
  /** All job IDs in this duplicate group */
  jobIds: number[];
  /** Platforms represented */
  platforms: string[];
  /** Normalized key used for grouping */
  key: string;
}

/**
 * Normalize a string for fuzzy matching: lowercase, strip punctuation,
 * collapse whitespace, remove common suffixes like "Inc", "LLC", etc.
 */
function normalize(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b(inc|llc|ltd|corp|corporation|company|co|group|services|solutions)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Create a dedup key from job title + company.
 * Location is intentionally excluded because the same job may be listed
 * as "Remote" on one platform and "New York, NY (Remote)" on another.
 */
function dedupKey(job: TrackedJob): string {
  const title = normalize(job.title);
  const company = normalize(job.company);
  return `${title}||${company}`;
}

/**
 * Detect cross-platform duplicates among a set of jobs.
 * Returns a map of jobId → DuplicateGroup for every job that has duplicates.
 */
export function detectDuplicates(jobs: TrackedJob[]): Map<number, DuplicateGroup> {
  const groups = new Map<string, TrackedJob[]>();

  for (const job of jobs) {
    const key = dedupKey(job);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(job);
  }

  const result = new Map<number, DuplicateGroup>();

  for (const [key, groupJobs] of Array.from(groups.entries())) {
    // Only care about groups with jobs from multiple platforms
    const platforms = Array.from(new Set(groupJobs.map((j: TrackedJob) => j.platform)));
    if (platforms.length <= 1 && groupJobs.length <= 1) continue;

    // Pick the primary: prefer earliest firstSeenAt
    const sorted = [...groupJobs].sort(
      (a, b) => new Date(a.firstSeenAt).getTime() - new Date(b.firstSeenAt).getTime()
    );
    const primary = sorted[0];

    const group: DuplicateGroup = {
      primaryId: primary.id,
      jobIds: sorted.map(j => j.id),
      platforms,
      key,
    };

    for (const job of sorted) {
      result.set(job.id, group);
    }
  }

  return result;
}

// ─── FIT SCORING ────────────────────────────────────────────────────

export interface FitScoreResult {
  jobId: string;
  fitScore: number; // 0-100
  skillsMatch: number;
  educationMatch: number;
  experienceMatch: number;
  locationMatch: number;
  overallNotes: string;
}

/**
 * Robust extraction of text content from LLM response.
 */
function extractTextFromContent(content: any): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part && typeof part === "object" && part.type === "text" && typeof part.text === "string") {
        return part.text.trim();
      }
      if (typeof part === "string") return part.trim();
    }
    return JSON.stringify(content);
  }
  if (content && typeof content === "object" && typeof content.text === "string") {
    return content.text.trim();
  }
  return JSON.stringify(content);
}

/**
 * Parse JSON from LLM response, handling markdown code blocks.
 */
function parseJsonFromResponse(text: string): any {
  let clean = text.trim();
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?\s*```\s*$/, "");
  }
  try {
    return JSON.parse(clean);
  } catch {
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]); } catch { /* ignore */ }
    }
    throw new Error("Could not parse JSON from response: " + clean.slice(0, 200));
  }
}

/**
 * Build a compact representation of jobs for the LLM prompt.
 */
function jobsToScoringCSV(jobs: TrackedJob[]): string {
  const headers = "job_id,title,company,location,job_type,description";
  const rows = jobs.map(job => {
    const desc = (job.description || "").replace(/"/g, '""').replace(/\n/g, " ").slice(0, 500);
    const title = (job.title || "").replace(/"/g, '""');
    const company = (job.company || "").replace(/"/g, '""');
    const loc = (job.location || "Unknown").replace(/"/g, '""');
    const jtype = (job.jobType || "unknown").replace(/"/g, '""');
    return `"${job.jobId}","${title}","${company}","${loc}","${jtype}","${desc}"`;
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

function getEducationDescription(level: string): string {
  switch (level) {
    case "no_degree": return "no college degree (high school or equivalent)";
    case "high_school": return "a high school diploma";
    case "associates": return "an associate's degree";
    case "bachelors": return "a bachelor's degree";
    case "masters": return "a master's degree";
    case "phd": return "a PhD/doctorate";
    default: return "no college degree";
  }
}

const FIT_BATCH_SIZE = 30; // Smaller batches for more detailed analysis

/**
 * Score a batch of eligible jobs against the user's profile using the LLM.
 * Returns fit scores for each job.
 */
export async function scoreJobFit(
  jobs: TrackedJob[],
  profile: UserProfileForFilter,
  jobTitles: string[],
  onProgress?: (completed: number, total: number) => Promise<void>
): Promise<FitScoreResult[]> {
  const allResults: FitScoreResult[] = [];
  const batches = chunkArray(jobs, FIT_BATCH_SIZE);

  console.log(`[Fit Scoring] Scoring ${jobs.length} jobs in ${batches.length} batches`);

  const profileSummary = buildProfileSummary(profile, jobTitles);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const csv = jobsToScoringCSV(batch);

    console.log(`[Fit Scoring] Batch ${i + 1}/${batches.length} (${batch.length} jobs)`);

    const systemPrompt = `You are an expert career advisor who evaluates how well job listings match a candidate's profile. Score each job on a 0-100 scale across four dimensions. Be realistic and honest — a 70+ score means strong match, 50-69 is moderate, below 50 is weak. Always respond with valid JSON only.`;

    const userPrompt = `Score how well each of these ${batch.length} jobs matches this candidate's profile:

${profileSummary}

For each job, score these dimensions (0-100):
- skills_match: How well the job's required skills align with the candidate's skills and desired job titles
- education_match: How well the candidate's education meets the job's requirements (100 if no degree required and candidate has no degree, or if candidate meets/exceeds requirements)
- experience_match: How well the candidate's experience level matches (100 if within range, lower if job wants significantly more)
- location_match: How well the job's location/remote status matches the candidate's preference (100 for remote jobs when candidate wants remote, lower for mismatches)

Also provide a brief "overall_notes" (1-2 sentences) explaining the score.

The overall fit_score should be a weighted average: skills (40%) + education (20%) + experience (20%) + location (20%).

Here are the jobs in CSV format:

${csv}

Return a JSON object: {"jobs": [{"job_id": "string", "fit_score": number, "skills_match": number, "education_match": number, "experience_match": number, "location_match": number, "overall_notes": "string"}]}

You MUST include ALL ${batch.length} jobs. Respond with ONLY valid JSON.`;

    try {
      const result = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      });

      if (!result?.choices?.length) {
        console.error(`[Fit Scoring] Batch ${i + 1}: Empty LLM response`);
        continue;
      }

      const rawContent = result.choices[0].message.content;
      const text = extractTextFromContent(rawContent);
      const parsed = parseJsonFromResponse(text);

      let jobResults: any[] = [];
      if (parsed.jobs && Array.isArray(parsed.jobs)) {
        jobResults = parsed.jobs;
      } else {
        // Try to find array under any key
        for (const key of Object.keys(parsed)) {
          if (Array.isArray(parsed[key]) && parsed[key].length > 0 && parsed[key][0]?.job_id) {
            jobResults = parsed[key];
            break;
          }
        }
      }

      for (const jr of jobResults) {
        allResults.push({
          jobId: String(jr.job_id),
          fitScore: Math.min(100, Math.max(0, Math.round(Number(jr.fit_score) || 0))),
          skillsMatch: Math.min(100, Math.max(0, Math.round(Number(jr.skills_match) || 0))),
          educationMatch: Math.min(100, Math.max(0, Math.round(Number(jr.education_match) || 0))),
          experienceMatch: Math.min(100, Math.max(0, Math.round(Number(jr.experience_match) || 0))),
          locationMatch: Math.min(100, Math.max(0, Math.round(Number(jr.location_match) || 0))),
          overallNotes: String(jr.overall_notes || ""),
        });
      }

      console.log(`[Fit Scoring] Batch ${i + 1}: Scored ${jobResults.length} jobs`);
    } catch (error: any) {
      console.error(`[Fit Scoring] Batch ${i + 1} failed:`, error.message);
      // Graceful degradation: skip this batch
    }

    if (onProgress) {
      await onProgress(Math.min((i + 1) * FIT_BATCH_SIZE, jobs.length), jobs.length);
    }
  }

  return allResults;
}

/**
 * Build a human-readable profile summary for the LLM prompt.
 */
function buildProfileSummary(profile: UserProfileForFilter, jobTitles: string[]): string {
  const education = getEducationDescription(profile.educationLevel);
  const skills = profile.skillsParsed || "general office skills";
  const location = `${profile.city}, ${profile.state}`;
  const remote = profile.remotePreference === "remote_only"
    ? "Remote only"
    : profile.remotePreference === "hybrid"
    ? "Remote or hybrid"
    : profile.remotePreference === "on_site"
    ? "On-site preferred"
    : "Any arrangement";

  return `CANDIDATE PROFILE:
- Desired job titles: ${jobTitles.join(", ")}
- Skills: ${skills}
- Education: ${education}
- Experience: ${profile.yearsExperience} years
- Location: ${location}
- Work preference: ${remote}
- Search radius: ${profile.searchRadiusMiles || 50} miles`;
}
