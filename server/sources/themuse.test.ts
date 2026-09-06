import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("The Muse optional API key", () => {
  it.each([
    { name: "prefers the environment key over a saved key", envKey: "fictional-env-key", savedKey: "fictional-saved-key", expected: "fictional-env-key" },
    { name: "uses the key saved in Settings when no environment key exists", envKey: "", savedKey: "fictional-saved-key", expected: "fictional-saved-key" },
    { name: "searches anonymously when neither key exists", envKey: "", savedKey: undefined, expected: null },
  ])("$name", async ({ envKey, savedKey, expected }) => {
    vi.stubEnv("THEMUSE_API_KEY", envKey);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      results: [{ id: 7, name: "Data Analyst", company: { name: "Example Company" } }],
      page_count: 1,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { writeSettings } = await import("../_core/settings");
    writeSettings({ dataSources: savedKey ? { themuse: { apiKey: savedKey } } : {} });
    const { themuseSource } = await import("./themuse");

    expect(themuseSource.isConfigured()).toBe(true);
    const result = await themuseSource.fetch({
      searchTerm: "Data Analyst", location: "Remote", radiusMiles: 25, resultsWanted: 1,
    });

    expect(result.success).toBe(true);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({ id: "themuse:7", title: "Data Analyst" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestedUrl.origin).toBe("https://www.themuse.com");
    expect(requestedUrl.searchParams.get("api_key")).toBe(expected);
  });
});
