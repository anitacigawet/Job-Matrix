import type { TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { AppRouter } from "../../../server/routers";
import { showroomPostingUrl } from "./showroomPostings";
import { serializeCsv } from "@shared/csv";

type Dict = Record<string, any>;

const createdAt = new Date("2026-08-01T16:00:00.000Z");
const updatedAt = new Date("2026-08-24T18:30:00.000Z");

const baseJobs: Dict[] = [
  {
    id: 101,
    userId: 1,
    platform: "indeed",
    jobId: "fictional-101",
    title: "Community Programs Coordinator",
    company: "Juniper Community Works",
    location: "Phoenix, AZ",
    city: "Phoenix",
    state: "AZ",
    salaryMin: 54000,
    salaryMax: 68000,
    salaryInterval: "year",
    jobType: "fulltime",
    description: "Coordinate neighborhood programs, maintain partner calendars, and prepare plain-language progress reports for a fictional public-benefit organization.",
    jobUrl: showroomPostingUrl(101),
    datePosted: "2026-08-23",
    status: "new",
    firstSeenAt: new Date("2026-08-23T15:00:00.000Z"),
    lastSeenAt: new Date("2026-08-24T15:00:00.000Z"),
    aiAnalysis: {
      eligible: true,
      reason: "Matches the selected coordination titles, salary range, and Arizona or remote preference.",
      requiresBachelors: false,
      requiresYearsExperience: 2,
      remoteStateRestriction: null,
      isScamOrMLM: false,
      redFlags: [],
      confidence: 94,
      analyzedAt: "2026-08-24T16:00:00.000Z",
      fitScore: 92,
      fitDetails: { skillsMatch: 94, educationMatch: 100, experienceMatch: 88, locationMatch: 86, notes: "Strong coordination and reporting match." },
      scoredAt: "2026-08-24T16:02:00.000Z",
    },
  },
  {
    id: 102,
    userId: 1,
    platform: "linkedin",
    jobId: "fictional-102",
    title: "Operations Support Specialist",
    company: "Copper Mesa Services",
    location: "Remote — Arizona",
    city: null,
    state: "AZ",
    salaryMin: 24,
    salaryMax: 29,
    salaryInterval: "hour",
    jobType: "fulltime",
    description: "Support a fictional distributed operations team through scheduling, quality checks, documentation, and customer follow-up.",
    jobUrl: showroomPostingUrl(102),
    datePosted: "2026-08-22",
    status: "interested",
    firstSeenAt: new Date("2026-08-22T17:00:00.000Z"),
    lastSeenAt: new Date("2026-08-24T17:00:00.000Z"),
    aiAnalysis: {
      eligible: true,
      reason: "Remote in Arizona, no degree requirement, and directly aligned with the active operations title.",
      requiresBachelors: false,
      requiresYearsExperience: 1,
      remoteStateRestriction: "Arizona",
      isScamOrMLM: false,
      redFlags: [],
      confidence: 97,
      analyzedAt: "2026-08-24T16:00:00.000Z",
      fitScore: 88,
      fitDetails: { skillsMatch: 91, educationMatch: 100, experienceMatch: 84, locationMatch: 100, notes: "Excellent location and transferable-skills match." },
      scoredAt: "2026-08-24T16:02:00.000Z",
    },
  },
  {
    id: 103,
    userId: 1,
    platform: "adzuna",
    jobId: "fictional-103",
    title: "Civic Data Assistant",
    company: "Sonoran Open Records Lab",
    location: "Tempe, AZ · Hybrid",
    city: "Tempe",
    state: "AZ",
    salaryMin: 50000,
    salaryMax: 61000,
    salaryInterval: "year",
    jobType: "fulltime",
    description: "Review fictional civic records, normalize public datasets, and help publish accessible explainers for community users.",
    jobUrl: showroomPostingUrl(103),
    datePosted: "2026-08-21",
    status: "viewed",
    firstSeenAt: new Date("2026-08-21T19:00:00.000Z"),
    lastSeenAt: new Date("2026-08-24T19:00:00.000Z"),
    aiAnalysis: {
      eligible: true,
      reason: "Hybrid Arizona role with accessible data work and no conflicting education requirement.",
      requiresBachelors: false,
      requiresYearsExperience: 2,
      remoteStateRestriction: null,
      isScamOrMLM: false,
      redFlags: [],
      confidence: 91,
      analyzedAt: "2026-08-24T16:00:00.000Z",
      fitScore: 84,
      fitDetails: { skillsMatch: 90, educationMatch: 100, experienceMatch: 78, locationMatch: 82, notes: "Strong data and public-information alignment." },
      scoredAt: "2026-08-24T16:02:00.000Z",
    },
  },
  {
    id: 104,
    userId: 1,
    platform: "remotive",
    jobId: "fictional-104",
    title: "Documentation Coordinator",
    company: "Desert Lantern Cooperative",
    location: "Remote",
    city: null,
    state: null,
    salaryMin: 48000,
    salaryMax: 57000,
    salaryInterval: "year",
    jobType: "contract",
    description: "Maintain process documentation and turn complex internal notes into concise user-facing guidance for a fictional cooperative.",
    jobUrl: showroomPostingUrl(104),
    datePosted: "2026-08-20",
    status: "new",
    firstSeenAt: new Date("2026-08-20T18:00:00.000Z"),
    lastSeenAt: new Date("2026-08-24T18:00:00.000Z"),
    aiAnalysis: {
      eligible: true,
      reason: "Remote documentation work matches active preferences and the stated skills profile.",
      requiresBachelors: false,
      requiresYearsExperience: 1,
      remoteStateRestriction: null,
      isScamOrMLM: false,
      redFlags: [],
      confidence: 90,
      analyzedAt: "2026-08-24T16:00:00.000Z",
      fitScore: 80,
      fitDetails: { skillsMatch: 86, educationMatch: 100, experienceMatch: 76, locationMatch: 100, notes: "Good writing and process-documentation match." },
      scoredAt: "2026-08-24T16:02:00.000Z",
    },
  },
];

const initialApplied: Dict[] = [
  {
    id: 201,
    userId: 1,
    trackedJobId: null,
    platform: "themuse",
    jobId: "fictional-applied-201",
    title: "Member Support Coordinator",
    company: "Palo Verde Mutual Aid",
    location: "Mesa, AZ",
    salaryMin: 49000,
    salaryMax: 59000,
    salaryInterval: "year",
    jobType: "fulltime",
    description: "A fictional role used to demonstrate the application pipeline.",
    jobUrl: showroomPostingUrl(201),
    applicationStatus: "interview",
    firstTrackedAt: new Date("2026-08-10T16:00:00.000Z"),
    appliedAt: new Date("2026-08-12T16:00:00.000Z"),
    interviewAt: new Date("2026-08-26T18:00:00.000Z"),
    offerAt: null,
    resolvedAt: null,
    notes: "Phone interview scheduled for Tuesday.",
  },
  {
    id: 202,
    userId: 1,
    trackedJobId: null,
    platform: "indeed",
    jobId: "fictional-applied-202",
    title: "Program Intake Assistant",
    company: "Canyon Family Network",
    location: "Glendale, AZ",
    salaryMin: 22,
    salaryMax: 25,
    salaryInterval: "hour",
    jobType: "fulltime",
    description: "A fictional role used to demonstrate application tracking.",
    jobUrl: showroomPostingUrl(202),
    applicationStatus: "applied",
    firstTrackedAt: new Date("2026-08-15T16:00:00.000Z"),
    appliedAt: new Date("2026-08-18T16:00:00.000Z"),
    interviewAt: null,
    offerAt: null,
    resolvedAt: null,
    notes: null,
  },
];

const state: Dict = {
  jobs: baseJobs.map(job => ({ ...job, aiAnalysis: { ...job.aiAnalysis } })),
  applied: initialApplied.map(job => ({ ...job })),
  notes: [
    { id: 301, userId: 1, jobId: 201, noteType: "interview", content: "Prepare examples of scheduling and community coordination work.", oldStatus: "applied", newStatus: "interview", createdAt: new Date("2026-08-24T19:00:00.000Z") },
  ],
  inbox: [
    { id: 401, userId: 1, appliedJobId: 201, provider: "gmail", providerMessageId: "fictional-message-401", providerThreadId: "fictional-thread-401", source: "email", sender: "Avery Chen", senderAddress: "avery@example.com", senderPhone: null, subject: "Interview availability", snippet: "Could you meet with our team Tuesday afternoon?", category: "interview", summary: "The fictional employer requested interview availability for Tuesday afternoon.", matchConfidence: 96, classificationConfidence: 98, needsReview: true, receivedAt: new Date("2026-08-24T17:15:00.000Z"), reviewedAt: null, createdAt: new Date("2026-08-24T17:15:00.000Z") },
  ],
  titles: [
    { id: 1, title: "Community Programs Coordinator", isActive: true, createdAt },
    { id: 2, title: "Operations Support Specialist", isActive: true, createdAt },
    { id: 3, title: "Civic Data Assistant", isActive: true, createdAt },
  ],
  profile: {
    state: "Arizona",
    city: "Phoenix",
    searchRadiusMiles: 35,
    willingToRelocate: false,
    remotePreference: "any",
    educationLevel: "associates",
    yearsExperience: "3-5",
    skillsRaw: "community coordination, documentation, data review, scheduling, customer support",
    skillsParsed: [
      { skill: "Community coordination", yearsExperience: 4, level: "proficient" },
      { skill: "Documentation", yearsExperience: 4, level: "proficient" },
      { skill: "Data review", yearsExperience: 3, level: "proficient" },
    ],
    resumeText: "Fictional showroom résumé: coordination, documentation, public-facing support, and data quality work.",
    minSalary: 48000,
    salaryFilterEnabled: true,
  },
  enabledPlatforms: ["indeed", "linkedin", "adzuna", "themuse", "remotive"],
  settings: {
    id: 1,
    userId: 1,
    notificationsEnabled: 1,
    notifyOnNewEligible: 1,
    notifyOnScanComplete: 1,
    notifyOnEmployerResponse: 1,
    notifyDigestFrequency: "daily",
    autoScanEnabled: 0,
    autoScanFrequency: "daily",
    autoScanIncludeAI: 1,
    autoScanLastRun: null,
    autoScanNextRun: null,
    enabledPlatforms: ["indeed", "linkedin", "adzuna", "themuse", "remotive"],
    inboxMonitoringEnabled: 1,
    gmailHistoryId: "fictional-history",
    inboxLastCheckedAt: new Date("2026-08-24T17:15:00.000Z"),
    createdAt,
    updatedAt,
  },
  applicationProfile: {
    id: 1,
    userId: 1,
    fullName: "Jordan Example",
    email: "jordan@example.com",
    phone: "(555) 010-2026",
    addressLine1: "100 Fictional Avenue",
    addressLine2: null,
    city: "Phoenix",
    state: "AZ",
    postalCode: "85001",
    availability: "Weekdays",
    earliestStartDate: "2026-09-14",
    workAuthorized: true,
    sponsorshipRequired: false,
    transportation: "Reliable transportation",
    desiredPay: "$55,000 or equivalent hourly rate",
    resumeFileName: "fictional-showroom-resume.pdf",
    resumeUrl: null,
    createdAt,
    updatedAt,
  },
  gmail: {
    clientConfigured: true,
    connected: true,
    email: "jordan@example.com",
    connectedAt: createdAt,
    clientIdMasked: "showroom-c…ient-id",
  },
  slack: { configured: false, masked: null },
  monitoring: {
    enabled: true,
    notifyOnEmployerResponse: true,
    lastCheckedAt: updatedAt,
  },
  llm: {
    activeProvider: "gemini",
    rateLimitRps: 2,
    keys: {
      gemini: "fictional-showroom-key",
      openai: null,
      deepseek: null,
    },
    models: {
      gemini: "gemini-2.5-flash",
      openai: "gpt-4.1-mini",
      deepseek: "deepseek-chat",
    },
  },
  dataSourceCredentials: {
    adzuna: { appId: "fictional-showroom-id", appKey: "fictional-showroom-key" },
    usajobs: {},
    jooble: {},
    themuse: {},
  },
  presets: [
    { id: 501, userId: 1, name: "Phoenix + remote coordination", jobTitles: ["Community Programs Coordinator", "Operations Support Specialist"], location: "Phoenix, AZ", radiusMiles: 35, remotePreference: "any", platforms: ["indeed", "linkedin", "adzuna"], minSalary: 48000, jobType: "fulltime", isDefault: 1, lastUsedAt: new Date("2026-08-22T16:00:00.000Z"), createdAt, updatedAt },
    { id: 502, userId: 1, name: "Remote documentation", jobTitles: ["Documentation Coordinator"], location: "Phoenix, AZ", radiusMiles: 50, remotePreference: "remote_only", platforms: ["remotive", "remoteok"], minSalary: 45000, jobType: null, isDefault: 0, lastUsedAt: null, createdAt, updatedAt },
  ],
  scanRevision: 0,
};

const initialState = structuredClone(state);

const providerDefaults: Record<string, string> = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-4.1-mini",
  deepseek: "deepseek-chat",
};

