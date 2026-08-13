import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { detectDuplicates } from "./services/dedup-and-scoring";
import type { TrackedJob } from "../drizzle/schema";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "local",
    role: "user",
    onboardingCompleted: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

function makeJob(overrides: Partial<TrackedJob> & { id: number; jobId: string; title: string; company: string }): TrackedJob {
  return {
    userId: 1,
    location: "Remote",
    platform: "indeed",
    jobUrl: "https://example.com",
    description: "",
    salaryMin: null,
    salaryMax: null,
    salaryInterval: null,
    jobType: null,
    datePosted: null,
    status: "new",
    aiAnalysis: null,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    ...overrides,
  } as TrackedJob;
}

describe("detectDuplicates", () => {
  it("groups identical jobs from different platforms", () => {
    const jobs: TrackedJob[] = [
      makeJob({ id: 1, jobId: "j1", title: "Data Entry Clerk", company: "Acme Corp", platform: "indeed", firstSeenAt: new Date("2025-01-01") }),
      makeJob({ id: 2, jobId: "j2", title: "Data Entry Clerk", company: "Acme Corp", platform: "glassdoor", firstSeenAt: new Date("2025-01-02") }),
      makeJob({ id: 3, jobId: "j3", title: "Data Entry Clerk", company: "Acme Corp", platform: "linkedin", firstSeenAt: new Date("2025-01-03") }),
    ];

    const result = detectDuplicates(jobs);

    // All three should be in the same group
    const group1 = result.get(1);
    const group2 = result.get(2);
    const group3 = result.get(3);

    expect(group1).toBeDefined();
    expect(group2).toBeDefined();
    expect(group3).toBeDefined();
    expect(group1!.primaryId).toBe(group2!.primaryId);
    expect(group2!.primaryId).toBe(group3!.primaryId);
    expect(group1!.jobIds).toHaveLength(3);
    expect(group1!.platforms).toContain("indeed");
    expect(group1!.platforms).toContain("glassdoor");
    expect(group1!.platforms).toContain("linkedin");
  });

  it("does not group different jobs together", () => {
    const jobs: TrackedJob[] = [
      makeJob({ id: 1, jobId: "j1", title: "Data Entry Clerk", company: "Acme Corp", platform: "indeed" }),
      makeJob({ id: 2, jobId: "j2", title: "Software Engineer", company: "Google", platform: "indeed" }),
    ];

    const result = detectDuplicates(jobs);

    // Each should be in its own group (or not grouped at all for singles)
    const group1 = result.get(1);
    const group2 = result.get(2);

    if (group1 && group2) {
      expect(group1.primaryId).not.toBe(group2.primaryId);
    }
  });

  it("normalizes company names (strips Inc, LLC, etc.)", () => {
    const jobs: TrackedJob[] = [
      makeJob({ id: 1, jobId: "j1", title: "Data Entry", company: "Acme Inc.", platform: "indeed" }),
      makeJob({ id: 2, jobId: "j2", title: "Data Entry", company: "Acme", platform: "glassdoor" }),
    ];

    const result = detectDuplicates(jobs);
    const group1 = result.get(1);
    const group2 = result.get(2);

    expect(group1).toBeDefined();
    expect(group2).toBeDefined();
    expect(group1!.primaryId).toBe(group2!.primaryId);
  });

  it("handles empty job list", () => {
    const result = detectDuplicates([]);
    expect(result.size).toBe(0);
  });

  it("selects the earliest job as primary", () => {
    const jobs: TrackedJob[] = [
      makeJob({ id: 10, jobId: "j10", title: "Clerk", company: "Corp", platform: "glassdoor", firstSeenAt: new Date("2025-03-01") }),
      makeJob({ id: 5, jobId: "j5", title: "Clerk", company: "Corp", platform: "indeed", firstSeenAt: new Date("2025-01-01") }),
    ];

    const result = detectDuplicates(jobs);
    const group = result.get(10);
    expect(group).toBeDefined();
    // The earlier job (id=5) should be primary
    expect(group!.primaryId).toBe(5);
  });
});

describe("personalized router - fit scoring & dedup procedures", () => {
  it("has runFitScoring procedure", () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    expect(caller.personalized.runFitScoring).toBeDefined();
  });

  it("has getDuplicateGroups procedure", () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    expect(caller.personalized.getDuplicateGroups).toBeDefined();
  });
});

describe("dedup-and-scoring module exports", () => {
  it("exports detectDuplicates function", async () => {
    const mod = await import("./services/dedup-and-scoring");
    expect(typeof mod.detectDuplicates).toBe("function");
  });

  it("exports scoreJobFit function", async () => {
    const mod = await import("./services/dedup-and-scoring");
    expect(typeof mod.scoreJobFit).toBe("function");
  });
});
