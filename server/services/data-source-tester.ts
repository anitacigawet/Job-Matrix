/**
 * Tier-1 data source connection tester. Mirrors `provider-tester.ts` for the
 * LLM keys: round-trip a single minimal request, humanise the error.
 * Used by the "Test Connection" button on Settings → Data Sources.
 */

export type DataSourceId = "adzuna" | "usajobs" | "jooble" | "themuse";

export interface DataSourceTestResult {
  ok: boolean;
  message: string;
  latencyMs: number;
  status?: number;
}

export type AnyCredentials =
  | { appId: string; appKey: string }
  | { email: string; apiKey: string }
  | { apiKey: string };

const TEST_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function testAdzuna(appId: string, appKey: string): Promise<DataSourceTestResult> {
  const t0 = Date.now();
  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: "1",
    what: "engineer",
  });
  const url = `https://api.adzuna.com/v1/api/jobs/us/search/1?${params.toString()}`;
  try {
    const res = await fetchWithTimeout(url);
    const latencyMs = Date.now() - t0;
    if (res.ok) {
      return {
        ok: true,
        message: `Adzuna credentials valid (${latencyMs}ms).`,
        latencyMs,
        status: res.status,
      };
    }
    let detail = "";
    try {
      const body = (await res.json()) as { exception?: string; message?: string };
      detail = body.exception || body.message || "";
    } catch {
      detail = (await res.text().catch(() => "")).slice(0, 200);
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        message: "Adzuna rejected the credentials. Check app_id / app_key at developer.adzuna.com.",
        latencyMs,
        status: res.status,
      };
    }
    if (res.status === 429) {
      return {
        ok: false,
        message: "Adzuna rate-limited the request. Wait a minute and retry — or your monthly quota may be exhausted.",
        latencyMs,
        status: res.status,
      };
    }
    return {
      ok: false,
      message: `Adzuna returned HTTP ${res.status}${detail ? `: ${detail}` : ""}`,
      latencyMs,
      status: res.status,
    };
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("AbortError") || msg.includes("timed out")) {
      return { ok: false, message: `Could not reach Adzuna within ${TEST_TIMEOUT_MS / 1000}s. Check your network.`, latencyMs };
    }
    return { ok: false, message: `Network error reaching Adzuna: ${msg}`, latencyMs };
  }
}

async function testUSAJobs(email: string, apiKey: string): Promise<DataSourceTestResult> {
  const t0 = Date.now();
  const url = "https://data.usajobs.gov/api/search?Keyword=engineer&ResultsPerPage=1";
  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        "Authorization-Key": apiKey,
        "User-Agent": email,
        Accept: "application/json",
        Host: "data.usajobs.gov",
      },
    });
    const latencyMs = Date.now() - t0;
    if (res.ok) {
      return { ok: true, message: `USAJobs credentials valid (${latencyMs}ms).`, latencyMs, status: res.status };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "USAJobs rejected the credentials. Verify the API key matches the email at developer.usajobs.gov.", latencyMs, status: res.status };
    }
    if (res.status === 429) {
      return { ok: false, message: "USAJobs rate-limited the request. Wait a minute and retry.", latencyMs, status: res.status };
    }
    return { ok: false, message: `USAJobs returned HTTP ${res.status}`, latencyMs, status: res.status };
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Network error reaching USAJobs: ${msg}`, latencyMs };
  }
}

async function testJooble(apiKey: string): Promise<DataSourceTestResult> {
  const t0 = Date.now();
  const url = `https://jooble.org/api/${encodeURIComponent(apiKey)}`;
  try {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ keywords: "engineer", page: 1, ResultOnPage: 1 }),
    });
    const latencyMs = Date.now() - t0;
    if (res.ok) {
      return { ok: true, message: `Jooble API key valid (${latencyMs}ms).`, latencyMs, status: res.status };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "Jooble rejected the API key. Confirm your partner key is active at jooble.org/api/about.", latencyMs, status: res.status };
    }
    return { ok: false, message: `Jooble returned HTTP ${res.status}`, latencyMs, status: res.status };
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Network error reaching Jooble: ${msg}`, latencyMs };
  }
}

async function testTheMuse(apiKey: string): Promise<DataSourceTestResult> {
  const t0 = Date.now();
  const params = new URLSearchParams({ page: "1" });
  if (apiKey) params.set("api_key", apiKey);
  const url = `https://www.themuse.com/api/public/jobs?${params.toString()}`;
  try {
    const res = await fetchWithTimeout(url);
    const latencyMs = Date.now() - t0;
    if (res.ok) {
      return {
        ok: true,
        message: apiKey
          ? `The Muse responded with the higher-rate-limit key (${latencyMs}ms).`
          : `The Muse responded on the no-auth tier (${latencyMs}ms). The optional key just raises rate limits.`,
        latencyMs,
        status: res.status,
      };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "The Muse rejected the API key (it should still work without one — try clearing the field).", latencyMs, status: res.status };
    }
    return { ok: false, message: `The Muse returned HTTP ${res.status}`, latencyMs, status: res.status };
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Network error reaching The Muse: ${msg}`, latencyMs };
  }
}

export async function testDataSourceConnection(
  source: DataSourceId,
  credentials: AnyCredentials,
): Promise<DataSourceTestResult> {
  if (source === "adzuna") {
    const c = credentials as { appId: string; appKey: string };
    if (!c.appId || c.appId.length < 4) return { ok: false, message: "Enter your Adzuna app_id before testing.", latencyMs: 0 };
    if (!c.appKey || c.appKey.length < 8) return { ok: false, message: "Enter your Adzuna app_key before testing.", latencyMs: 0 };
    return testAdzuna(c.appId, c.appKey);
  }
  if (source === "usajobs") {
    const c = credentials as { email: string; apiKey: string };
    if (!c.email || !c.email.includes("@")) return { ok: false, message: "Enter a valid email for the USAJobs User-Agent header.", latencyMs: 0 };
    if (!c.apiKey || c.apiKey.length < 8) return { ok: false, message: "Enter your USAJobs API key.", latencyMs: 0 };
    return testUSAJobs(c.email, c.apiKey);
  }
  if (source === "jooble") {
    const c = credentials as { apiKey: string };
    if (!c.apiKey || c.apiKey.length < 8) return { ok: false, message: "Enter your Jooble partner API key.", latencyMs: 0 };
    return testJooble(c.apiKey);
  }
  if (source === "themuse") {
    const c = credentials as { apiKey: string };
    // No-auth source — apiKey is optional. Either way we just confirm the endpoint responds.
    return testTheMuse(c.apiKey ?? "");
  }
  return { ok: false, message: `Unknown data source: ${source}`, latencyMs: 0 };
}