function maskedValue(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.includes("@")) {
    const [local, domain] = value.split("@");
    return `${local.slice(0, 1)}…@${domain}`;
  }
  return value.length <= 8 ? "show…om" : `${value.slice(0, 4)}…${value.slice(-2)}`;
}

const llm = () => ({
  activeProvider: state.llm.activeProvider,
  activeProviderSource: state.llm.keys[state.llm.activeProvider] ? "settings" : "none",
  rateLimitRps: state.llm.rateLimitRps,
  providers: Object.keys(providerDefaults).map(id => ({
    id,
    hasKey: !!state.llm.keys[id],
    keyMasked: maskedValue(state.llm.keys[id]),
    model: state.llm.models[id] ?? providerDefaults[id],
    defaultModel: providerDefaults[id],
    keySource: state.llm.keys[id] ? "settings" : "none",
  })),
});

const sourceDefinitions: Dict[] = [
  { id: "adzuna", label: "Adzuna", tier: 1, signupUrl: "https://developer.adzuna.com/", noAuthRequired: false, fields: [{ name: "appId", label: "App ID", inputType: "text", placeholder: "c17cfb68", required: true }, { name: "appKey", label: "App Key", inputType: "password", placeholder: "••••••••", required: true }] },
  { id: "usajobs", label: "USAJobs", tier: 1, signupUrl: "https://developer.usajobs.gov/APIRequest/", noAuthRequired: false, fields: [{ name: "email", label: "Email (User-Agent)", inputType: "email", placeholder: "you@example.com", required: true }, { name: "apiKey", label: "API Key", inputType: "password", placeholder: "••••••••", required: true }] },
  { id: "jooble", label: "Jooble", tier: 1, signupUrl: "https://jooble.org/api/about", noAuthRequired: false, fields: [{ name: "apiKey", label: "API Key (partner)", inputType: "password", placeholder: "••••••••", required: true }] },
  { id: "themuse", label: "The Muse", tier: 1, signupUrl: "https://www.themuse.com/developers/api/v2", noAuthRequired: true, fields: [{ name: "apiKey", label: "API Key (optional — raises rate limit)", inputType: "password", placeholder: "leave blank for no-auth tier", required: false }] },
  { id: "remotive", label: "Remotive", tier: 1, signupUrl: "https://remotive.com/api-documentation/", noAuthRequired: true, fields: [] },
  { id: "remoteok", label: "RemoteOK", tier: 1, signupUrl: "https://remoteok.com/api", noAuthRequired: true, fields: [] },
];

