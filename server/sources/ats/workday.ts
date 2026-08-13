/**
 * Workday — per-company adapter. See DECISIONS.md D-022.
 *
 * Endpoint: POST https://{host}/wday/cxs/{tenant}/{site}/jobs
 *   body:    { appliedFacets: {}, limit, offset, searchText }
 *   host  = "{tenant}.wdN.myworkdayjobs.com" (catalog `host`; the wdN
 *           data-center number is not derivable, so the catalog stores it)
 *   tenant = catalog `boardId`
 *   site  = catalog `site` (case-sensitive, e.g. "targetcareers")
 *
 * Unlike Greenhouse / Lever / Ashby, Workday filters server-side: the
 * user's search term goes in `searchText`, so we don't fetch-all-and-
 * filter (large tenants return thousands of postings). The list response
 * carries no job description — only title / location / posted-on / req-id.
 * Fetching descriptions would mean one detail request per job (up to 50
 * per company per title in the scan fan-out), which is too costly; we
 * leave `description` empty. The AI filter tolerates this (it falls back
 * to title + location). Per-job description enrichment is a deferred
 * follow-up if Workday filter quality proves inadequate.
 */
import type { JobSearchResult } from "../../routers_indeed";
import type { JobBoardInput } from "./base";

interface WorkdayPosting {
  title?: string;
  externalPath?: string;        // relative path; job URL = https://{host}/{site}{externalPath}
  locationsText?: string;       // messy: can be a region or a full street address
  postedOn?: string;            // fuzzy human string: "Posted Today" / "Posted 5 Days Ago"
  bulletFields?: string[];      // usually [reqId]
}

interface WorkdayResponse {
  total?: number;
  jobPostings?: WorkdayPosting[];
}

const WD_USER_AGENT = "Mozilla/5.0 (compatible; JobMatrix/1.0; local-first job search)";
const REQUEST_TIMEOUT_MS = 15_000;
const PAGE_SIZE = 20; // Workday's per-request cap

async function postWorkday(url: string, body: object): Promise<WorkdayResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": WD_USER_AGENT,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const host = new URL(url).host;
      if (res.status === 404) throw new Error(`Workday board not found at ${url} — check host/tenant/site`);
      if (res.status === 422) throw new Error(`Workday rejected request (422) from ${host} — tenant/site likely wrong for this board`);
      if (res.status === 429) throw new Error(`Rate-limited by ${host}`);
      throw new Error(`HTTP ${res.status} from ${host}`);
    }
    return (await res.json()) as WorkdayResponse;
  } finally {
    clearTimeout(timer);
  }
}

/** Convert Workday's fuzzy "Posted X" string into an approximate age in hours. */
function approxAgeHours(postedOn?: string): number | null {
  if (!postedOn) return null;
  const s = postedOn.toLowerCase();
  if (/today|just posted/.test(s)) return 12;
  if (/yesterday/.test(s)) return 36;
  const m = s.match(/(\d+)\s*\+?\s*(hour|day|week|month)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  switch (m[2]) {
    case "hour": return n;
    case "day": return n * 24 + 12;
    case "week": return n * 7 * 24;
    case "month": return n * 30 * 24;
    default: return null;
  }
}

/** Best-effort city/state from Workday's messy locationsText (often a street address). */
function parseWorkdayLocation(loc?: string): { location: string | null; city: string | null; state: string | null } {
  if (!loc) return { location: null, city: null, state: null };
  const clean = loc.trim();
  if (!clean) return { location: null, city: null, state: null };
  if (/remote|virtual|anywhere/i.test(clean)) return { location: clean, city: null, state: null };
  // Workday shows "N Locations" as a placeholder when a posting spans
  // multiple sites — it's a count, not a place, so don't treat it as a city.
  if (/^\d+\s+locations?$/i.test(clean)) return { location: clean, city: null, state: null };

  // US state token: a 2-letter uppercase code, optionally followed by a ZIP.
  const stateMatch = clean.match(/\b([A-Z]{2})\b(?=\s*\d{5}|\s*$|,)/);
  const state = stateMatch ? stateMatch[1] : null;

  const parts = clean.split(",").map((p) => p.trim()).filter(Boolean);
  let city: string | null = null;
  if (parts.length >= 2) {
    // The segment just before the state-bearing tail is usually the city.
    city = parts[parts.length - 2] || parts[0];
  } else {
    city = parts[0] ?? null;
  }
  // Strip a trailing "ST 12345"-style tail off the city guess.
  if (city) city = city.replace(/\b[A-Z]{2}\b\s*\d{0,5}.*$/, "").trim() || null;
  return { location: clean, city, state };
}

export async function fetchWorkdayJobs(input: JobBoardInput): Promise<JobSearchResult> {
  const tag = `wd:${input.boardId}`;
  if (!input.host || !input.site) {
    return {
      success: false,
      jobs: [],
      count: 0,
      platformBreakdown: { [tag]: 0 },
      error: `Workday entry "${input.boardId}" is missing host/site — check the catalog entry`,
    };
  }

  const url = `https://${input.host}/wday/cxs/${input.boardId}/${input.site}/jobs`;
  const maxPages = Math.max(1, Math.min(5, Math.ceil(input.resultsWanted / PAGE_SIZE)));
  const collected: WorkdayPosting[] = [];

  try {
    for (let page = 0; page < maxPages; page++) {
      const data = await postWorkday(url, {
        appliedFacets: {},
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        searchText: input.searchTerm ?? "",
      });
      const batch = data.jobPostings ?? [];
      collected.push(...batch);
      if (batch.length < PAGE_SIZE || collected.length >= input.resultsWanted) break;
    }
  } catch (e: any) {
    return {
      success: false,
      jobs: [],
      count: 0,
      platformBreakdown: { [tag]: 0 },
      error: e?.message ?? `Workday fetch failed for ${input.boardId}`,
    };
  }

  const cutoffMs = input.hoursOld ? Date.now() - input.hoursOld * 3600_000 : null;
  const filtered = collected.filter((p) => {
    if (cutoffMs == null) return true;
    const age = approxAgeHours(p.postedOn);
    if (age == null) return true; // unknown age — keep rather than silently drop
    return Date.now() - age * 3600_000 >= cutoffMs;
  });

  const trimmed = filtered.slice(0, input.resultsWanted);
  const jobs = trimmed.map((p) => {
    const { location, city, state } = parseWorkdayLocation(p.locationsText);
    const age = approxAgeHours(p.postedOn);
    const datePosted = age != null ? new Date(Date.now() - age * 3600_000).toISOString() : null;
    const reqId = (p.bulletFields ?? []).find(Boolean) ?? "";
    const externalPath = p.externalPath ?? "";
    const idSeed = reqId || externalPath || p.title || "";
    return {
      id: `${tag}:${reqId || Buffer.from(idSeed).toString("base64").slice(0, 20)}`,
      title: p.title ?? "Untitled",
      company: input.boardId, // overridden by caller with display name from catalog
      location,
      city,
      state,
      salary_min: null,
      salary_max: null,
      salary_interval: null,
      job_type: null,
      description: "", // Workday list endpoint carries no description — see file header
      job_url: externalPath ? `https://${input.host}/${input.site}${externalPath}` : `https://${input.host}/${input.site}`,
      date_posted: datePosted,
      site: tag,
    };
  });

  return {
    success: true,
    jobs,
    count: jobs.length,
    platformBreakdown: { [tag]: jobs.length },
  };
}
