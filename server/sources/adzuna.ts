/**
 * Adzuna — Tier 1 real API source.
 *
 * Adzuna docs: https://developer.adzuna.com/docs/search
 *
 * Free hobbyist plan ("Trial Access") covers personal use. Quota is small,
 * so we cap pagination and pass `max_days_old` through honestly to avoid
 * burning calls.
 */
import type { JobSource, JobSourceInput } from "./index";
import type { JobSearchResult } from "../routers_indeed";
import { ENV } from "../_core/env";
import { readSettings } from "../_core/settings";

const ADZUNA_BASE = "https://api.adzuna.com/v1/api/jobs";
const ADZUNA_DEFAULT_COUNTRY = "us"; // matches our existing Indeed default
const ADZUNA_MAX_PAGE_SIZE = 50;     // Adzuna's hard cap per their docs
const ADZUNA_MAX_PAGES = 4;          // 4 * 50 = 200 rows ceiling — conservative for Trial Access
const REQUEST_TIMEOUT_MS = 20_000;

interface AdzunaCredentials {
  appId: string;
  appKey: string;
}

interface AdzunaSearchResult {
  id?: string | number;
  title?: string;
  description?: string;
  redirect_url?: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  salary_min?: number;
  salary_max?: number;
  contract_time?: string;
  contract_type?: string;
  created?: string;
}

interface AdzunaSearchResponse {
  count?: number;
  results?: AdzunaSearchResult[];
  exception?: string;
  message?: string;
}

function resolveCredentials(): AdzunaCredentials | null {
  const settings = readSettings();
  const fromSettings = settings.dataSources?.adzuna ?? {};
  const appId = ENV.adzunaAppId || fromSettings.appId || settings.adzunaAppId || "";
  const appKey = ENV.adzunaAppKey || fromSettings.appKey || settings.adzunaAppKey || "";
  if (!appId || !appKey) return null;
  return { appId, appKey };
}

/** Detect remote-only / nationwide searches so we drop the `where` filter. */
function isRemoteOnlyLocation(loc: string): boolean {
  const trimmed = loc.trim().toLowerCase();
  if (!trimmed) return true;
  if (trimmed === "remote") return true;
  if (trimmed.includes("remote") && trimmed.includes("nationwide")) return true;
  return false;
}

function milesToKm(miles: number): number {
  return Math.max(1, Math.round(miles * 1.60934));
}

function hoursToDays(hours: number): number {
  return Math.max(1, Math.ceil(hours / 24));
}

/** Parse "Austin, TX" or location.area like ["US", "Texas", "Austin"] into a {city, state} pair. */
function extractCityState(loc?: { display_name?: string; area?: string[] }): { city: string | null; state: string | null } {
  if (!loc) return { city: null, state: null };
  // area is usually [country, state, city, ...]; pick the deepest pair available.
  if (Array.isArray(loc.area) && loc.area.length >= 2) {
    const state = loc.area[1] ?? null;
    const city = loc.area[loc.area.length - 1] ?? null;
    if (city && state && city !== state) return { city, state };
  }
  // Fallback: split display_name by comma.
  if (loc.display_name) {
    const parts = loc.display_name.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      // "City, State" — Adzuna usually emits this format for US results.
      return { city: parts[0], state: parts[parts.length - 1] };
    }
    if (parts.length === 1) return { city: parts[0], state: null };
  }
  return { city: null, state: null };
}

/** Pull one page; throws on transport errors so the orchestrator can label the platform failed. */
async function fetchOnePage(
  creds: AdzunaCredentials,
  country: string,
  page: number,
  params: URLSearchParams,
): Promise<AdzunaSearchResponse> {
  const url = `${ADZUNA_BASE}/${country}/search/${page}?${params.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      let detail = "";
      try {
        const body = (await res.json()) as { exception?: string; message?: string };
        detail = body.exception || body.message || "";
      } catch {
        detail = (await res.text().catch(() => "")).slice(0, 200);
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error("Adzuna credentials rejected (check app_id / app_key)");
      }
      if (res.status === 429) {
        throw new Error("Adzuna rate-limited — try again later or wait for monthly quota reset");
      }
      throw new Error(`Adzuna HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
    }
    return (await res.json()) as AdzunaSearchResponse;
  } finally {
    clearTimeout(timer);
  }
}

export const adzunaSource: JobSource = {
  id: "adzuna",
  label: "Adzuna",

  isConfigured() {
    return resolveCredentials() !== null;
  },

  async fetch(input: JobSourceInput): Promise<JobSearchResult> {
    const creds = resolveCredentials();
    if (!creds) {
      return {
        success: false,
        jobs: [],
        count: 0,
        platformBreakdown: { adzuna: 0 },
        error: "Adzuna credentials not configured",
      };
    }

    const country = (process.env.ADZUNA_COUNTRY || ADZUNA_DEFAULT_COUNTRY).toLowerCase();
    const remote = isRemoteOnlyLocation(input.location);
    const pageSize = Math.min(ADZUNA_MAX_PAGE_SIZE, Math.max(1, input.resultsWanted));
    const pagesNeeded = Math.min(ADZUNA_MAX_PAGES, Math.ceil(input.resultsWanted / pageSize));

    const baseParams = new URLSearchParams({
      app_id: creds.appId,
      app_key: creds.appKey,
      results_per_page: String(pageSize),
      what: input.searchTerm,
      sort_by: "date",
    });
    if (!remote && input.location) {
      baseParams.set("where", input.location);
      if (input.radiusMiles > 0) baseParams.set("distance", String(milesToKm(input.radiusMiles)));
    }
    if (input.hoursOld) {
      baseParams.set("max_days_old", String(hoursToDays(input.hoursOld)));
    }

    const collected: AdzunaSearchResult[] = [];
    try {
      for (let page = 1; page <= pagesNeeded; page++) {
        const data = await fetchOnePage(creds, country, page, baseParams);
        const results = data.results ?? [];
        collected.push(...results);
        if (results.length < pageSize) break;          // exhausted the result set
        if (collected.length >= input.resultsWanted) break;
      }
    } catch (e: any) {
      return {
        success: false,
        jobs: [],
        count: 0,
        platformBreakdown: { adzuna: 0 },
        error: e?.message ?? "Adzuna request failed",
      };
    }

    const trimmed = collected.slice(0, input.resultsWanted);
    const jobs = trimmed.map((r) => {
      const { city, state } = extractCityState(r.location);
      const company = r.company?.display_name ?? "Unknown Company";
      const url = r.redirect_url ?? "";
      // Adzuna IDs are numeric; prefix so global jobId space stays unambiguous
      // when the same numeric id appears under a different `site`.
      const id = r.id != null ? `adzuna:${r.id}` : `adzuna:${Buffer.from(url).toString("base64").slice(0, 24)}`;
      return {
        id,
        title: r.title ?? "Untitled",
        company,
        location: r.location?.display_name ?? null,
        city,
        state,
        salary_min: typeof r.salary_min === "number" ? r.salary_min : null,
        salary_max: typeof r.salary_max === "number" ? r.salary_max : null,
        salary_interval: r.salary_min || r.salary_max ? "yearly" : null,
        job_type: r.contract_time ?? r.contract_type ?? null,
        description: r.description ?? null,
        job_url: url,
        date_posted: r.created ?? null,
        site: "adzuna",
      };
    });

    return {
      success: true,
      jobs,
      count: jobs.length,
      platformBreakdown: { adzuna: jobs.length },
    };
  },
};