function sourceIsConfigured(source: Dict, credentials: Dict): boolean {
  if (source.noAuthRequired) return true;
  return source.fields.filter((field: Dict) => field.required).every((field: Dict) => !!credentials[field.name]);
}

const dataSources = () => ({
  sources: sourceDefinitions.map(source => {
    const credentials = state.dataSourceCredentials[source.id] ?? {};
    const configured = sourceIsConfigured(source, credentials);
    return {
      ...source,
      configured,
      source: configured && !source.noAuthRequired ? "settings" : "none",
      fields: source.fields.map((field: Dict) => ({ ...field, valueMasked: maskedValue(credentials[field.name]) })),
    };
  }),
});

function resetShowroomState() {
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, structuredClone(initialState));
}

function eligibleJobs() {
  return state.jobs.filter((job: Dict) => job.status !== "applied" && job.status !== "rejected" && job.aiAnalysis?.eligible === true).map((job: Dict) => ({ ...job, aiAnalysis: { ...job.aiAnalysis } }));
}

function appliedFromTracked(job: Dict): Dict {
  return {
    id: Math.max(200, ...state.applied.map((item: Dict) => item.id)) + 1,
    userId: 1,
    trackedJobId: job.id,
    platform: job.platform,
    jobId: job.jobId,
    title: job.title,
    company: job.company,
    location: job.location,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryInterval: job.salaryInterval,
    jobType: job.jobType,
    description: job.description,
    jobUrl: job.jobUrl,
    applicationStatus: "applied",
    firstTrackedAt: job.firstSeenAt,
    appliedAt: new Date("2026-08-29T18:00:00.000Z"),
    interviewAt: null,
    offerAt: null,
    resolvedAt: null,
    notes: null,
  };
}

