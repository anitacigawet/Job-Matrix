/**
 * Per-company ATS adapters — see DECISIONS.md D-020.
 *
 * Each ATS (Greenhouse, Lever, Ashby) exposes a public JSON job board per
 * company. Adapters here fetch that board's jobs, filter client-side by
 * `searchTerm`, and return rows in the unified JobSearchResult shape.
 *
 * The boardId comes from the catalog entry; the adapter does not know
 * about catalog mechanics — it just receives `{ boardId, searchTerm,
 * location, resultsWanted, hoursOld }` and returns jobs.
 */
import type { JobSearchResult } from "../../routers_indeed";
import type { AtsId, CompanyEntry } from "../../../shared/companies-catalog-schema";
import { fetchGreenhouseJobs } from "./greenhouse";
import { fetchLeverJobs } from "./lever";
import { fetchAshbyJobs } from "./ashby";
import { fetchWorkdayJobs } from "./workday";

export interface JobBoardInput {
  /** ATS-specific board identifier (e.g. "anthropic" for Greenhouse; the tenant for Workday). */
  boardId: string;
  /** User search term. Filtered client-side, except Workday which filters server-side. */
  searchTerm: string;
  /** Location filter — applied client-side against job locations when available. */
  location: string;
  /** Cap returned rows. */
  resultsWanted: number;
  /** Hours since posting filter; respected when the ATS exposes a posted-at field. */
  hoursOld?: number;
  /** Workday only: data-center host `{tenant}.wdN.myworkdayjobs.com`. */
  host?: string;
  /** Workday only: site path (case-sensitive). */
  site?: string;
}

export type JobBoardAdapter = (input: JobBoardInput) => Promise<JobSearchResult>;

const ATS_ADAPTERS: Record<AtsId, JobBoardAdapter> = {
  greenhouse: fetchGreenhouseJobs,
  lever: fetchLeverJobs,
  ashby: fetchAshbyJobs,
  workday: fetchWorkdayJobs,
};

/** Dispatch one fetch by company entry. */
export async function fetchCompanyJobs(
  company: CompanyEntry,
  input: Omit<JobBoardInput, "boardId">,
): Promise<JobSearchResult> {
  const adapter = ATS_ADAPTERS[company.ats];
  if (!adapter) {
    return {
      success: false,
      jobs: [],
      count: 0,
      platformBreakdown: { [`company:${company.slug}`]: 0 },
      error: `Unsupported ATS: ${company.ats}`,
    };
  }
  try {
    return await adapter({ ...input, boardId: company.boardId, host: company.host, site: company.site });
  } catch (e: any) {
    return {
      success: false,
      jobs: [],
      count: 0,
      platformBreakdown: { [`company:${company.slug}`]: 0 },
      error: e?.message ?? `${company.name} adapter threw`,
    };
  }
}

/** Shared HTML stripper for description text. */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

const REQUEST_TIMEOUT_MS = 15_000;

/** Shared HTTP wrapper with timeout. ATSes are usually fast; tight ceiling. */
export async function fetchAtsJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json", ...(headers ?? {}) } });
    if (!res.ok) {
      if (res.status === 404) throw new Error(`Board not found at ${url} — check the catalog entry's boardId`);
      if (res.status === 429) throw new Error(`Rate-limited by ${new URL(url).host}`);
      throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function matchesQuery(needle: string, ...haystack: string[]): boolean {
  if (!needle) return true;
  const n = needle.toLowerCase().trim();
  if (!n) return true;
  const hay = haystack.filter(Boolean).join(" ").toLowerCase();
  return hay.includes(n);
}
