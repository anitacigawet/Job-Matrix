/**
 * Scan Operations Router
 * Handles: Start New Scan, AI Job Filtering, AI Match Scoring, Database Cleanup
 */

import { protectedProcedure, router } from "../_core/trpc";
import { searchJobs, type SupportedPlatform } from "../routers_indeed";
import { bulkSaveTrackedJobs, createJobScanHistory, updateJobScanHistory, getActiveJobTitles } from "../db";
import { loadUserProfileForFilter, loadJobSearchCriteria, loadEnabledPlatforms } from "../user-profile";
import { filterRemoteEligibility, filterDegreeRequirements, filterExperienceRequirements } from "../ai-job-filter-csv";
import { scoreJobFit } from "../services/dedup-and-scoring";
import { getDb } from "../db";
import { trackedJobs, jobScanHistory, userJobTitles, userProfiles, searchPresets, applicationNotes, users, appliedJobs, applicationProfiles, inboxMessages, userSettings, scraperHealth } from "../../drizzle/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { killAllScrapeProcesses } from "../scrape-process-registry";
import { normalizeStoredJobSource } from "../services/job-source-id";
import fs from "node:fs";
import path from "node:path";
import { ENV } from "../_core/env";
import { clearStoredSettings } from "../_core/settings";

const OPERATION_CONTROL_POLL_MS = 2000;
async function enforceOperationControls(scanId: number, db: any) {
  while (true) {
    const [scan] = await db
      .select()
      .from(jobScanHistory)
      .where(eq(jobScanHistory.id, scanId))
      .limit(1);

    if (!scan) return;

    if (scan.operationCancelled) {
      throw new Error("Operation cancelled by user");
    }

    if (scan.operationPaused) {
      await new Promise(resolve => setTimeout(resolve, OPERATION_CONTROL_POLL_MS));
      continue;
    }

    return;
  }
}

async function getLatestRunningScanForUser(userId: number, db: any) {
  const runningScans = await db
    .select()
    .from(jobScanHistory)
    .where(
      and(
        eq(jobScanHistory.userId, userId),
        eq(jobScanHistory.status, "running")
      )
    )
    .orderBy(desc(jobScanHistory.startedAt))
    .limit(1);
  return runningScans[0] ?? null;
}

