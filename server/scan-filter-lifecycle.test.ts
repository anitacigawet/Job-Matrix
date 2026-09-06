import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createInternalContext } from "./_core/context";
import { invokeLLM } from "./_core/llm";
import { getDb, initDb } from "./db";
import { scanRouter } from "./routers/scan";
import { searchJobs } from "./routers_indeed";
import { runAutoScanForUser } from "./auto-scan-scheduler";
import { notifyOwner } from "./_core/notification";
import { annualSalary, filterDegreeRequirements, filterExperienceRequirements, filterRemoteEligibility } from "./ai-job-filter-csv";
import { assertOperationActive, resetWorkspace, withWorkspaceOperation } from "./operation-lifecycle";
import { jobScanHistory, scraperHealth, trackedJobs, userJobTitles, userProfiles, userSettings, type TrackedJob } from "../drizzle/schema";

vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn() }));
vi.mock("./routers_indeed", async (original) => ({
  ...await original<typeof import("./routers_indeed")>(), searchJobs: vi.fn(),
}));

const llm = vi.mocked(invokeLLM);
const search = vi.mocked(searchJobs);
const response = (jobs: unknown[]) => ({ choices: [{ message: { content: JSON.stringify({ jobs }) } }] }) as any;
const sample = { jobId: "one", title: "Analyst", description: "Fictional job", company: "Example", location: "Remote" } as TrackedJob;
const decision = (job_id: string) => ({ job_id, work_type: "remote", state_excluded: false,
  degree_requirement: "not_required", experience_requirement: "acceptable",
  is_scam_or_mlm: false, evidence: [], reasoning: "Listing meets the requirement" });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

async function caller() { return scanRouter.createCaller(await createInternalContext()); }

beforeAll(initDb);
beforeEach(async () => {
  vi.useRealTimers();
  llm.mockReset();
  search.mockReset();
  vi.mocked(notifyOwner).mockReset();
  await (await caller()).nukeEverything();
});
afterEach(() => vi.useRealTimers());

describe("AI failures stay distinct from substantive eligibility", () => {
  it("preserves substantive location, degree, and experience rejections", async () => {
    llm.mockResolvedValueOnce(response([{ ...decision("one"), state_excluded: true }]))
      .mockResolvedValueOnce(response([{ ...decision("one"), degree_requirement: "required" }]))
      .mockResolvedValueOnce(response([{ ...decision("one"), experience_requirement: "too_much" }]));
    for (const filter of [filterRemoteEligibility, filterDegreeRequirements, filterExperienceRequirements]) {
      const result = await filter([sample]);
      expect(result.filtered).toEqual([sample]);
      expect(result.eligible).toEqual([]);
    }
  });
  it.each([
    ["location", filterRemoteEligibility], ["education", filterDegreeRequirements],
    ["experience", filterExperienceRequirements],
  ] as const)("retries exhausted %s provider errors instead of rejecting the job", async (_stage, filter) => {
    vi.useFakeTimers();
    llm.mockRejectedValue(new Error("Synthetic provider unavailable"));
    const result = expect(filter([sample])).rejects.toThrow("failed after 4 attempts");
    await vi.runAllTimersAsync();
    await result;
    expect(llm).toHaveBeenCalledTimes(4);
  });

  it.each([
    ["empty", []], ["unknown ID", [decision("unknown")]],
    ["duplicate ID", [decision("one"), decision("one")]],
    ["invalid enum", [{ ...decision("one"), work_type: "maybe" }]],
    ["string boolean", [{ ...decision("one"), state_excluded: "false" }]],
  ])("does not accept %s decisions", async (_name, jobs) => {
    vi.useFakeTimers();
    llm.mockResolvedValue(response(jobs as unknown[]));
    const result = expect(filterRemoteEligibility([sample])).rejects.toThrow("failed after 4 attempts");
    await vi.runAllTimersAsync();
    await result;
  });

  it("retries a partial response and uses only the complete validated result", async () => {
    vi.useFakeTimers();
    llm.mockResolvedValueOnce(response([decision("one")]))
      .mockResolvedValueOnce(response([decision("one"), { ...decision("two"), state_excluded: true }]));
    const result = filterRemoteEligibility([sample, { ...sample, jobId: "two" }]);
    await vi.runAllTimersAsync();
    expect((await result).eligible.map(job => job.jobId)).toEqual(["one"]);
    expect(llm).toHaveBeenCalledTimes(2);
  });

  it("leaves analysis null on a later-stage failure, marks the scan failed, and supports an ordinary retry", async () => {
    const db = await getDb();
    const [job] = await db.insert(trackedJobs).values({ userId: 1, platform: "indeed",
      jobId: "retry", title: "Analyst", company: "Example", jobUrl: "https://example.test/retry" }).returning();
    const api = await caller();
    llm.mockResolvedValueOnce(response([decision(String(job.id))])).mockResolvedValue(response([]));
    vi.useFakeTimers();
    const failed = expect(api.runAIAnalysis()).rejects.toThrow("failed after 4 attempts");
    await vi.runAllTimersAsync();
    await failed;
    expect((await db.select().from(trackedJobs))[0].aiAnalysis).toBeNull();
    expect((await db.select().from(jobScanHistory))[0].status).toBe("failed");
    llm.mockResolvedValue(response([decision(String(job.id))]));
    await expect(api.runAIAnalysis()).resolves.toMatchObject({ success: true, eligible: 1 });
    expect((await db.select().from(trackedJobs))[0].aiAnalysis?.eligible).toBe(true);
  });
});

