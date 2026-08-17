import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { ENV } from "./_core/env";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { ensurePythonVenv, getCleanPythonEnv } from "./python_manager";
import {
  registerScrapeProcess,
  terminateScrapeProcess,
  type ScrapeProcessOwner,
} from "./scrape-process-registry";
import { PLATFORM_TIER, type PlatformId } from "../shared/platforms";
import { getSource } from "./sources";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import {
  saveJobPreferences,
  getJobPreferences,
  saveTrackedJob,
  getTrackedJobs,
  updateJobStatus,
  createJobScanHistory,
  updateJobScanHistory,
  getRecentJobScans,
  recordScraperAttempt,
  type ScraperPlatform,
} from "./db";

/** Supported job platforms — see shared/platforms.ts for tier classification. */
export const SUPPORTED_PLATFORMS = [
  "indeed", "glassdoor", "linkedin", "ziprecruiter", "google",
  "adzuna", "usajobs", "jooble", "themuse", "remotive", "remoteok",
] as const;
export type SupportedPlatform = typeof SUPPORTED_PLATFORMS[number];
const JOB_SCRAPER_TIMEOUT_MS = 180000;
const MAX_SCRAPER_STDOUT_BYTES = 4 * 1024 * 1024;
const MAX_SCRAPER_STDERR_BYTES = 512 * 1024;
const MAX_SCRAPER_JOBS = 75;

