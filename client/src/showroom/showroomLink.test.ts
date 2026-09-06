import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { showroomLink } from "./showroomLink";

let operationId = 0;

function run(path: string, type: "query" | "mutation", input?: unknown) {
  return new Promise<any>((resolve, reject) => {
    const link = showroomLink()({});
    link({
      op: {
        id: ++operationId,
        type,
        path,
        input,
        context: {},
        signal: undefined,
      },
      next: () => {
        throw new Error("The showroom link must resolve locally.");
      },
    }).subscribe({
      next: envelope => resolve("data" in envelope.result ? envelope.result.data : envelope.result),
      error: reject,
    });
  });
}

describe("Job Matrix showroom transport", () => {
  beforeEach(async () => {
    await run("personalized.nukeEverything", "mutation");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs the search and application workflow entirely in browser fixture state", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network disabled"));

    const initialJobs = await run("personalized.getEligibleJobs", "query", {});
    expect(initialJobs).toHaveLength(4);
    expect(initialJobs.every((job: any) => job.aiAnalysis?.eligible)).toBe(true);

    const boardJobs = await run("personalized.getBoardJobs", "query");
    expect(boardJobs.map((job: any) => job.id)).toEqual(initialJobs.map((job: any) => job.id));
    expect(boardJobs.every((job: any) => !["applied", "rejected"].includes(job.status))).toBe(true);
    const csv = await run("personalized.exportEligibleJobsCSV", "query");
    expect(csv).toMatch(/^"Title","Company","Location","Salary Min","Salary Max","Job Type","Date Posted","URL","Status"\r\n/);

    await expect(run("personalized.runGlobalSearch", "mutation")).resolves.toMatchObject({ success: true });
    await expect(run("personalized.runAIAnalysis", "mutation")).resolves.toMatchObject({ success: true });
    await expect(run("personalized.runFitScoring", "mutation")).resolves.toMatchObject({ success: true });
    await expect(run("personalized.markJobAsApplied", "mutation", { jobId: initialJobs[0].id })).resolves.toMatchObject({ success: true });

    expect(await run("personalized.getEligibleJobs", "query", {})).toHaveLength(3);
    expect(await run("personalized.getAppliedJobs", "query")).toHaveLength(3);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns the fit-detail shape consumed by the real jobs interface", async () => {
    await run("personalized.runFitScoring", "mutation");
    const jobs = await run("personalized.getEligibleJobs", "query", {});

    expect(jobs[0].aiAnalysis).toMatchObject({
      fitScore: expect.any(Number),
      fitDetails: {
        skillsMatch: expect.any(Number),
        educationMatch: expect.any(Number),
        experienceMatch: expect.any(Number),
        locationMatch: expect.any(Number),
        notes: expect.any(String),
      },
      scoredAt: expect.any(String),
    });
    expect(jobs[0].aiAnalysis).not.toHaveProperty("fitBreakdown");
    expect(jobs[0].aiAnalysis).not.toHaveProperty("fitScoredAt");
  });

  it("persists deterministic application and connection settings until reset", async () => {
    await run("automation.saveApplicationProfile", "mutation", {
      fullName: "Taylor Fixture",
      email: "taylor@example.com",
      city: "Tucson",
    });
    await run("automation.uploadResume", "mutation", {
      fileName: "showroom-updated-resume.pdf",
      mimeType: "application/pdf",
      base64: "ZmljdGlvbmFs",
    });
    let setup = await run("automation.getSetup", "query");
    expect(setup.profile).toMatchObject({
      fullName: "Taylor Fixture",
      email: "taylor@example.com",
      city: "Tucson",
      resumeFileName: "showroom-updated-resume.pdf",
    });

    await run("automation.saveGmailClient", "mutation", {
      clientId: "fictional-client-id.apps.googleusercontent.com",
      clientSecret: "fictional-secret",
    });
    setup = await run("automation.getSetup", "query");
    expect(setup.gmail).toMatchObject({ clientConfigured: true, connected: false });
    expect(setup.monitoring.enabled).toBe(false);

    const auth = await run("automation.createGmailAuthUrl", "mutation", { origin: "https://showroom.test" });
    expect(auth.url).toBe("https://showroom.test/showroom/gmail-connected");
    await run("automation.updateMonitoring", "mutation", { enabled: true, notifyOnEmployerResponse: false });
    setup = await run("automation.getSetup", "query");
    expect(setup.gmail).toMatchObject({ connected: true, email: "jordan@example.com" });
    expect(setup.monitoring).toMatchObject({ enabled: true, notifyOnEmployerResponse: false });

    await run("automation.saveSlackWebhook", "mutation", { webhookUrl: "https://hooks.slack.com/services/fictional/showroom/value" });
    expect((await run("automation.getSetup", "query")).slack.configured).toBe(true);
    await expect(run("automation.testSlack", "mutation")).resolves.toMatchObject({
      success: true,
      message: expect.stringMatching(/no external service was contacted/i),
    });

    const savedLlm = await run("settings.saveLlm", "mutation", {
      activeProvider: "openai",
      openaiKey: "fictional-openai-key",
      openaiModel: "fictional-openai-model",
      rateLimitRps: 4,
    });
    expect(savedLlm).toMatchObject({ activeProvider: "openai", rateLimitRps: 4 });
    expect(savedLlm.providers.find((provider: any) => provider.id === "openai")).toMatchObject({
      hasKey: true,
      model: "fictional-openai-model",
    });
    const clearedLlm = await run("settings.clearProviderKey", "mutation", { provider: "openai" });
    expect(clearedLlm.providers.find((provider: any) => provider.id === "openai").hasKey).toBe(false);

    const savedSources = await run("settings.saveDataSource", "mutation", {
      source: "jooble",
      fields: { apiKey: "fictional-jooble-key" },
    });
    expect(savedSources.sources.find((source: any) => source.id === "jooble").configured).toBe(true);
    const clearedSources = await run("settings.clearDataSource", "mutation", { source: "jooble" });
    expect(clearedSources.sources.find((source: any) => source.id === "jooble").configured).toBe(false);

    await expect(run("settings.testProvider", "mutation", {
      provider: "gemini",
      apiKey: "fictional-key",
      model: "fictional-model",
    })).resolves.toMatchObject({ message: expect.stringMatching(/no external AI provider was contacted/i) });
    await expect(run("settings.testDataSource", "mutation", {
      source: "adzuna",
    })).resolves.toMatchObject({ message: expect.stringMatching(/no external source was contacted/i) });
    await expect(run("settings.sendTestNotification", "mutation")).resolves.toMatchObject({
      message: expect.stringMatching(/no external service was contacted/i),
    });

    const reset = await run("personalized.nukeEverything", "mutation");
    expect(reset.message).toMatch(/fictional starting state/i);
    setup = await run("automation.getSetup", "query");
    expect(setup.profile).toMatchObject({ fullName: "Jordan Example", resumeFileName: "fictional-showroom-resume.pdf" });
    expect(setup.gmail.connected).toBe(true);
    expect(setup.slack.configured).toBe(false);
  });
});
