import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { LOOPBACK_HOST } from "./_core/network";
import { normalizeStoredJobSource } from "./services/job-source-id";
import { searchJobs } from "./routers_indeed";
import { initDb } from "./db";

describe("application contract", () => {
  it("exposes the procedures the live client uses", () => {
    const procedures = Object.keys((appRouter as any)._def.procedures);
    expect(procedures).toEqual(expect.arrayContaining([
      "auth.me",
      "personalized.runGlobalSearch",
      "personalized.runAIAnalysis",
      "personalized.runFitScoring",
      "personalized.getCurrentScanProgress",
      "personalized.markJobAsApplied",
      "personalized.exportEligibleJobsCSV",
      "notes.getJobNotes",
      "notes.addNote",
      "notes.deleteNote",
      "notes.getNoteCounts",
      "settings.getEnabledPlatforms",
      "settings.updateAutoScan",
      "automation.getSetup",
      "automation.getApplicationPacket",
      "automation.setQueued",
      "automation.listInbox",
      "automation.checkInboxNow",
    ]));
  });

  it("does not pretend retired procedures still exist", () => {
    const procedures = Object.keys((appRouter as any)._def.procedures);
    expect(procedures).not.toEqual(expect.arrayContaining([
      "personalized.runBroadSearch",
      "personalized.getScanProgress",
      "personalized.markApplied",
      "personalized.exportJobsCsv",
      "admin.isOwner",
    ]));
  });
});

describe("stabilized runtime contracts", () => {
  it("binds the unauthenticated server to IPv4 loopback", () => {
    expect(LOOPBACK_HOST).toBe("127.0.0.1");
  });

  it("preserves every supported ATS source namespace", () => {
    expect(normalizeStoredJobSource("gh:anthropic")).toBe("gh:anthropic");
    expect(normalizeStoredJobSource("lever:netlify")).toBe("lever:netlify");
    expect(normalizeStoredJobSource("ashby:posthog")).toBe("ashby:posthog");
    expect(normalizeStoredJobSource("wd:target")).toBe("wd:target");
    expect(normalizeStoredJobSource("unknown-source")).toBe("indeed");
  });

  it("reports an empty platform selection as a failed search", async () => {
    const result = await searchJobs("analyst", "Remote", 50, 10, 24, []);
    expect(result).toMatchObject({
      success: false,
      count: 0,
      error: "No job platforms are enabled.",
    });
  });

  it("does not let an absent Tier-2 call mask a Tier-1 failure", async () => {
    await initDb();
    const result = await searchJobs("analyst", "Remote", 50, 10, 24, ["adzuna"]);
    expect(result.success).toBe(false);
    expect(result.error).toContain("credentials not configured");
  });
});
