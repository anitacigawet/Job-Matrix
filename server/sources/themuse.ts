/**
 * The Muse — Tier 1 real API source.
 *
 * No-auth API; an optional API key raises the per-IP rate limit.
 * Docs: https://www.themuse.com/developers/api/v2
 *
 * Coverage skews early/mid-career, especially in tech + media. Lightweight
 * descriptions but high signal-to-noise per row.
 */
import type { JobSource, JobSourceInput } from "./index";
import type { JobSearchResult } from "../routers_indeed";
import { ENV } from "../_core/env";
import { readSettings } from "../_core/settings";

const MUSE_BASE = "https://www.themuse.com/api/public/jobs";
const MUSE_MAX_PAGE_SIZE = 20; // The Muse hard-caps results per page
const MUSE_MAX_PAGES = 4;       // 4 × 20 = 80 rows ceiling
const REQUEST_TIMEOUT_MS = 20_000;

interface MuseLocation { name?: string }
interface MuseCompany { name?: string }
interface MuseLevel { name?: string; short_name?: string }
interface MuseCategory { name?: string }
interface MuseJob {
  id?: number | string;
  name?: string;
  contents?: string;
  publication_date?: string;
  refs?: { landing_page?: string };
  company?: MuseCompany;
  locations?: MuseLocation[];
  levels?: MuseLevel[];
  categories?: MuseCategory[];
  type?: string;
}
interface MuseSearchResponse {
  results?: MuseJob[];
  page?: number;
  page_count?: number;
}

function resolveApiKey(): string | null {
  const key = ENV.themuseApiKey || readSettings().dataSources?.themuse?.apiKey || "";
  return key.length > 0 ? key : null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCityState(loc?: string): { city: string | null; state: string | null } {
  if (!loc) return { city: null, state: null };
  const parts = loc.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return { city: parts[0], state: parts[parts.length - 1] };
  if (parts.length === 1) {
    const sole = parts[0];
    if (sole.toLowerCase().includes("remote") || sole.toLowerCase().includes("flexible")) {
      return { city: null, state: null };
    }
    return { city: sole, state: null };
  }
  return { city: null, state: null };
}

function isRemoteOnly(loc: string): boolean {
  const t = loc.trim().toLowerCase();
  return !t || t === "remote" || (t.includes("remote") && t.includes("nationwide"));
}

async function fetchOnePage(params: URLSearchParams): Promise<MuseSearchResponse> {
  const url = `${MUSE_BASE}?${params.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      if (res.status === 429) throw new Error("The Muse rate-limited — try again later");
      throw new Error(`The Muse HTTP ${res.status}`);
    }
    return (await res.json()) as MuseSearchResponse;
  } finally {
    clearTimeout(timer);
  }
}

export const themuseSource: JobSource = {
  id: "themuse",
  label: "The Muse",

  isConfigured() {
    // No-auth source. Always "configured" — the optional API key just
    // raises the rate ceiling.
    return true;
  },

  async fetch(input: JobSourceInput): Promise<JobSearchResult> {
    const apiKey = resolveApiKey();
    const remote = isRemoteOnly(input.location);
    const pageCap = Math.min(MUSE_MAX_PAGES, Math.ceil(input.resultsWanted / MUSE_MAX_PAGE_SIZE));

    const collected: MuseJob[] = [];
    try {
      for (let page = 1; page <= pageCap; page++) {
        const params = new URLSearchParams({ page: String(page) });
        if (apiKey) params.set("api_key", apiKey);
        // The Muse uses repeated `location=` and `category=` for OR-filters.
        // We're search-by-keyword, so funnel the search term into `category`
        // if it matches a known one; otherwise fall back to a client-side
        // keyword filter against `name` + `contents`.
        if (remote) params.append("location", "Flexible / Remote");
        else if (input.location) params.append("location", input.location);

        const data = await fetchOnePage(params);
        const results = data.results ?? [];
        collected.push(...results);
        if (results.length === 0) break;
        if (data.page_count && page >= data.page_count) break;
        if (collected.length >= input.resultsWanted * 2) break; // over-fetch to allow keyword filter
      }
    } catch (e: any) {
      return {
        success: false,
        jobs: [],
        count: 0,
        platformBreakdown: { themuse: 0 },
        error: e?.message ?? "The Muse request failed",
      };
    }

    const needle = input.searchTerm.trim().toLowerCase();
    const filtered = collected.filter((j) => {
      if (!needle) return true;
      const hay = `${j.name ?? ""} ${stripHtml(j.contents ?? "")}`.toLowerCase();
      return hay.includes(needle);
    });

    const trimmed = filtered.slice(0, input.resultsWanted);
    const jobs = trimmed.map((j) => {
      const locName = j.locations?.[0]?.name ?? null;
      const { city, state } = extractCityState(locName ?? undefined);
      const url = j.refs?.landing_page ?? "";
      const id = j.id != null ? `themuse:${j.id}` : `themuse:${Buffer.from(url).toString("base64").slice(0, 24)}`;
      return {
        id,
        title: j.name ?? "Untitled",
        company: j.company?.name ?? "Unknown Company",
        location: locName,
        city,
        state,
        salary_min: null,
        salary_max: null,
        salary_interval: null,
        job_type: j.type ?? j.levels?.[0]?.name ?? null,
        description: stripHtml(j.contents ?? ""),
        job_url: url,
        date_posted: j.publication_date ?? null,
        site: "themuse",
      };
    });

    return {
      success: true,
      jobs,
      count: jobs.length,
      platformBreakdown: { themuse: jobs.length },
    };
  },
};