describe("saved salary and scam screening in the active pipeline", () => {
  it.each([
    [20, "hourly", 41600], [200, "daily", 52000], [1000, "weekly", 52000],
    [2000, "biweekly", 52000], [4000, "monthly", 48000], [50000, "yearly", 50000],
    [20, null, null], [20, "unknown", null], [null, "yearly", null],
  ])("normalizes %s paid %s", (amount, interval, expected) => {
    expect(annualSalary({ salaryMin: amount, salaryMax: null, salaryInterval: interval })).toBe(expected);
  });

  it("uses the saved minimum, preserves ranges/missing pay, and persists contextual scam flags", async () => {
    const db = await getDb();
    await db.insert(userProfiles).values({ userId: 1, city: "Portland", state: "Oregon",
      minSalary: 50000, salaryFilterEnabled: 1 });
    const rows = await db.insert(trackedJobs).values([
      { jobId: "low", salaryMin: 20, salaryMax: 23, salaryInterval: "hourly" },
      { jobId: "range", salaryMin: 40000, salaryMax: 60000, salaryInterval: "yearly" },
      { jobId: "unknown", salaryMin: null, salaryMax: null },
      { jobId: "scam", description: "Pay $500 for a starter kit and earn by recruiting your downline." },
      { jobId: "benign", description: "Investigate scams and MLM fraud. No fees to start work." },
    ].map(job => ({ userId: 1, platform: "indeed" as const, title: "Analyst", company: "Example",
      jobUrl: `https://example.test/${job.jobId}`, ...job }))).returning();
    llm.mockImplementation(async params => {
      const prompt = String(params.messages[1].content);
      if (prompt.includes("is_scam_or_mlm")) {
        const listings = JSON.parse(prompt.split("\n\n").at(-1)!) as Array<{ job_id: string }>;
        return response(listings.map(listing => {
          const job = rows.find(row => String(row.id) === listing.job_id)!;
          return job.jobId === "scam" ? { ...decision(listing.job_id), is_scam_or_mlm: true,
            reasoning: "Requires a purchase and downline recruiting", evidence: [job.description!] } : decision(listing.job_id);
        }));
      }
      return response(rows.map(job => decision(String(job.id))));
    });
    await expect((await caller()).runAIAnalysis()).resolves.toMatchObject({ eligible: 3, ineligible: 2 });
    const saved = await db.select().from(trackedJobs);
    expect(saved.find(job => job.jobId === "low")?.aiAnalysis?.reason).toContain("below minimum");
    expect(saved.find(job => job.jobId === "scam")?.aiAnalysis).toMatchObject({ eligible: false, isScamOrMLM: true });
    expect(saved.find(job => job.jobId === "benign")?.aiAnalysis?.eligible).toBe(true);
    const prompt = String(llm.mock.calls.at(-1)![0].messages[0].content);
    expect(prompt).toContain("not isolated keywords");
    expect(prompt).toContain("fraud investigator");
  });
});

