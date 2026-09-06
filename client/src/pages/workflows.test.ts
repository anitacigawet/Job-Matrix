// @vitest-environment jsdom
import { act, createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrackedJobsPersonalized } from "./TrackedJobsPersonalized";
import { JobPreferences } from "./JobPreferences";
import { Analytics } from "./Analytics";
import { getJobFitScore } from "@/lib/job-fit-score";
import { mountOffline, settle, type OfflineHandlers } from "@/test/offline-react";

// Quick fill is unrelated to the workflows exercised below.
vi.mock("@/components/WorkStyleQuickFill", () => ({ WorkStyleQuickFillDialog: () => null }));

let mounted: Awaited<ReturnType<typeof mountOffline>> | undefined;
afterEach(async () => { await mounted?.dispose(); mounted = undefined; });

const job = (id: number, aiAnalysis: unknown) => ({
  id, title: `Fictional job ${id}`, company: "Example Company", platform: "indeed",
  jobUrl: "https://example.com/job", description: "Example role", location: "Seattle",
  jobType: "Support", status: "new", datePosted: "2026-01-01", aiAnalysis,
});
const profile = {
  state: "California", stateAbbr: "CA", city: "Los Angeles", searchRadiusMiles: 50,
  willingToRelocate: false, remotePreference: "hybrid", educationLevel: "high_school",
  yearsExperience: "1-3", skillsRaw: "Support", resumeText: "Example resume",
  minSalary: 50000, salaryFilterEnabled: true,
};
const llm = { activeProvider: "gemini", providers: [{ id: "gemini", hasKey: true, model: "fixture" }] };
const base: OfflineHandlers = {
  "personalized.getCurrentScanProgress": () => null,
  "personalized.getLastGlobalSearch": () => null,
  "personalized.getLastAIAnalysis": () => null,
  "personalized.getTotalJobCount": () => 0,
  "personalized.getPendingJobCounts": () => ({ unanalyzedJobs: 0 }),
  "personalized.getUserProfile": () => profile,
  "personalized.getDuplicateGroups": () => ({ groups: [], totalDuplicates: 0 }),
  "personalized.getSystemStats": () => ({}),
  "personalized.getAppliedJobs": () => [],
  "onboarding.getJobTitles": () => [{ id: 1, title: "Support", isActive: true }],
  "onboarding.getProfile": () => profile,
  "settings.getLlm": () => llm,
  "indeed.getScanHistory": () => [],
};

describe("job board workflows with real React Query caching", () => {
  it("removes an applied job from the mounted board after confirmation in the actual assistant dialog", async () => {
    const fixture = job(1, { eligible: true, fitScore: 86 });
    let rows = [fixture];
    mounted = await mountOffline(createElement(TrackedJobsPersonalized), "/jobs", {
      ...base,
      "personalized.getBoardJobs": () => rows,
      "personalized.getTotalJobCount": () => 1,
      "automation.getApplicationPacket": () => ({ job: fixture, applicant: null, instructions: [] }),
      "personalized.markJobAsApplied": () => {
        rows = [];
        return { success: true, message: "Fixture application recorded" };
      },
    });
    expect(mounted.container.textContent).toContain("Fictional job 1");
    await mounted.click("start-guided-application-1");
    expect(document.querySelector('[data-agent-status="application-assistant-packet"]')?.textContent).toContain("Fictional job 1");
    await mounted.click("confirm-application-submitted-1");
    expect(mounted.calls.find(call => call.path === "personalized.markJobAsApplied")?.input).toEqual({ jobId: 1 });
    expect(mounted.calls.filter(call => call.path === "personalized.getBoardJobs")).toHaveLength(2);
    expect(mounted.container.textContent).not.toContain("Fictional job 1");
    expect(mounted.container.textContent).toContain("No jobs waiting for review");
    expect(document.querySelector('[data-agent-status="application-assistant-packet"]')).toBeNull();
  });

  it("refreshes the initially empty count and enables filtering after the first scan", async () => {
    let rows: ReturnType<typeof job>[] = [];
    let completed: unknown = null;
    mounted = await mountOffline(createElement(TrackedJobsPersonalized), "/jobs", {
      ...base,
      "personalized.getBoardJobs": () => rows,
      "personalized.getTotalJobCount": () => rows.length,
      "personalized.getLastGlobalSearch": () => completed,
      "personalized.getPendingJobCounts": () => ({ unanalyzedJobs: rows.length }),
      "personalized.runGlobalSearch": () => {
        rows = [job(1, null)];
        completed = { completedAt: "2026-01-01" };
        return { success: true, failedSearchCount: 0, message: "Fixture scan completed" };
      },
    });
    const filter = () => mounted!.container.querySelector<HTMLButtonElement>('[data-agent-action="run-ai-filtering"]')!;
    expect(filter().disabled).toBe(true);
    expect(mounted.container.textContent).toContain("Nothing scanned yet");
    await mounted.click("run-new-scan");
    expect(filter().disabled).toBe(false);
    expect(mounted.calls.filter(call => call.path === "personalized.getTotalJobCount")).toHaveLength(2);
    expect(mounted.container.textContent).toContain("Jobs scanned, waiting for AI filter");
  });

  it.each([
    { name: "all rejected", rows: [job(1, { eligible: false, reason: "Location mismatch" })], message: "No eligible matches", review: true },
    { name: "pending", rows: [job(1, null)], message: "Jobs scanned, waiting for AI filter", review: false },
    { name: "pending and rejected", rows: [job(1, null), job(2, { eligible: false })], message: "Jobs scanned, waiting for AI filter", review: true },
    { name: "eligible and rejected", rows: [job(1, { eligible: true }), job(2, { eligible: false })], message: "Fictional job 1", review: true },
  ])("renders $name from the board endpoint", async ({ rows, message, review }) => {
    mounted = await mountOffline(createElement(TrackedJobsPersonalized), "/jobs", {
      ...base, "personalized.getBoardJobs": () => rows,
      "personalized.getTotalJobCount": () => rows.length,
    });
    expect(mounted.calls.some(call => call.path === "personalized.getEligibleJobs")).toBe(false);
    expect(mounted.container.textContent).toContain(message);
    expect(mounted.container.textContent).not.toContain("Nothing scanned yet");
    expect(!!mounted.container.querySelector('[data-agent-action="toggle-filtered-jobs"]')).toBe(review);
    if (review) {
      await mounted.click("toggle-filtered-jobs");
      expect(mounted.container.querySelector('[data-agent-status="filtered-jobs"]')?.textContent).toContain("Fictional job");
    }
  });

  it("distinguishes an exhausted board from a never-scanned database", async () => {
    mounted = await mountOffline(createElement(TrackedJobsPersonalized), "/jobs", {
      ...base, "personalized.getBoardJobs": () => [], "personalized.getTotalJobCount": () => 4,
    });
    expect(mounted.container.textContent).toContain("No jobs waiting for review");
    expect(mounted.container.textContent).not.toContain("Nothing scanned yet");
  });
});