function boundedExternalText(value: unknown, max: number, fallback = ""): string {
  const text = typeof value === "string" ? value : fallback;
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 14))}\n[truncated]`;
}

function validateScraperResult(value: unknown): JobSearchResult {
  if (!value || typeof value !== "object") throw new Error("Scraper returned an invalid object.");
  const result = value as Partial<JobSearchResult>;
  if (!Array.isArray(result.jobs)) throw new Error("Scraper returned an invalid jobs list.");
  const jobs = result.jobs.slice(0, MAX_SCRAPER_JOBS).map(job => ({
    ...job,
    id: boundedExternalText(job.id, 500),
    title: boundedExternalText(job.title, 300, "Untitled role"),
    company: boundedExternalText(job.company, 300, "Unknown company"),
    location: job.location == null ? null : boundedExternalText(job.location, 500),
    city: job.city == null ? null : boundedExternalText(job.city, 160),
    state: job.state == null ? null : boundedExternalText(job.state, 80),
    salary_interval: job.salary_interval == null ? null : boundedExternalText(job.salary_interval, 80),
    job_type: job.job_type == null ? null : boundedExternalText(job.job_type, 120),
    description: job.description == null ? null : boundedExternalText(job.description, 20_000),
    job_url: boundedExternalText(job.job_url, 2_048),
    date_posted: job.date_posted == null ? null : boundedExternalText(job.date_posted, 80),
    site: boundedExternalText(job.site, 80),
  }));
  return {
    success: result.success === true,
    jobs,
    count: jobs.length,
    platformBreakdown: result.platformBreakdown && typeof result.platformBreakdown === "object"
      ? result.platformBreakdown
      : {},
    error: typeof result.error === "string" ? boundedExternalText(result.error, 2_000) : undefined,
  };
}

/** Default platforms if none specified. Mixes Tier-1 no-auth + green Tier-2. */
export const DEFAULT_PLATFORMS: SupportedPlatform[] = ["indeed", "linkedin", "adzuna", "remotive", "remoteok", "themuse"];

export interface JobSearchResult {
  success: boolean;
  jobs: Array<{
    id: string;
    title: string;
    company: string;
    location: string | null;
    city: string | null;
    state: string | null;
    salary_min: number | null;
    salary_max: number | null;
    salary_interval: string | null;
    job_type: string | null;
    description: string | null;
    job_url: string;
    date_posted: string | null;
    site: string; // Which platform this job came from
  }>;
  count: number;
  platformBreakdown: Record<string, number>;
  error?: string;
}

/**
 * Search jobs across multiple platforms. Fans out by tier (see D-019):
 *   Tier 1 — TypeScript adapters in `server/sources/` hitting real APIs.
 *   Tier 2 — Python/JobSpy subprocess (legacy path).
 * Tier-1 adapters run in parallel; the Tier-2 subprocess runs once with
 * the full list of Tier-2 platforms. Results from both tiers are merged
 * into a single JobSearchResult. Per-platform health telemetry covers
 * both paths.
 */
export async function searchJobs(
  searchTerm: string,
  location: string,
  radiusMiles: number,
  resultsWanted: number = 50,
  hoursOld: number = 336, // Default: 14 days
  platforms: SupportedPlatform[] = DEFAULT_PLATFORMS,
  processOwner?: ScrapeProcessOwner,
): Promise<JobSearchResult> {
  const tier1: SupportedPlatform[] = [];
  const tier2: SupportedPlatform[] = [];
  for (const p of platforms) {
    if (PLATFORM_TIER[p as PlatformId] === 1) tier1.push(p);
    else tier2.push(p);
  }

  const tier1Calls = tier1.map(async (id): Promise<JobSearchResult> => {
    const source = getSource(id as PlatformId);
    if (!source) {
      return {
        success: false,
        jobs: [],
        count: 0,
        platformBreakdown: { [id]: 0 },
        error: `No adapter registered for ${id}`,
      };
    }
    if (!source.isConfigured()) {
      return {
        success: false,
        jobs: [],
        count: 0,
        platformBreakdown: { [id]: 0 },
        error: `${source.label} credentials not configured`,
      };
    }
    try {
      return await source.fetch({ searchTerm, location, radiusMiles, resultsWanted, hoursOld });
    } catch (e: any) {
      return {
        success: false,
        jobs: [],
        count: 0,
        platformBreakdown: { [id]: 0 },
        error: e?.message ?? `${source.label} adapter threw`,
      };
    }
  });

  const attempts: Array<Promise<JobSearchResult>> = [...tier1Calls];
  if (tier2.length > 0) {
    attempts.push(scrapeViaJobSpy(searchTerm, location, radiusMiles, resultsWanted, hoursOld, tier2, processOwner));
  }

  if (attempts.length === 0) {
    return {
      success: false,
      jobs: [],
      count: 0,
      platformBreakdown: {},
      error: "No job platforms are enabled.",
    };
  }

  const results = await Promise.all(attempts);

  // Cross-tier dedupe: Adzuna re-indexes many of the same postings JobSpy
  // sees on Indeed/LinkedIn. Tracked-jobs uniqueness is (userId, platform,
  // jobId) — that catches within-tier duplicates but NOT the same logical
  // posting surfacing under two different platforms. Dedupe key is
  // (title, company, city), lowercased+trimmed. First occurrence wins;
  // since Tier-1 adapters run before the Tier-2 subprocess in this fan-out,
  // Adzuna rows survive over their JobSpy twins — Adzuna's data quality is
  // higher and the redirect URL still lands on the source site.
  const seen = new Set<string>();
  const dedupedJobs: typeof results[number]["jobs"] = [];
  const droppedByPlatform: Record<string, number> = {};
  for (const r of results) {
    for (const job of r.jobs) {
      const key = [
        (job.title || "").toLowerCase().trim(),
        (job.company || "").toLowerCase().trim(),
        ((job.city || job.location || "").toLowerCase().split(",")[0] || "").trim(),
      ].join("|");
      // Skip dedupe when the key is degenerate (missing title or company)
      // to avoid collapsing real distinct jobs into one bucket.
      if (key.length < 4 || !job.title || !job.company) {
        dedupedJobs.push(job);
        continue;
      }
      if (seen.has(key)) {
        droppedByPlatform[job.site] = (droppedByPlatform[job.site] ?? 0) + 1;
        continue;
      }
      seen.add(key);
      dedupedJobs.push(job);
    }
  }

  const platformBreakdown: Record<string, number> = {};
  for (const job of dedupedJobs) {
    platformBreakdown[job.site] = (platformBreakdown[job.site] ?? 0) + 1;
  }
  // Preserve a 0-row entry for every platform we attempted, so health
  // telemetry below still records the attempt even after dedupe wipes
  // a platform's contribution.
  for (const r of results) {
    if (!r.platformBreakdown) continue;
    for (const k of Object.keys(r.platformBreakdown)) {
      if (!(k in platformBreakdown)) platformBreakdown[k] = 0;
    }
  }
  if (Object.values(droppedByPlatform).some((n) => n > 0)) {
    const summary = Object.entries(droppedByPlatform).map(([p, n]) => `${p}: ${n}`).join(", ");
    console.log(`[Source Dispatch] Cross-tier dedupe dropped ${summary}`);
  }

  const anySuccess = results.some((r) => r.success);
  const firstError = results.find((r) => r.error)?.error;
  const merged: JobSearchResult = {
    success: anySuccess,
    jobs: dedupedJobs,
    count: dedupedJobs.length,
    platformBreakdown,
    error: anySuccess ? undefined : firstError,
  };

  // Fire-and-forget telemetry for every platform the caller asked for.
  // 0 rows from a search like "software engineer / remote" counts as a
  // failure even if the call succeeded — matches the pre-D19 semantics.
  void (async () => {
    for (const platform of platforms) {
      const rows = merged.platformBreakdown?.[platform] ?? 0;
      const platformResult = results.find((r) => r.platformBreakdown?.[platform] !== undefined);
      const ok = (platformResult?.success ?? false) && rows > 0;
      const err = ok
        ? null
        : platformResult?.error ?? (rows === 0 ? "Returned 0 rows" : "Failed");
      try {
        await recordScraperAttempt(platform as ScraperPlatform, ok, err);
      } catch (e) {
        console.warn(`[Source Health] could not record ${platform}:`, e);
      }
    }
  })();

  return merged;
}

/**
 * Tier-2 path: shell out to the JobSpy Python subprocess. This is the
 * legacy scrape implementation, lifted out of `searchJobs` when D-019
 * introduced the tier model. No behavior change for Tier-2 callers.
 */
function scrapeViaJobSpy(
  searchTerm: string,
  location: string,
  radiusMiles: number,
  resultsWanted: number,
  hoursOld: number,
  platforms: SupportedPlatform[],
  processOwner?: ScrapeProcessOwner,
): Promise<JobSearchResult> {
  return new Promise(async (resolve) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let settled = false;
    const finish = (result: JobSearchResult) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      resolve(result);
    };

    const pythonScript = path.join(__dirname, "job_scraper.py");
    const platformsStr = platforms.join(",");
    const args = [searchTerm, location, platformsStr, radiusMiles.toString(), resultsWanted.toString()];
    if (hoursOld) {
      args.push(hoursOld.toString());
    }

    let venvPython: string;
    try {
      venvPython = await ensurePythonVenv();
    } catch (err) {
      console.error("[Job Scraper] Python venv not available:", err);
      finish({
        success: false,
        jobs: [],
        count: 0,
        platformBreakdown: {},
        error: "Python environment not available. Please try again.",
      });
      return;
    }
    console.log(`[Job Scraper] Using venv Python: ${venvPython}`);
    console.log(`[Job Scraper] Searching: "${searchTerm}" in ${location} on [${platformsStr}]`);

    const cleanEnv = getCleanPythonEnv();
    const pythonProcess = spawn(venvPython, [pythonScript, ...args], { env: cleanEnv });
    registerScrapeProcess(pythonProcess, processOwner);
    timeoutId = setTimeout(() => {
      console.error(`[Job Scraper] Timeout after ${JOB_SCRAPER_TIMEOUT_MS}ms for "${searchTerm}" in ${location}`);
      terminateScrapeProcess(pythonProcess);
      finish({
        success: false,
        jobs: [],
        count: 0,
        platformBreakdown: {},
        error: "Job scraper timed out",
      });
    }, JOB_SCRAPER_TIMEOUT_MS);

    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;

    pythonProcess.stdout.on("data", (data) => {
      stdoutBytes += Buffer.byteLength(data);
      if (stdoutBytes > MAX_SCRAPER_STDOUT_BYTES) {
        terminateScrapeProcess(pythonProcess);
        finish({
          success: false,
          jobs: [],
          count: 0,
          platformBreakdown: {},
          error: "Job source returned too much data.",
        });
        return;
      }
      stdout += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      stderrBytes += Buffer.byteLength(data);
      if (stderrBytes > MAX_SCRAPER_STDERR_BYTES) {
        terminateScrapeProcess(pythonProcess);
        finish({
          success: false,
          jobs: [],
          count: 0,
          platformBreakdown: {},
          error: "Job scraper produced too much diagnostic output.",
        });
        return;
      }
      stderr += data.toString();
    });

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        console.error("[Job Scraper] Python script failed:", stderr);
        finish({
          success: false,
          jobs: [],
          count: 0,
          platformBreakdown: {},
          error: stderr || "Python script failed",
        });
        return;
      }

      try {
        const result = validateScraperResult(JSON.parse(stdout));
        finish(result);
      } catch (error) {
        console.error("[Job Scraper] Failed to parse JSON:", error);
        console.error("[Job Scraper] Raw stdout (first 500 chars):", stdout.substring(0, 500));
        finish({
          success: false,
          jobs: [],
          count: 0,
          platformBreakdown: {},
          error: `Failed to parse response: ${error}`,
        });
      }
    });

    pythonProcess.on("error", (error) => {
      console.error("[Job Scraper] Failed to spawn process:", error);
      finish({
        success: false,
        jobs: [],
        count: 0,
        platformBreakdown: {},
        error: `Failed to start job scraper: ${error.message}`,
      });
    });
  });
}

/**
 * Backwards-compatible wrapper: search Indeed only
 */
export async function searchIndeedJobs(
  searchTerm: string,
  location: string,
  radiusMiles: number,
  resultsWanted: number = 50,
  hoursOld: number = 336
): Promise<JobSearchResult> {
  return searchJobs(searchTerm, location, radiusMiles, resultsWanted, hoursOld, ["indeed"]);
}

export const indeedRouter = router({
  // Save or update job preferences
  savePreferences: protectedProcedure
    .input(
      z.object({
        targetTitles: z.string().trim().max(1_500), // Comma-separated job titles
        location: z.string().trim().max(240),
        radiusMiles: z.number().min(1).max(500).default(50),
        remoteOnly: z.boolean().default(false),
        monitoringEnabled: z.boolean().default(true),
        scanIntervalMinutes: z.number().min(5).max(10_080).default(30),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await saveJobPreferences({
        userId: ctx.user.id,
        targetTitles: input.targetTitles,
        location: input.location,
        radiusMiles: input.radiusMiles,
        minSalary: null,
        maxSalary: null,
        jobType: null,
        remoteOnly: input.remoteOnly ? 1 : 0,
        monitoringEnabled: input.monitoringEnabled ? 1 : 0,
        scanIntervalMinutes: input.scanIntervalMinutes,
      });

      return { success: true };
    }),

  // Get user's job preferences
  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    const prefs = await getJobPreferences(ctx.user.id);
    return prefs;
  }),

  // Manual job search - scan Indeed for jobs matching preferences
  scanJobs: protectedProcedure.mutation(async ({ ctx }) => {
    if (ENV.hostedMode) {
      throw new Error("Use Global Search in the hosted edition so the daily search allowance can be enforced.");
    }
    const prefs = await getJobPreferences(ctx.user.id);

    if (!prefs) {
      throw new Error("No job preferences found. Please set your preferences first.");
    }

    // Create scan history record
    const scanId = await createJobScanHistory({
      userId: ctx.user.id,
      platform: "indeed",
      scanType: "broad_search",
      searchTerms: prefs.targetTitles,
      location: prefs.location,
      radiusMiles: prefs.radiusMiles,
      totalJobsFound: 0,
      newJobsFound: 0,
      status: "running",
      errorMessage: null,
      completedAt: null,
    });

    try {
      // Split comma-separated job titles
      const jobTitles = prefs.targetTitles
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      let totalJobsFound = 0;
      let newJobsFound = 0;

      // Search for each job title
      for (const title of jobTitles) {
        const result = await searchIndeedJobs(
          title,
          prefs.location,
          prefs.radiusMiles,
          50 // Get up to 50 results per title
        );

        if (!result.success) {
          console.error(`[Indeed] Search failed for "${title}":`, result.error);
          continue;
        }

        totalJobsFound += result.count;

        // Save each job to database
        for (const job of result.jobs) {
          console.log('[Indeed] Processing job:', { id: job.id, title: job.title });
          const saved = await saveTrackedJob({
            userId: ctx.user.id,
            platform: (job.site as "indeed" | "glassdoor" | "linkedin" | "ziprecruiter") || "indeed",
            jobId: job.id,
            title: job.title,
            company: job.company || "Unknown Company",
            location: job.location,
            city: job.city,
            state: job.state,
            salaryMin: job.salary_min,
            salaryMax: job.salary_max,
            salaryInterval: job.salary_interval,
            jobType: job.job_type,
            description: job.description,
            jobUrl: job.job_url,
            datePosted: job.date_posted,
            status: "new",
            aiAnalysis: null,
          });

          if (saved.isNew) {
            newJobsFound++;
          }
        }
      }

      // Update scan history as completed
      await updateJobScanHistory(scanId, {
        status: "completed",
        totalJobsFound,
        newJobsFound,
        completedAt: new Date(),
      });

      return {
        success: true,
        totalJobsFound,
        newJobsFound,
      };
    } catch (error) {
      // Update scan history as failed
      await updateJobScanHistory(scanId, {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        completedAt: new Date(),
      });

      throw error;
    }
  }),

  // Get tracked jobs
  getTrackedJobs: protectedProcedure
    .input(
      z
        .object({
          platform: z.enum(["indeed", "glassdoor", "linkedin", "ziprecruiter"]).optional(),
          status: z.enum(["new", "viewed", "applied", "interested", "rejected"]).optional(),
          limit: z.number().default(50),
          offset: z.number().default(0),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const jobs = await getTrackedJobs(ctx.user.id, input);
      return jobs;
    }),

  // Update job status (mark as viewed, applied, etc.)
  updateJobStatus: protectedProcedure
    .input(
      z.object({
        jobId: z.number(),
        status: z.enum(["new", "viewed", "applied", "interested", "rejected"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await updateJobStatus(input.jobId, input.status, ctx.user.id);
      return { success: true };
    }),

  // Get recent scan history
  getScanHistory: protectedProcedure
    .input(z.object({ limit: z.number().default(10) }).optional())
    .query(async ({ input, ctx }) => {
      const scans = await getRecentJobScans(ctx.user.id, input?.limit);
      return scans;
    }),

  // Get supported platforms list
  getSupportedPlatforms: protectedProcedure.query(() => {
    return SUPPORTED_PLATFORMS.map(p => ({
      id: p,
      name: p === "ziprecruiter" ? "ZipRecruiter" : p.charAt(0).toUpperCase() + p.slice(1),
      tier: PLATFORM_TIER[p as PlatformId],
      description: {
        indeed: "World's #1 job site with millions of listings",
        glassdoor: "Job search with company reviews and salary data",
        linkedin: "Professional network with job opportunities",
        ziprecruiter: "AI-powered job matching platform",
        google: "Google Jobs aggregator across multiple sources",
        adzuna: "Aggregator with a real public API — Settings → Data Sources",
        usajobs: "US federal civilian job postings (free API; needs key + email)",
        jooble: "Worldwide aggregator across many job boards (partner key)",
        themuse: "Early/mid-career roles across tech and media (no-auth API)",
        remotive: "Remote-only positions across categories (no-auth API)",
        remoteok: "Remote-only tech jobs (no-auth API)",
      }[p] || "",
    }));
  }),
});
