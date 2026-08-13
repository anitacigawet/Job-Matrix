/**
 * Stats & Queries Router
 * Handles: Job counts, scan timestamps, system stats, user profile
 */

import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { searchIndeedJobs } from "../routers_indeed";
import { saveTrackedJob, bulkSaveTrackedJobs, getTrackedJobs, createJobScanHistory, updateJobScanHistory, getRecentJobScans, getUserProfile } from "../db";
import { loadUserProfileForFilter, loadJobSearchCriteria } from "../user-profile";
import { batchAnalyzeJobs } from "../ai-job-filter-csv";
import { getDb } from "../db";
import { trackedJobs, jobScanHistory, userJobTitles } from "../../drizzle/schema";
import { eq, and, isNull, desc, sql } from "drizzle-orm";

export const statsRouter = router({

  /**
   * Get total job count
   */
  getTotalJobCount: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return 0;
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(trackedJobs)
      .where(eq(trackedJobs.userId, ctx.user.id));
    return Number(result?.count ?? 0);
  }),

  /**
   * Get last Global Search timestamp
   */
  getLastGlobalSearch: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const scans = await db.select()
      .from(jobScanHistory)
      .where(
        and(
          eq(jobScanHistory.userId, ctx.user.id),
          eq(jobScanHistory.scanType, "broad_search"),
          eq(jobScanHistory.status, "completed")
        )
      )
      .orderBy(desc(jobScanHistory.completedAt))
      .limit(1);
    return scans[0] || null;
  }),

  /**
   * Get last AI Job Filtering timestamp
   */
  getLastAIAnalysis: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const scans = await db.select()
      .from(jobScanHistory)
      .where(
        and(
          eq(jobScanHistory.userId, ctx.user.id),
          eq(jobScanHistory.scanType, "ai_analysis"),
          eq(jobScanHistory.status, "completed")
        )
      )
      .orderBy(desc(jobScanHistory.completedAt))
      .limit(1);
    return scans[0] || null;
  }),

  /**
   * Get pending job counts for button badges
   */
  getPendingJobCounts: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { unanalyzedJobs: 0, totalJobs: 0 };
    
    const [unanalyzedResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(trackedJobs)
      .where(
        and(
          eq(trackedJobs.userId, ctx.user.id),
          isNull(trackedJobs.aiAnalysis)
        )
      );
    
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(trackedJobs)
      .where(eq(trackedJobs.userId, ctx.user.id));
    
    return {
      unanalyzedJobs: Number(unanalyzedResult?.count ?? 0),
      totalJobs: Number(totalResult?.count ?? 0),
    };
  }),

  /**
   * Get system statistics for Data Sources page
   */
  getSystemStats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return {
      totalTrackedJobs: 0,
      totalEligibleJobs: 0,
      systemUptime: "N/A",
      firstScanDate: "N/A"
    };
    
    const trackedJobRows = await db
      .select({ aiAnalysis: trackedJobs.aiAnalysis })
      .from(trackedJobs)
      .where(eq(trackedJobs.userId, ctx.user.id));
    
    const totalTrackedJobs = trackedJobRows.length;
    const totalEligible = trackedJobRows.filter(job => 
      job.aiAnalysis && (job.aiAnalysis as any).eligible === true
    ).length;
    
    const firstScan = await db.select()
      .from(jobScanHistory)
      .where(eq(jobScanHistory.userId, ctx.user.id))
      .orderBy(jobScanHistory.startedAt)
      .limit(1);
    
    const firstScanDate = firstScan[0]?.startedAt 
      ? new Date(firstScan[0].startedAt).toLocaleDateString("en-US", { 
          month: "short", 
          day: "numeric", 
          year: "numeric" 
        })
      : "N/A";
    
    const uptime = firstScan[0]?.startedAt
      ? Math.floor((Date.now() - new Date(firstScan[0].startedAt).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    
    const systemUptime = uptime > 0 ? `${uptime} days` : "N/A";
    
    return {
      totalTrackedJobs,
      totalEligibleJobs: totalEligible,
      systemUptime,
      firstScanDate
    };
  }),

  /**
   * LEGACY: Combined workflow (kept for backwards compatibility)
   */
  runPersonalizedScan: adminProcedure.mutation(async ({ ctx }) => {
    
    const searchCriteria = await loadJobSearchCriteria(ctx.user.id);
    const userProfile = await loadUserProfileForFilter(ctx.user.id);
    
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    const userTitlesResult2 = await db.select()
      .from(userJobTitles)
      .where(eq(userJobTitles.userId, ctx.user.id));
    
    const targetTitles = userTitlesResult2.map((jt: any) => jt.jobTitle);
    const locationDesc = searchCriteria.locations.map(l => l.description).join(" + ");
    
    const scanId = await createJobScanHistory({
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
    });

    try {
      let totalJobsFound = 0;
      let newJobsFound = 0;
      let aiFilteredOut = 0;
      
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
      }> = [];

      for (const location of searchCriteria.locations) {
        for (const title of targetTitles) {
          const result = await searchIndeedJobs(
            title,
            location.searchTerm,
            location.radiusMiles,
            searchCriteria.resultsPerTitle
          );

          if (!result.success) continue;

          totalJobsFound += result.count;
          allJobs.push(...result.jobs);
        }
      }

      const analysisResults = await batchAnalyzeJobs(
        allJobs.map(job => ({
          id: job.id,
          title: job.title,
          description: job.description || "",
          company: job.company,
          location: job.location || "",
        })),
        (current, total) => {
          if (current % 10 === 0) {
            console.log(`[Personalized Scan] AI Job Filtering Progress: ${current}/${total}`);
          }
        },
        userProfile
      );

      for (const job of allJobs) {
        const analysis = analysisResults.get(job.id);
        if (!analysis) continue;

        if (analysis.eligible || analysis.confidence === 0) {
          const saved = await saveTrackedJob({
            userId: ctx.user.id,
            platform: "indeed",
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
            status: "new",
            aiAnalysis: {
              eligible: analysis.eligible,
              reason: analysis.reason,
              requiresBachelors: analysis.details.requiresBachelors,
              requiresYearsExperience: analysis.details.requiresYearsExperience,
              remoteStateRestriction: analysis.details.remoteStateRestriction,
              isScamOrMLM: analysis.details.isScamOrMLM,
              redFlags: analysis.details.redFlags,
              confidence: analysis.confidence,
              analyzedAt: new Date().toISOString(),
            },
          });

          if (saved.isNew) newJobsFound++;
        } else {
          aiFilteredOut++;
        }
      }

      await updateJobScanHistory(scanId, {
        totalJobsFound,
        newJobsFound,
        status: "completed",
        completedAt: new Date(),
      });

      return {
        success: true,
        totalJobsFound,
        eligibleJobs: newJobsFound,
        filteredOut: aiFilteredOut,
      };

    } catch (error: any) {
      console.error("[Personalized Scan] Error:", error);
      await updateJobScanHistory(scanId, {
        status: "failed",
        errorMessage: error.message,
        completedAt: new Date(),
      });
      throw error;
    }
  }),

  /**
   * Get user's profile for display on dashboard
   */
  getUserProfile: protectedProcedure.query(async ({ ctx }) => {
    return await loadUserProfileForFilter(ctx.user.id);
  }),
});