export const scanRouter = router({
  
  /**
   * PHASE 1: Global Search
   * Searches all job titles across all locations (dynamic from user profile)
   * Saves ALL jobs to database WITHOUT AI filtering
   */
  runGlobalSearch: protectedProcedure.mutation(async ({ ctx }) => {
    const executeSearch = async () => {

    // Load dynamic search criteria from user profile
    const searchCriteria = await loadJobSearchCriteria(ctx.user.id);
    const userProfile = await loadUserProfileForFilter(ctx.user.id);
    const enabledPlatforms = await loadEnabledPlatforms(ctx.user.id);

    if (enabledPlatforms.length === 0) enabledPlatforms.push("indeed");

    console.log(`[Global Search] Enabled platforms: [${enabledPlatforms.join(", ")}]`);
    
    // Get user's job titles from database
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    const targetTitles = await getActiveJobTitles(ctx.user.id);
    
    if (targetTitles.length === 0) {
      throw new Error("No job titles configured. Please complete onboarding first.");
    }
    
    // Check for existing running scan to resume from
    const existingScans = await db.select()
      .from(jobScanHistory)
      .where(
        and(
          eq(jobScanHistory.userId, ctx.user.id),
          eq(jobScanHistory.status, "running")
        )
      )
      .orderBy(jobScanHistory.startedAt)
      .limit(1);
    
    let scanId: number;
    let completedSearches: Array<{title: string, location: string}> = [];
    
    const locationDesc = searchCriteria.locations.map(l => l.description).join(" + ");
    
    if (existingScans.length > 0) {
      scanId = existingScans[0].id;
      completedSearches = existingScans[0].completedSearches || [];
      console.log(`[Global Search] Resuming scan #${scanId} - ${completedSearches.length} searches already completed`);
    } else {
      scanId = await createJobScanHistory({
        userId: ctx.user.id,
        platform: "indeed",
        scanType: "broad_search",
        searchTerms: targetTitles.join(", "),
        location: locationDesc,
        radiusMiles: userProfile.searchRadiusMiles || 50,
        totalJobsFound: 0,
        newJobsFound: 0,
        status: "running",
        errorMessage: null,
        completedAt: null,
        completedSearches: [],
      });
      console.log(`[Global Search] Starting new scan #${scanId}`);
    }

    try {
      let totalJobsFound = 0;
      let newJobsFound = 0;
      let failedSearchCount = 0;
      let firstSearchError: string | undefined;
      const platformBreakdown: Record<string, number> = {};
      
      const allJobs: Array<{
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
        site: string;
      }> = [];

      console.log(`[Global Search] Phase 1: Searching ${searchCriteria.locations.length} locations x ${targetTitles.length} titles on [${enabledPlatforms.join(", ")}]`);
      
      const totalSearches = searchCriteria.locations.length * targetTitles.length;
      let currentSearch = 0;
      
      for (const location of searchCriteria.locations) {
        for (const title of targetTitles) {
          await enforceOperationControls(scanId, db);
          currentSearch++;
          
          const isCompleted = completedSearches.some(
            s => s.title === title && s.location === location.searchTerm
          );
          
          if (isCompleted) {
            console.log(`[Global Search] Skipping ${currentSearch}/${totalSearches} - "${title}" in ${location.description} (already completed)`);
            continue;
          }
          
          const progressMsg = `Searching "${title}" in ${location.description}`;
          console.log(`[Global Search] Progress: ${currentSearch}/${totalSearches} - ${progressMsg}`);
          
          await updateJobScanHistory(scanId, {
            currentPhase: "Global Search",
            currentProgress: currentSearch,
            totalProgress: totalSearches,
            progressMessage: progressMsg,
            lastProgressUpdate: new Date(),
          });
          
          const result = await searchJobs(
            title,
            location.searchTerm,
            location.radiusMiles,
            searchCriteria.resultsPerTitle,
            336, // 14 days
            enabledPlatforms as SupportedPlatform[],
          );

          if (!result.success) {
            console.error(`[Global Search] Search failed for "${title}" in ${location.description}:`, result.error);
            failedSearchCount++;
            if (!firstSearchError) firstSearchError = result.error || "Unknown scrape error";
            continue;
          }

          // Track per-platform breakdown
          if (result.platformBreakdown) {
            for (const [platform, count] of Object.entries(result.platformBreakdown)) {
              platformBreakdown[platform] = (platformBreakdown[platform] || 0) + count;
            }
          }

          console.log(`[Global Search] Found ${result.count} jobs on [${Object.keys(result.platformBreakdown || {}).join(", ")}] (Total so far: ${totalJobsFound + result.count})`);
          totalJobsFound += result.count;
          if (result.jobs) allJobs.push(...result.jobs);
          
          completedSearches.push({ title, location: location.searchTerm });
          
          await updateJobScanHistory(scanId, {
            completedSearches,
          });
        }
      }

      console.log(`[Global Search] Complete: Found ${totalJobsFound} total jobs`);
      console.log(`[Global Search] Saving all jobs to database (no AI filtering)`);

      let savedCount = 0;

      await updateJobScanHistory(scanId, {
        currentPhase: "Saving to Database",
        currentProgress: 0,
        totalProgress: allJobs.length,
        progressMessage: "Saving jobs to database...",
        lastProgressUpdate: new Date(),
      });
      
      const normalizedJobs = allJobs.map((job) => ({
        userId: ctx.user.id,
        platform: normalizeStoredJobSource(job.site) as typeof trackedJobs.$inferInsert.platform,
        jobId: job.id,
        title: job.title,
        company: job.company || "Unknown Company",
        location: job.location || "Unknown",
        city: job.city,
        state: job.state,
        salaryMin: job.salary_min,
        salaryMax: job.salary_max,
        salaryInterval: job.salary_interval,
        jobType: job.job_type,
        description: job.description,
        jobUrl: job.job_url,
        datePosted: job.date_posted,
        status: "new" as const,
        aiAnalysis: null,
      }));

      const SAVE_BATCH_SIZE = 100;
      for (let i = 0; i < normalizedJobs.length; i += SAVE_BATCH_SIZE) {
        await enforceOperationControls(scanId, db);
        const batch = normalizedJobs.slice(i, i + SAVE_BATCH_SIZE);
        const saved = await bulkSaveTrackedJobs(batch);
        newJobsFound += saved.newJobs;
        savedCount += batch.length;
        console.log(`[Global Search] Saving progress: ${savedCount}/${allJobs.length} jobs processed`);
        await updateJobScanHistory(scanId, {
          currentProgress: savedCount,
          progressMessage: `Saved ${savedCount}/${allJobs.length} jobs`,
          lastProgressUpdate: new Date(),
        });
      }

      const allFailed = totalJobsFound === 0 && failedSearchCount > 0;
      const platformSummary = Object.entries(platformBreakdown)
        .map(([p, c]) => `${p}: ${c}`)
        .join(", ");

      // Surface scrape failures honestly. Most common cause is the Python
      // JobSpy venv not being installed — give the user a directly actionable
      // hint rather than a silent "0 jobs found" success.
      const isPythonError = !!firstSearchError && (
        firstSearchError.includes("Python") ||
        firstSearchError.includes("jobspy") ||
        firstSearchError.includes("venv")
      );

      let resultMessage: string;
      if (allFailed) {
        resultMessage = isPythonError
          ? `Scan failed: Python / JobSpy environment not configured. Run \`pip install python-jobspy\` in a venv (see README "Optional: enable scraping").`
          : `Scan failed: all ${failedSearchCount} searches errored. ${firstSearchError ?? ""}`.trim();
      } else if (failedSearchCount > 0) {
        resultMessage = `Found ${totalJobsFound} jobs across [${enabledPlatforms.join(", ")}] (${platformSummary}), saved ${newJobsFound} new ones. ${failedSearchCount} of ${totalSearches} searches failed — check server log.`;
      } else {
        resultMessage = `Found ${totalJobsFound} jobs across [${enabledPlatforms.join(", ")}] (${platformSummary}), saved ${newJobsFound} new ones`;
      }

      // Mark the scan history row honestly. If every per-(title, platform)
      // search errored AND we ended up with zero jobs, this scan FAILED —
      // not "completed with 0 results." The progress card and history
      // queries downstream both look at `status` to decide tone.
      await updateJobScanHistory(scanId, {
        totalJobsFound,
        newJobsFound,
        status: allFailed ? "failed" : "completed",
        progressMessage: resultMessage,
        errorMessage: allFailed ? resultMessage : undefined,
        completedAt: new Date(),
      });

      console.log(`[Global Search] Saved ${newJobsFound} new jobs (${totalJobsFound - newJobsFound} duplicates skipped)`);
      console.log(
        allFailed
          ? `[Global Search] ⚠ ALL SEARCHES FAILED - ${failedSearchCount} of ${totalSearches} searches errored. First error: ${firstSearchError}`
          : `[Global Search] ✅ COMPLETE - Found ${totalJobsFound} jobs, saved ${newJobsFound} new ones${failedSearchCount > 0 ? ` (${failedSearchCount} searches failed)` : ""}`
      );

      return {
        success: !allFailed,
        totalJobsFound,
        newJobsFound,
        failedSearchCount,
        totalSearches,
        platformBreakdown,
        message: resultMessage,
      };

    } catch (error: any) {
      console.error("[Global Search] Error:", error);
      
      await updateJobScanHistory(scanId, {
        status: "failed",
        errorMessage: error.message,
        completedAt: new Date(),
      });

      throw error;
    }
    };

    return executeSearch();
  }),

  /**
   * PHASE 2: AI Job Filtering (Multi-Stage LLM Filtering)
   */
  runAIAnalysis: protectedProcedure.mutation(async ({ ctx }) => {
    console.log("[AI Job Filtering] Starting 3-stage LLM filtering");
    let scanId: number | undefined;

    try {
      const userProfile = await loadUserProfileForFilter(ctx.user.id);
      console.log(`[AI Job Filtering] User profile: state=${userProfile.state}, education=${userProfile.educationLevel}, experience=${userProfile.yearsExperience}`);
      
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const unanalyzedJobs = await db
        .select()
        .from(trackedJobs)
        .where(
          and(
            eq(trackedJobs.userId, ctx.user.id),
            isNull(trackedJobs.aiAnalysis)
          )
        );

      if (unanalyzedJobs.length === 0) {
        console.log("[AI Job Filtering] No unanalyzed jobs found");
        return {
          success: true,
          totalAnalyzed: 0,
          eligible: 0,
          ineligible: 0,
          message: "No unanalyzed jobs found",
        };
      }

      console.log(`[AI Job Filtering] Found ${unanalyzedJobs.length} jobs to analyze`);

      scanId = await createJobScanHistory({
        userId: ctx.user.id,
        platform: "indeed",
        scanType: "ai_analysis",
        searchTerms: "AI Job Filtering - 3 Stage Filter",
        location: `${userProfile.state} / Remote`,
        radiusMiles: 0,
        totalJobsFound: unanalyzedJobs.length,
        newJobsFound: 0,
        status: "running",
        currentPhase: `Stage 1: Remote/${userProfile.state} Eligibility`,
        currentProgress: 0,
        totalProgress: unanalyzedJobs.length,
        progressMessage: "Starting AI Job Filtering...",
        lastProgressUpdate: new Date(),
      });

      // Stage 1: Remote/Location Eligibility
      console.log(`[AI Job Filtering] Starting Stage 1: Remote/${userProfile.state} Eligibility`);
      
      await updateJobScanHistory(scanId, {
        currentPhase: `Stage 1: Remote/${userProfile.state} Eligibility`,
        currentProgress: 0,
        totalProgress: unanalyzedJobs.length,
        progressMessage: `Analyzing remote work eligibility and ${userProfile.state} restrictions...`,
        lastProgressUpdate: new Date(),
      });

      await enforceOperationControls(scanId, db);
      const stage1Result = await filterRemoteEligibility(unanalyzedJobs, userProfile);
      console.log(`[AI Job Filtering] Stage 1 complete: ${stage1Result.eligible.length}/${unanalyzedJobs.length} passed`);

      await updateJobScanHistory(scanId, {
        currentProgress: unanalyzedJobs.length,
        progressMessage: `Stage 1 complete: ${stage1Result.eligible.length}/${unanalyzedJobs.length} jobs passed`,
        lastProgressUpdate: new Date(),
      });

      for (const job of stage1Result.filtered) {
        await db
          .update(trackedJobs)
          .set({
            aiAnalysis: {
              eligible: false,
              reason: `Not remote or excludes ${userProfile.state}`,
              analyzedAt: new Date().toISOString(),
            },
          })
          .where(eq(trackedJobs.id, job.id));
      }

      if (stage1Result.eligible.length === 0) {
        console.log("[AI Job Filtering] No jobs passed Stage 1 - stopping");
        await updateJobScanHistory(scanId, {
          status: "completed",
          completedAt: new Date(),
        });
        return {
          success: true,
          totalAnalyzed: unanalyzedJobs.length,
          eligible: 0,
          ineligible: unanalyzedJobs.length,
          message: `Analyzed ${unanalyzedJobs.length} jobs: 0 eligible (all filtered in Stage 1)`,
        };
      }

      // Stage 2: Degree Requirements
      console.log(`[AI Job Filtering] Starting Stage 2: Degree Requirements (user has: ${userProfile.educationLevel})`);

      await updateJobScanHistory(scanId, {
        currentPhase: "Stage 2: Degree Requirements",
        currentProgress: 0,
        totalProgress: stage1Result.eligible.length,
        progressMessage: `Analyzing degree requirements (user education: ${userProfile.educationLevel})...`,
        lastProgressUpdate: new Date(),
      });

      await enforceOperationControls(scanId, db);
      const stage2Result = await filterDegreeRequirements(stage1Result.eligible, userProfile);
      console.log(`[AI Job Filtering] Stage 2 complete: ${stage2Result.eligible.length}/${stage1Result.eligible.length} passed`);

      await updateJobScanHistory(scanId, {
        currentProgress: stage1Result.eligible.length,
        progressMessage: `Stage 2 complete: ${stage2Result.eligible.length}/${stage1Result.eligible.length} jobs passed`,
        lastProgressUpdate: new Date(),
      });

      for (const job of stage2Result.filtered) {
        await db
          .update(trackedJobs)
          .set({
            aiAnalysis: {
              eligible: false,
              reason: `Requires education beyond ${userProfile.educationLevel}`,
              analyzedAt: new Date().toISOString(),
            },
          })
          .where(eq(trackedJobs.id, job.id));
      }

      if (stage2Result.eligible.length === 0) {
        console.log("[AI Job Filtering] No jobs passed Stage 2 - stopping");
        await updateJobScanHistory(scanId, {
          status: "completed",
          completedAt: new Date(),
        });
        return {
          success: true,
          totalAnalyzed: unanalyzedJobs.length,
          eligible: 0,
          ineligible: unanalyzedJobs.length,
          message: `Analyzed ${unanalyzedJobs.length} jobs: 0 eligible (all filtered in Stages 1-2)`,
        };
      }

      // Stage 3: Experience Requirements
      console.log(`[AI Job Filtering] Starting Stage 3: Experience Requirements (user has: ${userProfile.yearsExperience} years)`);

      await updateJobScanHistory(scanId, {
        currentPhase: "Stage 3: Experience Requirements",
        currentProgress: 0,
        totalProgress: stage2Result.eligible.length,
        progressMessage: `Analyzing experience requirements (user: ${userProfile.yearsExperience} years)...`,
        lastProgressUpdate: new Date(),
      });

      await enforceOperationControls(scanId, db);
      const stage3Result = await filterExperienceRequirements(stage2Result.eligible, userProfile);
      console.log(`[AI Job Filtering] Stage 3 complete: ${stage3Result.eligible.length}/${stage2Result.eligible.length} passed`);

      await updateJobScanHistory(scanId, {
        currentProgress: stage2Result.eligible.length,
        progressMessage: `Stage 3 complete: ${stage3Result.eligible.length}/${stage2Result.eligible.length} jobs passed`,
        lastProgressUpdate: new Date(),
      });

      for (const job of stage3Result.filtered) {
        await db
          .update(trackedJobs)
          .set({
            aiAnalysis: {
              eligible: false,
              reason: `Requires more than ${userProfile.yearsExperience} years experience`,
              analyzedAt: new Date().toISOString(),
            },
          })
          .where(eq(trackedJobs.id, job.id));
      }

      for (const job of stage3Result.eligible) {
        await db
          .update(trackedJobs)
          .set({
            aiAnalysis: {
              eligible: true,
              reason: "Passed all filters",
              analyzedAt: new Date().toISOString(),
            },
          })
          .where(eq(trackedJobs.id, job.id));
      }

      const eligible = stage3Result.eligible.length;
      const ineligible = unanalyzedJobs.length - eligible;

      console.log(`[AI Job Filtering] ✅ COMPLETE - Analyzed ${unanalyzedJobs.length} jobs: ${eligible} eligible, ${ineligible} ineligible`);

      await updateJobScanHistory(scanId, {
        status: "completed",
        currentPhase: "Complete",
        currentProgress: unanalyzedJobs.length,
        totalProgress: unanalyzedJobs.length,
        progressMessage: `Analysis complete: ${eligible} eligible, ${ineligible} ineligible`,
        completedAt: new Date(),
      });

      return {
        success: true,
        totalAnalyzed: unanalyzedJobs.length,
        eligible,
        ineligible,
        message: `Analyzed ${unanalyzedJobs.length} jobs: ${eligible} eligible, ${ineligible} ineligible`,
      };

    } catch (error: any) {
      console.error("[AI Job Filtering] Error:", error);
      
      if (scanId) {
        await updateJobScanHistory(scanId, {
          status: "failed",
          errorMessage: error.message,
          completedAt: new Date(),
        });
      }
      
      throw error;
    }
  }),

  /**
   * PHASE 3: Database Cleanup
   */
  cleanDatabase: protectedProcedure.mutation(async ({ ctx }) => {
    console.log("[Database Cleanup] Removing ALL tracked jobs");

    try {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const allJobs = await db.select().from(trackedJobs).where(eq(trackedJobs.userId, ctx.user.id));

      if (allJobs.length === 0) {
        return { success: true, removed: 0, message: "No jobs found" };
      }

      await db.delete(trackedJobs).where(eq(trackedJobs.userId, ctx.user.id));
      await db.delete(jobScanHistory).where(eq(jobScanHistory.userId, ctx.user.id));

      console.log(`[Database Cleanup] ✅ COMPLETE - Removed ${allJobs.length} jobs and cleared scan history`);

      return { success: true, removed: allJobs.length, message: `Removed ${allJobs.length} jobs from database` };
    } catch (error: any) {
      console.error("[Database Cleanup] Error:", error);
      throw error;
    }
  }),

  /**
   * Get current scan progress from database
   */
  getCurrentScanProgress: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const scan = await getLatestRunningScanForUser(ctx.user.id, db);
    if (!scan) return null;
    
    return {
      scanId: scan.id,
      status: scan.status,
      currentPhase: scan.currentPhase || "Initializing",
      currentProgress: scan.currentProgress || 0,
      totalProgress: scan.totalProgress || 0,
      progressMessage: scan.progressMessage || "Starting...",
      lastProgressUpdate: scan.lastProgressUpdate,
      startedAt: scan.startedAt,
      operationPaused: scan.operationPaused || false,
      operationCancelled: scan.operationCancelled || false,
    };
  }),

  /**
   * Pause the current operation
   */
  pauseOperation: protectedProcedure.mutation(async ({ ctx }) => {
    console.log("[Pause] Pausing current operation");

    try {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const scan = await getLatestRunningScanForUser(ctx.user.id, db);
      if (!scan) {
        return { success: false, message: "No running operation to pause" };
      }
      const scanId = scan.id;

      await updateJobScanHistory(scanId, {
        operationPaused: true,
        progressMessage: "Operation paused by user",
        lastProgressUpdate: new Date(),
      });

      console.log(`[Pause] Operation ${scanId} paused`);
      return { success: true, message: "Operation paused" };
    } catch (error: any) {
      console.error("[Pause] Error:", error);
      throw error;
    }
  }),

  /**
   * Resume a paused operation
   */
  resumeOperation: protectedProcedure.mutation(async ({ ctx }) => {
    console.log("[Resume] Resuming paused operation");

    try {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const scan = await getLatestRunningScanForUser(ctx.user.id, db);
      if (!scan) {
        return { success: false, message: "No paused operation to resume" };
      }
      if (!scan.operationPaused) {
        return { success: false, message: "Operation is not paused" };
      }

      await updateJobScanHistory(scan.id, {
        operationPaused: false,
        progressMessage: "Operation resumed",
        lastProgressUpdate: new Date(),
      });

      console.log(`[Resume] Operation ${scan.id} resumed`);
      return { success: true, message: "Operation resumed" };
    } catch (error: any) {
      console.error("[Resume] Error:", error);
      throw error;
    }
  }),

  /**
   * Cancel the current operation
   */
  cancelOperation: protectedProcedure.mutation(async ({ ctx }) => {
    console.log("[Cancel] Cancelling current operation");

    try {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const scan = await getLatestRunningScanForUser(ctx.user.id, db);
      if (!scan) {
        return { success: false, message: "No running operation to cancel" };
      }
      const scanId = scan.id;

      await updateJobScanHistory(scanId, {
        operationCancelled: true,
        status: "failed",
        errorMessage: "Operation cancelled by user",
        completedAt: new Date(),
      });

      // Kill any in-flight Python scrape subprocesses so the user sees the
      // cancel reflected within seconds rather than waiting for the
      // current platform's scrape to finish naturally. Without this,
      // enforceOperationControls only picks up the cancel flag at
      // between-search checkpoints — which can be tens of seconds away
      // when JobSpy is mid-request.
      const killed = killAllScrapeProcesses();
      console.log(`[Cancel] Operation ${scanId} cancelled (sent SIGTERM to ${killed.count} subprocess(es))`);
      return {
        success: true,
        message: killed.count > 0
          ? `Operation cancelled (${killed.count} active subprocess(es) terminated)`
          : "Operation cancelled",
      };
    } catch (error: any) {
      console.error("[Cancel] Error:", error);
      throw error;
    }
  }),

  /**
   * PHASE 3: AI Match Scoring
   * Scores eligible jobs against the user's profile using LLM
   */
  runFitScoring: protectedProcedure.mutation(async ({ ctx }) => {
    console.log("[AI Match Scoring] Starting LLM-powered fit scoring");
    let scanId: number | undefined;

    try {
      const userProfile = await loadUserProfileForFilter(ctx.user.id);
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get user's job titles
      const userTitlesResult = await db.select()
        .from(userJobTitles)
        .where(eq(userJobTitles.userId, ctx.user.id));
      const jobTitlesList = userTitlesResult.map((jt: any) => jt.jobTitle);

      // Get eligible jobs that don't have a fit score yet
      const allJobs = await db
        .select()
        .from(trackedJobs)
        .where(eq(trackedJobs.userId, ctx.user.id));

      const eligibleJobs = allJobs.filter((job) => {
        if (!job.aiAnalysis) return false;
        const analysis = job.aiAnalysis as any;
        return analysis.eligible === true && !analysis.fitScore;
      });

      if (eligibleJobs.length === 0) {
        return {
          success: true,
          scored: 0,
          message: "No unscored eligible jobs found. Run AI Job Filtering first.",
        };
      }

      console.log(`[AI Match Scoring] Found ${eligibleJobs.length} eligible jobs to score`);

      scanId = await createJobScanHistory({
        userId: ctx.user.id,
        platform: "multi",
        scanType: "fit_scoring",
        searchTerms: `AI Match Scoring - ${eligibleJobs.length} jobs`,
        location: "Profile Match",
        radiusMiles: 0,
        totalJobsFound: eligibleJobs.length,
        newJobsFound: 0,
        status: "running",
        currentPhase: "AI Match Scoring",
        currentProgress: 0,
        totalProgress: eligibleJobs.length,
        progressMessage: "Starting fit scoring...",
        lastProgressUpdate: new Date(),
      });

      const scores = await scoreJobFit(
        eligibleJobs,
        userProfile,
        jobTitlesList,
        async (completed, total) => {
          await enforceOperationControls(scanId!, db);
          await updateJobScanHistory(scanId!, {
            currentProgress: completed,
            progressMessage: `Scored ${completed}/${total} jobs`,
            lastProgressUpdate: new Date(),
          });
        }
      );

      // Update each job's aiAnalysis with the fit score
      let updated = 0;
      for (const score of scores) {
        await enforceOperationControls(scanId, db);
        const job = eligibleJobs.find(j => j.jobId === score.jobId);
        if (!job) continue;

        const existingAnalysis = (job.aiAnalysis as any) || {};
        const updatedAnalysis = {
          ...existingAnalysis,
          fitScore: score.fitScore,
          fitDetails: {
            skillsMatch: score.skillsMatch,
            educationMatch: score.educationMatch,
            experienceMatch: score.experienceMatch,
            locationMatch: score.locationMatch,
            notes: score.overallNotes,
          },
          scoredAt: new Date().toISOString(),
        };

        await db.update(trackedJobs)
          .set({ aiAnalysis: updatedAnalysis })
          .where(eq(trackedJobs.id, job.id));
        updated++;
      }

      await updateJobScanHistory(scanId, {
        status: "completed",
        completedAt: new Date(),
        newJobsFound: updated,
        progressMessage: `Scored ${updated} jobs`,
      });

      console.log(`[AI Match Scoring] Complete: Scored ${updated} jobs`);

      return {
        success: true,
        scored: updated,
        message: `Scored ${updated} eligible jobs against your profile`,
      };

    } catch (error: any) {
      console.error("[AI Match Scoring] Error:", error);
      if (scanId) {
        await updateJobScanHistory(scanId, {
          status: "failed",
          errorMessage: error.message,
          completedAt: new Date(),
        });
      }
      throw error;
    }
  }),

  /** Clear all locally stored Job Matrix data and return to onboarding. */
  nukeEverything: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    const userId = ctx.user.id;

    console.log(`[Local Data Reset] Clearing data for user ${userId}`);
    killAllScrapeProcesses();

    // Delete everything in order of dependency
    await db.delete(inboxMessages).where(eq(inboxMessages.userId, userId));
    await db.delete(applicationNotes).where(eq(applicationNotes.userId, userId));
    await db.delete(appliedJobs).where(eq(appliedJobs.userId, userId));
    await db.delete(trackedJobs).where(eq(trackedJobs.userId, userId));
    await db.delete(jobScanHistory).where(eq(jobScanHistory.userId, userId));
    await db.delete(userJobTitles).where(eq(userJobTitles.userId, userId));
    await db.delete(userProfiles).where(eq(userProfiles.userId, userId));
    await db.delete(applicationProfiles).where(eq(applicationProfiles.userId, userId));
    await db.delete(searchPresets).where(eq(searchPresets.userId, userId));
    await db.delete(userSettings).where(eq(userSettings.userId, userId));
    await db.delete(scraperHealth);

    // Reset onboarding status
    await db.update(users)
      .set({ onboardingCompleted: 0 })
      .where(eq(users.id, userId));

    const dataDir = path.dirname(ENV.databasePath);
    for (const directory of ["application-assets", "archived-assets"]) {
      fs.rmSync(path.join(dataDir, directory), { recursive: true, force: true });
    }
    clearStoredSettings();

    console.log("[Local Data Reset] Reset complete. User is now a fresh install.");
    
    return { success: true, message: "Local Job Matrix data reset." };
  }),
});
