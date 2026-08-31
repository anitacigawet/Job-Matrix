/**
 * Stats & Queries Router
 * Handles: Job counts, scan timestamps, system stats, user profile
 */

import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { loadUserProfileForFilter } from "../user-profile";
import { trackedJobs, jobScanHistory } from "../../drizzle/schema";
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
   * Get user's profile for display on dashboard
   */
  getUserProfile: protectedProcedure.query(async ({ ctx }) => {
    return await loadUserProfileForFilter(ctx.user.id);
  }),
});