describe("reset invalidates suspended operations at persistence", () => {
  it("stops normal cancellation immediately after an LLM response", async () => {
    const db = await getDb();
    const [job] = await db.insert(trackedJobs).values({ userId: 1, platform: "indeed",
      jobId: "cancel", title: "Analyst", company: "Example", jobUrl: "https://example.test/cancel" }).returning();
    const started = deferred<void>();
    const release = deferred<void>();
    llm.mockImplementation(async () => { started.resolve(); await release.promise; return response([decision(String(job.id))]); });
    const api = await caller();
    const running = api.runAIAnalysis();
    const rejected = expect(running).rejects.toThrow("cancelled by user");
    await started.promise;
    await api.cancelOperation();
    release.resolve();
    await rejected;
    expect(llm).toHaveBeenCalledTimes(1);
    expect((await db.select().from(trackedJobs))[0].aiAnalysis).toBeNull();
  });

  it("blocks old nested work and new work during reset, then allows a fresh operation", async () => {
    const suspended = deferred<void>();
    const clearing = deferred<void>();
    const stale = withWorkspaceOperation(async () => {
      await suspended.promise;
      return withWorkspaceOperation(() => assertOperationActive());
    });
    const rejected = expect(stale).rejects.toThrow("reset");
    const reset = resetWorkspace(() => clearing.promise);
    expect(() => withWorkspaceOperation(() => undefined)).toThrow("reset");
    clearing.resolve();
    await reset;
    suspended.resolve();
    await rejected;
    expect(() => withWorkspaceOperation(() => assertOperationActive())).not.toThrow();
  });

  it("does not let an in-flight Tier-1 response recreate jobs or source health after reset", async () => {
    const db = await getDb();
    await db.insert(userJobTitles).values({ userId: 1, jobTitle: "Analyst" });
    const started = deferred<void>();
    const release = deferred<void>();
    search.mockImplementation(async () => {
      started.resolve();
      await release.promise;
      // Source adapters record health before returning their results.
      await db.insert(scraperHealth).values({ platform: "adzuna" });
      return { success: true, count: 1, jobs: [{ id: "late", title: "Analyst", company: "Example",
        job_url: "https://example.test/late", site: "adzuna" }] } as any;
    });
    const api = await caller();
    const running = api.runGlobalSearch();
    const rejected = expect(running).rejects.toThrow("reset");
    await started.promise;
    await api.nukeEverything();
    release.resolve();
    await rejected;
    expect(await db.select().from(trackedJobs)).toEqual([]);
    expect(await db.select().from(jobScanHistory)).toEqual([]);
    expect(await db.select().from(scraperHealth)).toEqual([]);
  });

  it("stops when scan ownership disappears even without a workspace reset", async () => {
    const db = await getDb();
    await db.insert(userJobTitles).values({ userId: 1, jobTitle: "Analyst" });
    const started = deferred<void>();
    const release = deferred<void>();
    search.mockImplementation(async () => {
      started.resolve();
      await release.promise;
      return { success: true, count: 1, jobs: [{ id: "late", title: "Analyst", company: "Example",
        job_url: "https://example.test/late", site: "adzuna" }] } as any;
    });
    const running = (await caller()).runGlobalSearch();
    const rejected = expect(running).rejects.toThrow("scan was removed");
    await started.promise;
    await db.delete(jobScanHistory);
    release.resolve();
    await rejected;
    expect(await db.select().from(trackedJobs)).toEqual([]);
  });

  it("does not write AI results after reset or change jobs created after reset", async () => {
    const db = await getDb();
    const [job] = await db.insert(trackedJobs).values({ userId: 1, platform: "indeed",
      jobId: "old", title: "Analyst", company: "Example", jobUrl: "https://example.test/old" }).returning();
    const started = deferred<void>();
    const release = deferred<void>();
    llm.mockImplementation(async () => { started.resolve(); await release.promise; return response([decision(String(job.id))]); });
    const api = await caller();
    const running = api.runAIAnalysis();
    const rejected = expect(running).rejects.toThrow("reset");
    await started.promise;
    await api.nukeEverything();
    await db.insert(trackedJobs).values({ userId: 1, platform: "indeed",
      jobId: "fresh", title: "Fresh", company: "Example", jobUrl: "https://example.test/fresh" });
    release.resolve();
    await rejected;
    const saved = await db.select().from(trackedJobs);
    expect(saved.map(job => [job.jobId, job.aiAnalysis])).toEqual([["fresh", null]]);
    expect(await db.select().from(jobScanHistory)).toEqual([]);
    expect(llm).toHaveBeenCalledTimes(1);
  });

  it("does not resume scheduled AI, notifications, or schedule writes across reset", async () => {
    const db = await getDb();
    await db.insert(userJobTitles).values({ userId: 1, jobTitle: "Analyst" });
    const [settings] = await db.insert(userSettings).values({ userId: 1,
      autoScanEnabled: 1, autoScanIncludeAI: 1, notificationsEnabled: 1,
      notifyOnScanComplete: 1 }).returning();
    const started = deferred<void>();
    const release = deferred<void>();
    search.mockImplementation(async () => {
      started.resolve();
      await release.promise;
      return { success: true, count: 1, jobs: [{ id: "late", title: "Analyst", company: "Example",
        job_url: "https://example.test/late", site: "adzuna" }] } as any;
    });
    const running = runAutoScanForUser(1, settings);
    const rejected = expect(running).rejects.toThrow("reset");
    await started.promise;
    await (await caller()).nukeEverything();
    await db.insert(userSettings).values({ userId: 1 });
    release.resolve();
    await rejected;
    expect(llm).not.toHaveBeenCalled();
    expect(notifyOwner).not.toHaveBeenCalled();
    expect((await db.select().from(userSettings))[0].autoScanLastRun).toBeNull();
    expect(await db.select().from(jobScanHistory)).toEqual([]);
  });
});
