/**
 * Debug Mode: Individual Stage Execution for AI Analysis
 * Allows manual progression through each filter stage with result review
 * Temporary feature for fine-tuning - easy to remove later
 */

import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { filterRemoteEligibility, filterDegreeRequirements, filterExperienceRequirements, initializeDebugLog } from "./ai-job-filter-csv";
import { getDb } from "./db";
import { trackedJobs } from "../drizzle/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";

export const debugStagesRouter = router({
  
  /**
   * Debug: Get first 20 unanalyzed jobs for testing
   */
  getTestJobs: protectedProcedure.query(async ({ ctx }) => {
    // Initialize debug log file for new test session
    initializeDebugLog();
    
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    const jobs = await db
      .select()
      .from(trackedJobs)
      .where(
        and(
          eq(trackedJobs.userId, ctx.user.id),
          isNull(trackedJobs.aiAnalysis)
        )
      )
      .limit(20);
    
    return {
      jobs: jobs.map(j => ({
        id: j.id,
        jobId: j.jobId,
        title: j.title,
        company: j.company,
        location: j.location,
      })),
      count: jobs.length,
    };
  }),
  
  /**
   * Debug: Run Stage 1 (Remote/Location Check)
   */
  runStage1: protectedProcedure
    .input(z.object({
      jobIds: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      console.log(`[Debug Stage 1] Starting remote/location filter for ${input.jobIds.length} jobs`);
      
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Fetch jobs
      const jobs = await db
        .select()
        .from(trackedJobs)
        .where(
          and(
            eq(trackedJobs.userId, ctx.user.id),
            inArray(trackedJobs.jobId, input.jobIds)
          )
        );
      
      if (jobs.length === 0) {
        return { eligible: [], filtered: [], reasoning: [] };
      }
      
      // Run remote filter
      const result = await filterRemoteEligibility(jobs);
      
      console.log(`[Debug Stage 1] Complete: ${result.eligible.length} passed, ${result.filtered.length} filtered`);
      
      return {
        eligible: result.eligible.map(j => j.jobId),
        filtered: result.filtered.map(j => j.jobId),
        reasoning: result.filtered.map(j => ({
          jobId: j.jobId,
          title: j.title,
          reason: "Not remote, or remote restrictions exclude your state",
        })),
      };
    }),
  
  /**
   * Debug: Run Stage 2 (Degree Requirements)
   */
  runStage2: protectedProcedure
    .input(z.object({
      jobIds: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      console.log(`[Debug Stage 2] Starting degree filter for ${input.jobIds.length} jobs`);
      
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Fetch jobs
      const jobs = await db
        .select()
        .from(trackedJobs)
        .where(
          and(
            eq(trackedJobs.userId, ctx.user.id),
            inArray(trackedJobs.jobId, input.jobIds)
          )
        );
      
      if (jobs.length === 0) {
        return { eligible: [], filtered: [], reasoning: [] };
      }
      
      // Run degree filter
      const result = await filterDegreeRequirements(jobs);
      
      console.log(`[Debug Stage 2] Complete: ${result.eligible.length} passed, ${result.filtered.length} filtered`);
      
      return {
        eligible: result.eligible.map(j => j.jobId),
        filtered: result.filtered.map(j => j.jobId),
        reasoning: result.filtered.map(j => ({
          jobId: j.jobId,
          title: j.title,
          reason: "Requires bachelor's degree or higher",
        })),
      };
    }),
  
  /**
   * Debug: Run Stage 3 (Experience Requirements)
   */
  runStage3: protectedProcedure
    .input(z.object({
      jobIds: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      console.log(`[Debug Stage 3] Starting experience filter for ${input.jobIds.length} jobs`);
      
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Fetch jobs
      const jobs = await db
        .select()
        .from(trackedJobs)
        .where(
          and(
            eq(trackedJobs.userId, ctx.user.id),
            inArray(trackedJobs.jobId, input.jobIds)
          )
        );
      
      if (jobs.length === 0) {
        return { eligible: [], filtered: [], reasoning: [] };
      }
      
      // Run experience filter
      const result = await filterExperienceRequirements(jobs);
      
      console.log(`[Debug Stage 3] Complete: ${result.eligible.length} passed, ${result.filtered.length} filtered`);
      
      return {
        eligible: result.eligible.map(j => j.jobId),
        filtered: result.filtered.map(j => j.jobId),
        reasoning: result.filtered.map(j => ({
          jobId: j.jobId,
          title: j.title,
          reason: "Requires more than 2 years experience",
        })),
      };
    }),
});
