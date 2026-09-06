/**
 * Jobs Management Router
 * Handles: Eligible jobs, Applied jobs, Bulk actions, Export, Job detail
 */

import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { trackedJobs, appliedJobs } from "../../drizzle/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { detectDuplicates } from "../services/dedup-and-scoring";
import { serializeCsv } from "../../shared/csv";

export const jobsRouter = router({

  // The board must retain pending and AI-filtered rows for review/empty states.
  // Keep getEligibleJobs strict for consumers that specifically need matches.
  getBoardJobs: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const jobs = await db.select().from(trackedJobs)
      .where(eq(trackedJobs.userId, ctx.user.id))
      .orderBy(desc(trackedJobs.firstSeenAt));
    return jobs.filter(job => job.status !== "applied" && job.status !== "rejected");
  }),

  /**
   * Mark a job as applied
   */
  markJobAsApplied: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const [job] = await db
          .select()
          .from(trackedJobs)
          .where(and(eq(trackedJobs.id, input.jobId), eq(trackedJobs.userId, ctx.user.id)))
          .limit(1);

        if (!job) throw new Error("Job not found");

        const [existing] = await db
          .select()
          .from(appliedJobs)
          .where(
            and(
              eq(appliedJobs.userId, ctx.user.id),
              eq(appliedJobs.jobId, job.jobId),
              eq(appliedJobs.platform, job.platform)
            )
          )
          .limit(1);

        if (existing) {
          await db.update(trackedJobs).set({ status: "applied" }).where(eq(trackedJobs.id, job.id));
          return { success: false, message: "Job already marked as applied" };
        }

        await db.insert(appliedJobs).values({
          userId: ctx.user.id,
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
          firstTrackedAt: job.firstSeenAt,
        });
        await db.update(trackedJobs).set({ status: "applied" }).where(eq(trackedJobs.id, job.id));

        console.log(`[Applied] Job ${job.id} marked as applied by user ${ctx.user.id}`);
        return { success: true, message: "Job marked as applied" };
      } catch (error: any) {
        console.error("[Applied] Error:", error);
        throw error;
      }
    }),

  /**
   * Get eligible jobs (AI-filtered)
   */
  getEligibleJobs: protectedProcedure
    .input(z.object({ limit: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const jobs = await db
          .select()
          .from(trackedJobs)
          .where(eq(trackedJobs.userId, ctx.user.id));

        const eligibleJobs = jobs.filter((job) => {
          if (job.status === "applied" || job.status === "rejected") return false;
          if (!job.aiAnalysis) return false;
          const analysis = job.aiAnalysis as { eligible?: boolean };
          return analysis.eligible === true;
        });

        eligibleJobs.sort((a, b) => {
          const dateA = new Date(a.datePosted || 0);
          const dateB = new Date(b.datePosted || 0);
          
          if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
            return dateB.getTime() - dateA.getTime();
          }
          
          return new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime();
        });

        const limitedJobs = input.limit ? eligibleJobs.slice(0, input.limit) : eligibleJobs;
        return limitedJobs;
      } catch (error: any) {
        console.error("[Eligible Jobs] Error:", error);
        throw error;
      }
    }),

  /**
   * Get all applied jobs
   */
  getAppliedJobs: protectedProcedure.query(async ({ ctx }) => {
    try {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const jobs = await db
        .select()
        .from(appliedJobs)
        .where(eq(appliedJobs.userId, ctx.user.id))
        .orderBy(desc(appliedJobs.appliedAt));

      return jobs;
    } catch (error: any) {
      console.error("[Applied Jobs] Error:", error);
      throw error;
    }
  }),

  /**
   * Remove an applied job
   */
  removeAppliedJob: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const [job] = await db
          .select({ trackedJobId: appliedJobs.trackedJobId })
          .from(appliedJobs)
          .where(and(eq(appliedJobs.id, input.jobId), eq(appliedJobs.userId, ctx.user.id)))
          .limit(1);

        await db
          .delete(appliedJobs)
          .where(and(eq(appliedJobs.id, input.jobId), eq(appliedJobs.userId, ctx.user.id)));
        if (job?.trackedJobId) {
          await db.update(trackedJobs).set({ status: "interested" }).where(and(
            eq(trackedJobs.id, job.trackedJobId),
            eq(trackedJobs.userId, ctx.user.id),
          ));
        }

        console.log(`[Applied] Job ${input.jobId} removed from applied list`);
        return { success: true, message: "Job removed from applied list" };
      } catch (error: any) {
        console.error("[Applied] Error:", error);
        throw error;
      }
    }),

  /**
   * Update application status pipeline
   */
  updateApplicationStatus: protectedProcedure
    .input(z.object({
      jobId: z.number(),
      status: z.enum(["applied", "interview", "offer", "accepted", "rejected", "ghosted"]),
      notes: z.string().max(5_000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const updates: Record<string, any> = {
        applicationStatus: input.status,
      };

      if (input.notes !== undefined) updates.notes = input.notes;

      const now = new Date();
      if (input.status === "interview") updates.interviewAt = now;
      if (input.status === "offer") updates.offerAt = now;
      if (["accepted", "rejected", "ghosted"].includes(input.status)) updates.resolvedAt = now;

      await db
        .update(appliedJobs)
        .set(updates)
        .where(and(eq(appliedJobs.id, input.jobId), eq(appliedJobs.userId, ctx.user.id)));

      return { success: true };
    }),

  /**
   * Bulk mark jobs as applied
   */
  bulkMarkApplied: protectedProcedure
    .input(z.object({ jobIds: z.array(z.number()) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      if (input.jobIds.length === 0) {
        return { success: true, applied: 0, skipped: 0 };
      }

      // 1. Fetch all matching tracked jobs for this user
      const jobsToMark = await db
        .select()
        .from(trackedJobs)
        .where(and(inArray(trackedJobs.id, input.jobIds), eq(trackedJobs.userId, ctx.user.id)));

      if (jobsToMark.length === 0) {
        return { success: true, applied: 0, skipped: input.jobIds.length };
      }

      // 2. Identify which are already applied to
      const platformJobIds = jobsToMark.map((j) => j.jobId);
      const existingApplied = await db
        .select()
        .from(appliedJobs)
        .where(and(eq(appliedJobs.userId, ctx.user.id), inArray(appliedJobs.jobId, platformJobIds)));

      const existingSet = new Set(existingApplied.map((j) => `${j.platform}:${j.jobId}`));

      // 3. Filter for truly new applications, ensuring we don't add the same job twice in this batch
      const seenInBatch = new Set<string>();
      const jobsToInsert = jobsToMark.filter((job) => {
        const key = `${job.platform}:${job.jobId}`;
        if (existingSet.has(key) || seenInBatch.has(key)) {
          return false;
        }
        seenInBatch.add(key);
        return true;
      });

      if (jobsToInsert.length > 0) {
        await db.insert(appliedJobs).values(
          jobsToInsert.map((job) => ({
            userId: ctx.user.id,
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
            firstTrackedAt: job.firstSeenAt,
          }))
        );
      }

      // Every selected tracked job is now represented in applied_jobs, either
      // from this batch or a prior action, so keep the board state in sync.
      await db.update(trackedJobs).set({ status: "applied" }).where(and(
        eq(trackedJobs.userId, ctx.user.id),
        inArray(trackedJobs.id, jobsToMark.map((job) => job.id)),
      ));

      const applied = jobsToInsert.length;
      const skipped = input.jobIds.length - applied;

      return { success: true, applied, skipped };
    }),

  /**
   * Bulk reject jobs
   */
  bulkRejectJobs: protectedProcedure
    .input(z.object({ jobIds: z.array(z.number()) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      if (input.jobIds.length === 0) {
        return { success: true, rejected: 0 };
      }

      await db
        .update(trackedJobs)
        .set({ status: "rejected" })
        .where(and(inArray(trackedJobs.id, input.jobIds), eq(trackedJobs.userId, ctx.user.id)));

      // Return input length to maintain backward compatibility with original API behavior
      return { success: true, rejected: input.jobIds.length };
    }),

  /**
   * Get single job detail
   */
  getJobDetail: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [job] = await db
        .select()
        .from(trackedJobs)
        .where(and(eq(trackedJobs.id, input.jobId), eq(trackedJobs.userId, ctx.user.id)))
        .limit(1);

      return job || null;
    }),

  /**
   * Get cross-platform duplicate groups for eligible jobs
   */
  getDuplicateGroups: protectedProcedure.query(async ({ ctx }) => {
    try {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const jobs = await db
        .select()
        .from(trackedJobs)
        .where(eq(trackedJobs.userId, ctx.user.id));

      const eligibleJobs = jobs.filter((job) => {
        if (!job.aiAnalysis) return false;
        const analysis = job.aiAnalysis as { eligible?: boolean };
        return analysis.eligible === true;
      });

      const dupMap = detectDuplicates(eligibleJobs);
      
      // Convert to serializable format: group by primaryId
      const groups: Record<number, { primaryId: number; jobIds: number[]; platforms: string[] }> = {};
      for (const [jobId, group] of Array.from(dupMap.entries())) {
        if (!groups[group.primaryId]) {
          groups[group.primaryId] = {
            primaryId: group.primaryId,
            jobIds: group.jobIds,
            platforms: group.platforms,
          };
        }
      }

      // Also return a flat lookup: jobId -> primaryId (for the frontend to check)
      const lookup: Record<number, number> = {};
      for (const [jobId, group] of Array.from(dupMap.entries())) {
        lookup[jobId] = group.primaryId;
      }

      return {
        groups: Object.values(groups),
        lookup,
        totalDuplicates: Object.values(groups).reduce((sum, g) => sum + g.jobIds.length - 1, 0),
      };
    } catch (error: any) {
      console.error("[Duplicates] Error:", error);
      throw error;
    }
  }),

  /**
   * Export eligible jobs as CSV
   */
  exportEligibleJobsCSV: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const jobs = await db
      .select()
      .from(trackedJobs)
      .where(eq(trackedJobs.userId, ctx.user.id));

    const eligibleJobs = jobs.filter((job) => {
      if (!job.aiAnalysis) return false;
      const analysis = job.aiAnalysis as { eligible?: boolean };
      return analysis.eligible === true;
    });

    return serializeCsv([
      ["Title", "Company", "Location", "Salary Min", "Salary Max", "Job Type", "Date Posted", "URL", "Status"],
      ...eligibleJobs.map((job) => [
        job.title,
        job.company,
        job.location,
        job.salaryMin,
        job.salaryMax,
        job.jobType,
        job.datePosted,
        job.jobUrl,
        job.status,
      ]),
    ]);
  }),
});
