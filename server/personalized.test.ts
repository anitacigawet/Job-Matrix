import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { createInternalContext } from "./_core/context";
import { getActiveJobTitles, getDb, initDb } from "./db";
import {
  appliedJobs,
  applicationNotes,
  jobScanHistory,
  trackedJobs,
  userJobTitles,
  users,
} from "../drizzle/schema";

async function caller() {
  return appRouter.createCaller(await createInternalContext());
}

describe("personalized router integration", () => {
  beforeAll(async () => {
    await initDb();
  });

  beforeEach(async () => {
    const db = await getDb();
    await db.delete(applicationNotes);
    await db.delete(appliedJobs);
    await db.delete(trackedJobs);
    await db.delete(jobScanHistory);
    await db.delete(userJobTitles);
    await db.update(users).set({ onboardingCompleted: 0 }).where(eq(users.id, 1));
  });

  it("reads onboarding state from SQLite on each new context", async () => {
    await expect((await caller()).auth.me()).resolves.toMatchObject({ onboardingCompleted: 0 });

    const db = await getDb();
    await db.update(users).set({ onboardingCompleted: 1 }).where(eq(users.id, 1));

    await expect((await caller()).auth.me()).resolves.toMatchObject({ onboardingCompleted: 1 });
  });

  it("returns only jobs that passed AI filtering", async () => {
    const db = await getDb();
    await db.insert(trackedJobs).values([
      {
        userId: 1,
        platform: "indeed",
        jobId: "eligible-1",
        title: "Data Analyst",
        company: "Example Co",
        location: "Remote",
        jobUrl: "https://example.test/eligible",
        aiAnalysis: { eligible: true, reason: "Passed all filters" },
      },
      {
        userId: 1,
        platform: "linkedin",
        jobId: "filtered-1",
        title: "Senior Data Analyst",
        company: "Example Co",
        location: "Remote",
        jobUrl: "https://example.test/filtered",
        aiAnalysis: { eligible: false, reason: "Experience requirement" },
      },
    ]);

    const result = await (await caller()).personalized.getEligibleJobs({});
    expect(result).toHaveLength(1);
    expect(result[0].jobId).toBe("eligible-1");
  });

  it("loads only enabled target titles for manual and scheduled scans", async () => {
    const db = await getDb();
    await db.insert(userJobTitles).values([
      { userId: 1, jobTitle: "Data Analyst", isActive: 1 },
      { userId: 1, jobTitle: "Retired Search", isActive: 0 },
    ]);

    await expect(getActiveJobTitles(1)).resolves.toEqual(["Data Analyst"]);
  });

  it("moves a tracked job through the application pipeline", async () => {
    const db = await getDb();
    await db.insert(trackedJobs).values({
      userId: 1,
      platform: "indeed",
      jobId: "apply-1",
      title: "Operations Coordinator",
      company: "Example Co",
      location: "Phoenix, AZ",
      jobUrl: "https://example.test/apply",
      aiAnalysis: { eligible: true },
    });
    const [tracked] = await db.select().from(trackedJobs).where(eq(trackedJobs.jobId, "apply-1"));
    const api = await caller();

    await expect(api.personalized.markJobAsApplied({ jobId: tracked.id })).resolves.toMatchObject({ success: true });
    const [applied] = await api.personalized.getAppliedJobs();
    expect(applied.applicationStatus).toBe("applied");
    const [trackedAfterApply] = await db.select().from(trackedJobs).where(eq(trackedJobs.id, tracked.id));
    expect(trackedAfterApply.status).toBe("applied");

    await api.personalized.updateApplicationStatus({
      jobId: applied.id,
      status: "interview",
      notes: "Phone screen scheduled",
    });
    const [updated] = await api.personalized.getAppliedJobs();
    expect(updated).toMatchObject({
      applicationStatus: "interview",
      notes: "Phone screen scheduled",
    });
    expect(updated.interviewAt).toBeInstanceOf(Date);
  });

  it("handles an empty bulk rejection without inventing work", async () => {
    await expect((await caller()).personalized.bulkRejectJobs({ jobIds: [] }))
      .resolves.toEqual({ success: true, rejected: 0 });
  });
});