function sourceHealth() {
  return ["indeed", "linkedin", "adzuna", "themuse", "remotive", "remoteok"].map((platform, index) => ({
    platform,
    lastSuccessAt: new Date(`2026-08-${String(24 - index).padStart(2, "0")}T16:00:00.000Z`),
    lastAttemptAt: new Date(`2026-08-${String(24 - index).padStart(2, "0")}T16:00:00.000Z`),
    lastError: null,
    totalAttempts: 18 - index,
    totalFailures: index === 1 ? 2 : 0,
  }));
}

function noteCounts() {
  return state.notes.reduce((result: Dict, note: Dict) => {
    result[note.jobId] = (result[note.jobId] ?? 0) + 1;
    return result;
  }, {});
}

async function execute(path: string, input: Dict | undefined): Promise<any> {
  switch (path) {
    case "auth.me": return { id: 1, onboardingCompleted: 1, createdAt, updatedAt };
    case "environment.status": return { environment: "showroom", label: "Deterministic showroom", activeProviderLabel: `${state.llm.activeProvider} (simulated)`, isConfigured: !!state.llm.keys[state.llm.activeProvider], errors: [] };
    case "onboarding.getProfile": return { ...state.profile };
    case "onboarding.getJobTitles": return state.titles.map((title: Dict) => ({ ...title }));
    case "onboarding.saveProfile": state.profile = { ...state.profile, ...input }; return { success: true };
    case "onboarding.saveJobTitles": state.titles = input?.titles.map((item: Dict, index: number) => ({ id: index + 1, ...item, createdAt })) ?? state.titles; return { success: true };
    case "onboarding.updateJobTitleStatus": { const title = state.titles.find((item: Dict) => item.id === input?.titleId); if (title) title.isActive = input?.isActive; return { success: true }; }
    case "onboarding.generateJobTitles": return { titles: ["Community Outreach Specialist", "Documentation Coordinator", "Program Operations Assistant", "Civic Data Assistant", "Member Support Coordinator"] };
    case "onboarding.uploadResumeAndParse": return { success: true, parsedProfile: { ...state.profile }, message: "Fictional résumé parsed inside the browser." };

    case "personalized.getEligibleJobs": return eligibleJobs().slice(0, input?.limit ?? undefined);
    case "personalized.getBoardJobs": return state.jobs.filter((job: Dict) => !["applied", "rejected"].includes(job.status));
    case "personalized.getAppliedJobs": return state.applied.map((job: Dict) => ({ ...job }));
    case "personalized.getTotalJobCount": return state.jobs.length;
    case "personalized.getPendingJobCounts": return { unanalyzedJobs: state.jobs.filter((job: Dict) => !job.aiAnalysis).length, totalJobs: state.jobs.length };
    case "personalized.getSystemStats": return { totalTrackedJobs: state.jobs.length, totalEligibleJobs: eligibleJobs().length, systemUptime: "28 days", firstScanDate: "Aug 1, 2026" };
    case "personalized.getUserProfile": return { state: state.profile.state, city: state.profile.city, stateAbbr: "AZ", remotePreference: state.profile.remotePreference, educationLevel: state.profile.educationLevel, yearsExperience: state.profile.yearsExperience, skillsParsed: state.profile.skillsParsed.map((item: Dict) => item.skill).join(", "), searchRadiusMiles: state.profile.searchRadiusMiles, minSalary: state.profile.minSalary, salaryFilterEnabled: state.profile.salaryFilterEnabled, isRealProfile: true };
    case "personalized.getCurrentScanProgress": return null;
    case "personalized.getLastGlobalSearch": return { id: 601, userId: 1, platform: "multi", scanType: "broad_search", searchTerms: "Coordination, operations, civic data", location: "Phoenix, AZ + Remote", radiusMiles: 35, totalJobsFound: 12 + state.scanRevision * 3, newJobsFound: 4, status: "completed", errorMessage: null, currentPhase: "Complete", currentProgress: 12, totalProgress: 12, progressMessage: "Search complete: deterministic fictional listings loaded", lastProgressUpdate: updatedAt, completedSearches: [], operationPaused: false, operationCancelled: false, startedAt: new Date("2026-08-24T15:00:00.000Z"), completedAt: updatedAt };
    case "personalized.getLastAIAnalysis": return { id: 602, userId: 1, platform: "multi", scanType: "ai_analysis", searchTerms: "All new fictional listings", location: "Showroom fixture", radiusMiles: 0, totalJobsFound: state.jobs.length, newJobsFound: eligibleJobs().length, status: "completed", errorMessage: null, currentPhase: "Complete", currentProgress: state.jobs.length, totalProgress: state.jobs.length, progressMessage: `Analysis complete: ${eligibleJobs().length} eligible, ${Math.max(0, state.jobs.length - eligibleJobs().length)} ineligible`, lastProgressUpdate: updatedAt, completedSearches: [], operationPaused: false, operationCancelled: false, startedAt: updatedAt, completedAt: updatedAt };
    case "personalized.getDuplicateGroups": return { groups: [], lookup: {}, totalDuplicates: 0 };
    case "personalized.exportEligibleJobsCSV": return serializeCsv([
      ["Title", "Company", "Location", "Salary Min", "Salary Max", "Job Type", "Date Posted", "URL", "Status"],
      ...eligibleJobs().map((job: Dict) => [job.title, job.company, job.location, job.salaryMin, job.salaryMax, job.jobType, job.datePosted, job.jobUrl, job.status]),
    ]);
    case "personalized.runGlobalSearch": state.scanRevision += 1; return { success: true, message: "Loaded 12 deterministic fictional listings from the showroom fixture.", totalJobsFound: 12, newJobsFound: 4, failedSearchCount: 0 };
    case "personalized.runAIAnalysis": for (const job of state.jobs) if (!job.aiAnalysis) job.aiAnalysis = { eligible: true, reason: "Eligible in the showroom scenario.", confidence: 90, redFlags: [] }; return { success: true, message: `Analyzed ${state.jobs.length} fictional listings without an external AI call.`, eligibleJobs: eligibleJobs().length, filteredOut: 0 };
    case "personalized.runFitScoring": for (const [index, job] of state.jobs.entries()) if (job.aiAnalysis) job.aiAnalysis = { ...job.aiAnalysis, fitScore: job.aiAnalysis.fitScore ?? 82 - index * 3, fitDetails: job.aiAnalysis.fitDetails ?? { skillsMatch: 84, educationMatch: 100, experienceMatch: 80, locationMatch: 92, notes: "Deterministic showroom score." }, scoredAt: "2026-08-29T18:00:00.000Z" }; return { success: true, message: `Scored ${eligibleJobs().length} eligible fictional jobs.` };
    case "personalized.markJobAsApplied": { const job = state.jobs.find((item: Dict) => item.id === input?.jobId); if (!job) return { success: false, message: "Job not found" }; if (state.applied.some((item: Dict) => item.trackedJobId === job.id)) return { success: false, message: "Job already marked as applied" }; job.status = "applied"; state.applied.unshift(appliedFromTracked(job)); return { success: true, message: "Job marked as applied" }; }
    case "personalized.bulkMarkApplied": { let applied = 0; for (const id of input?.jobIds ?? []) { const job = state.jobs.find((item: Dict) => item.id === id); if (job && job.status !== "applied") { job.status = "applied"; state.applied.unshift(appliedFromTracked(job)); applied += 1; } } return { success: true, applied, skipped: (input?.jobIds?.length ?? 0) - applied }; }
    case "personalized.bulkRejectJobs": for (const id of input?.jobIds ?? []) { const job = state.jobs.find((item: Dict) => item.id === id); if (job) job.status = "rejected"; } return { success: true, rejected: input?.jobIds?.length ?? 0 };
    case "personalized.removeAppliedJob": state.applied = state.applied.filter((job: Dict) => job.id !== input?.jobId); return { success: true, message: "Job removed from applied list" };
    case "personalized.updateApplicationStatus": { const job = state.applied.find((item: Dict) => item.id === input?.jobId); if (job) { job.applicationStatus = input?.status; if (input?.notes !== undefined) job.notes = input.notes; } return { success: true }; }
    case "personalized.cleanDatabase": return { success: true, message: "Showroom data is protected; the original fictional fixture remains available." };
    case "personalized.nukeEverything": resetShowroomState(); return { success: true, message: "Showroom restored to its fictional starting state; no local or external data was deleted." };
    case "personalized.pauseOperation": return { success: true, message: "Showroom operation paused" };
    case "personalized.resumeOperation": return { success: true, message: "Showroom operation resumed" };
    case "personalized.cancelOperation": return { success: true, message: "Showroom operation cancelled" };

    case "automation.getSetup": return { profile: { ...state.applicationProfile }, gmail: { ...state.gmail }, slack: { ...state.slack }, monitoring: { ...state.monitoring } };
    case "automation.getApplicationPacket": { const job = state.jobs.find((item: Dict) => item.id === input?.jobId); if (!job) throw new Error("Job not found"); return { job: { ...job }, applicant: { ...state.applicationProfile }, background: { educationLevel: state.profile.educationLevel, yearsExperience: state.profile.yearsExperience, skills: state.profile.skillsRaw, resumeText: state.profile.resumeText }, instructions: ["Open the fictional posting and begin its application form.", "Use only the supplied fictional answers.", "Never invent sensitive information.", "Pause on final review; the user approves every submission.", "Return to Job Matrix and record the application."] }; }
    case "automation.listInbox": return state.inbox.map((message: Dict) => ({ ...message, application: message.appliedJobId ? state.applied.find((job: Dict) => job.id === message.appliedJobId) ?? null : null }));
    case "automation.markResponseReviewed": { const message = state.inbox.find((item: Dict) => item.id === input?.messageId); if (message) { message.needsReview = false; message.reviewedAt = updatedAt; } return { success: true }; }
    case "automation.linkResponse": { const message = state.inbox.find((item: Dict) => item.id === input?.messageId); if (message) { message.appliedJobId = input?.appliedJobId; message.needsReview = false; } return { success: true }; }
    case "automation.setQueued": { const job = state.jobs.find((item: Dict) => item.id === input?.jobId); if (job) job.status = input?.queued ? "interested" : "viewed"; return { success: true }; }
    case "automation.bulkQueue": { let queued = 0; for (const id of input?.jobIds ?? []) { const job = state.jobs.find((item: Dict) => item.id === id); if (job && !["applied", "rejected"].includes(job.status)) { job.status = "interested"; queued += 1; } } return { success: true, queued }; }
    case "automation.saveApplicationProfile": {
      const values = Object.fromEntries(Object.entries(input ?? {}).map(([key, value]) => [key, value === "" ? null : value]));
      Object.assign(state.applicationProfile, values, { updatedAt });
      return { success: true };
    }
    case "automation.uploadResume": {
      const fileName = String(input?.fileName ?? "fictional-resume.pdf").split(/[\\/]/).pop() || "fictional-resume.pdf";
      Object.assign(state.applicationProfile, { resumeFileName: fileName, resumeUrl: null, updatedAt });
      return { success: true, fileName, url: null };
    }
    case "automation.saveGmailClient": {
      state.gmail = {
        clientConfigured: true,
        connected: false,
        email: null,
        connectedAt: null,
        clientIdMasked: maskedValue(input?.clientId),
      };
      Object.assign(state.monitoring, { enabled: false, lastCheckedAt: null });
      state.settings.inboxMonitoringEnabled = 0;
      return { ...state.gmail };
    }
    case "automation.createGmailAuthUrl": {
      if (!state.gmail.clientConfigured) throw new Error("Save a fictional OAuth client before connecting Gmail.");
      Object.assign(state.gmail, { connected: true, email: "jordan@example.com", connectedAt: updatedAt });
      const origin = typeof window === "undefined" ? new URL(String(input?.origin)).origin : window.location.origin;
      return { url: `${origin}/showroom/gmail-connected` };
    }
    case "automation.disconnectGmail": {
      Object.assign(state.gmail, { connected: false, email: null, connectedAt: null });
      Object.assign(state.monitoring, { enabled: false, lastCheckedAt: null });
      state.settings.inboxMonitoringEnabled = 0;
      return { success: true };
    }
    case "automation.saveSlackWebhook": {
      const webhookUrl = String(input?.webhookUrl ?? "").trim();
      state.slack = webhookUrl
        ? { configured: true, masked: "https://hooks.slack.com/••••/showroom" }
        : { configured: false, masked: null };
      return { ...state.slack };
    }
    case "automation.testSlack": return state.slack.configured
      ? { success: true, message: "Showroom Slack alert simulated; no external service was contacted." }
      : { success: false, message: "Save a fictional Slack webhook first; no external service was contacted." };
    case "automation.updateMonitoring": {
      if (input?.enabled && !state.gmail.connected) throw new Error("Connect Gmail before turning on inbox monitoring.");
      Object.assign(state.monitoring, { enabled: !!input?.enabled, notifyOnEmployerResponse: !!input?.notifyOnEmployerResponse });
      state.settings.inboxMonitoringEnabled = input?.enabled ? 1 : 0;
      state.settings.notifyOnEmployerResponse = input?.notifyOnEmployerResponse ? 1 : 0;
      return { success: true };
    }
    case "automation.checkInboxNow": state.monitoring.lastCheckedAt = updatedAt; state.settings.inboxLastCheckedAt = updatedAt; return { success: true, message: "Showroom inbox check simulated; one fictional response is available and no external service was contacted.", found: 1 };

    case "notes.getJobNotes": return state.notes.filter((note: Dict) => note.jobId === input?.jobId).map((note: Dict) => ({ ...note }));
    case "notes.getNoteCounts": return noteCounts();
    case "notes.addNote": state.notes.unshift({ id: Math.max(300, ...state.notes.map((note: Dict) => note.id)) + 1, userId: 1, createdAt: updatedAt, ...input }); return { success: true };
    case "notes.deleteNote": state.notes = state.notes.filter((note: Dict) => note.id !== input?.noteId); return { success: true };

    case "presets.list": return state.presets.map((preset: Dict) => ({ ...preset }));
    case "presets.create": { const id = Math.max(500, ...state.presets.map((preset: Dict) => preset.id)) + 1; state.presets.push({ id, userId: 1, createdAt: updatedAt, updatedAt, lastUsedAt: null, isDefault: 0, ...input }); return { success: true, id }; }
    case "presets.update": { const preset = state.presets.find((item: Dict) => item.id === input?.id); if (preset) Object.assign(preset, input, { updatedAt }); return { success: true }; }
    case "presets.delete": state.presets = state.presets.filter((preset: Dict) => preset.id !== input?.id); return { success: true };
    case "presets.activate": { const preset = state.presets.find((item: Dict) => item.id === input?.id); if (preset) { state.profile.city = preset.location.split(",")[0]; state.profile.remotePreference = preset.remotePreference; state.profile.searchRadiusMiles = preset.radiusMiles; state.enabledPlatforms = [...preset.platforms]; preset.lastUsedAt = updatedAt; } return { success: true, locationWarning: null }; }

    case "settings.getLlm": return llm();
    case "settings.getSettings": return { ...state.settings, enabledPlatforms: [...state.enabledPlatforms] };
    case "settings.getEnabledPlatforms": return [...state.enabledPlatforms];
    case "settings.getDataSources": return dataSources();
    case "settings.updatePlatforms": state.enabledPlatforms = [...(input?.enabledPlatforms ?? state.enabledPlatforms)]; return { success: true, platforms: [...state.enabledPlatforms] };
    case "settings.updateNotifications": Object.assign(state.settings, input); return { success: true };
    case "settings.updateAutoScan": Object.assign(state.settings, input); return { success: true };
    case "settings.saveLlm": {
      if (input?.activeProvider) state.llm.activeProvider = input.activeProvider;
      if (input?.rateLimitRps !== undefined) state.llm.rateLimitRps = input.rateLimitRps;
      for (const provider of Object.keys(providerDefaults)) {
        const key = input?.[`${provider}Key`];
        const model = input?.[`${provider}Model`];
        if (key) state.llm.keys[provider] = key;
        if (model) state.llm.models[provider] = model;
      }
      return llm();
    }
    case "settings.clearProviderKey": {
      const provider = input?.provider;
      if (provider && provider in state.llm.keys) state.llm.keys[provider] = null;
      return llm();
    }
    case "settings.testProvider": return input?.apiKey && input?.model
      ? { ok: true, message: "Showroom provider check simulated; no external AI provider was contacted.", latencyMs: 18 }
      : { ok: false, message: "Enter a fictional API key and model; no external AI provider was contacted.", latencyMs: 0 };
    case "settings.testSavedProvider": {
      const provider = String(input?.provider ?? "");
      return state.llm.keys[provider]
        ? { ok: true, message: "Showroom saved-provider check simulated; no external AI provider was contacted.", latencyMs: 18 }
        : { ok: false, message: `No fictional API key is saved for ${provider}; no external AI provider was contacted.`, latencyMs: 0 };
    }
    case "settings.saveDataSource": {
      const source = String(input?.source ?? "");
      state.dataSourceCredentials[source] = { ...(state.dataSourceCredentials[source] ?? {}), ...(input?.fields ?? {}) };
      return dataSources();
    }
    case "settings.clearDataSource": state.dataSourceCredentials[String(input?.source ?? "")] = {}; return dataSources();
    case "settings.testDataSource": {
      const source = sourceDefinitions.find(item => item.id === input?.source);
      if (!source) return { ok: false, message: "Unknown fictional data source; no external source was contacted.", latencyMs: 0 };
      const credentials = { ...(state.dataSourceCredentials[source.id] ?? {}), ...(input?.fields ?? {}) };
      return sourceIsConfigured(source, credentials)
        ? { ok: true, message: "Showroom source check simulated; no external source was contacted.", latencyMs: 12 }
        : { ok: false, message: "Enter all required fictional credentials; no external source was contacted.", latencyMs: 0 };
    }
    case "settings.sendTestNotification": return { success: true, message: "Showroom notification simulated; no external service was contacted." };

    case "indeed.getScanHistory": return [await execute("personalized.getLastGlobalSearch", undefined), await execute("personalized.getLastAIAnalysis", undefined)];
    case "scrapers.health": return sourceHealth();
    default: throw new Error(`Showroom fixture does not implement ${path}`);
  }
}

export function showroomLink(): TRPCLink<AppRouter> {
  return () => ({ op }) => observable(observer => {
    let cancelled = false;
    Promise.resolve()
      .then(() => execute(op.path, op.input as Dict | undefined))
      .then(data => {
        if (cancelled) return;
        observer.next({ result: { data } });
        observer.complete();
      })
      .catch(error => {
        if (!cancelled) observer.error(error);
      });
    return () => { cancelled = true; };
  });
}