describe("fit score compatibility", () => {
  it.each([0, 86, 100])("normalizes numeric and legacy score %s", score => {
    expect(getJobFitScore(job(1, { fitScore: score }))).toBe(score);
    expect(getJobFitScore(job(1, { fitScore: { overall: score } }))).toBe(score);
  });
  it.each([null, undefined, "86", NaN, Infinity, -1, 101, {}])("keeps invalid or absent score %s unscored", score => {
    expect(getJobFitScore(job(1, { fitScore: score }))).toBeNull();
  });
  it("renders current, legacy and zero scores in Analytics and excludes missing scores", async () => {
    mounted = await mountOffline(createElement(Analytics), "/analytics", {
      ...base, "personalized.getEligibleJobs": () => [
        job(1, { fitScore: 86 }), job(2, { fitScore: { overall: 60 } }),
        job(3, { fitScore: 0 }), job(4, {}),
      ],
    });
    await mounted.click("subnav-matches");
    expect(mounted.container.querySelector('[data-agent-status="empty-match-scores"]')).toBeNull();
    expect(mounted.container.textContent).toContain("49%");
    expect(mounted.container.textContent).toContain("86%");
    expect(mounted.container.textContent).toContain("Fictional job 3");
    expect(mounted.container.textContent).not.toContain("Fictional job 4");
  });
});

it("applies preset fields to the mounted form without losing ordinary unsaved edits", async () => {
  let savedProfile = { ...profile };
  let outgoing: any;
  mounted = await mountOffline(createElement(JobPreferences), "/preferences", {
    ...base,
    "onboarding.getProfile": () => savedProfile,
    "onboarding.saveProfile": input => { outgoing = input; return { success: true }; },
    "presets.list": () => [{ id: 1, name: "Seattle", jobTitles: ["Support"], platforms: ["indeed"], location: "Seattle, WA", radiusMiles: 25, remotePreference: "remote_only", minSalary: 80000 }],
    "presets.activate": () => {
      savedProfile = { ...savedProfile, city: "Seattle", state: "Washington", stateAbbr: "WA", searchRadiusMiles: 25, remotePreference: "remote_only", minSalary: 80000 };
      return { appliedTitles: 1, appliedPlatforms: 1 };
    },
  });
  const edit = async (name: string, value: string) => {
    const input = mounted!.container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-agent-input="${name}"]`)!;
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  await edit("user-city", "Unsaved city");
  await edit("user-skills-raw", "Unsaved skills");
  await act(async () => { await mounted!.queries.invalidateQueries(); });
  await settle();
  expect(mounted.container.querySelector<HTMLInputElement>('[data-agent-input="user-city"]')!.value).toBe("Unsaved city");
  await mounted.click("subnav-presets");
  await mounted.click("apply-preset-1");
  await mounted.click("confirm-apply-preset");
  await mounted.click("subnav-profile");
  expect(mounted.container.querySelector<HTMLInputElement>('[data-agent-input="user-city"]')!.value).toBe("Seattle");
  expect(mounted.container.querySelector<HTMLTextAreaElement>('[data-agent-input="user-skills-raw"]')!.value).toBe("Unsaved skills");
  await mounted.click("save-profile");
  expect(outgoing).toMatchObject({ city: "Seattle", state: "Washington", searchRadiusMiles: 25, remotePreference: "remote_only", minSalary: 80000, skillsRaw: "Unsaved skills" });
});
