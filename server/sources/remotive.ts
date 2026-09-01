/**
 * Remotive — Tier 1 real API source.
 *
 * No-auth API. Remote-only positions across many categories. Returns a
 * single flat list per query (no pagination) — that simplifies the adapter
 * but means we have to be polite about request frequency.
 *
 * Docs: https://remotive.com/api-documentation/
 */
import type { JobSource, JobSourceInput } from "./index";
import type { JobSearchResult } from "../routers_indeed";

const REMOTIVE_URL = "https://remotive.com/api/remote-jobs";
const REQUEST_TIMEOUT_MS = 20_000;

interface RemotiveJob {
  id?: number;
  url?: string;
  title?: string;
  company_name?: string;
  category?: string;
  tags?: string[];
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
}

interface RemotiveResponse {
  jobs?: RemotiveJob[];
  "job-count"?: number;
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

/** Parse a Remotive salary string (e.g. "$80,000 - $120,000") into min/max. */
function parseSalaryRange(salary?: string): { min: number | null; max: number | null } {
  if (!salary) return { min: null, max: null };
  const nums = salary.match(/\$?\s*([\d,]+)(?:\s*[kK])?/g);
  if (!nums || nums.length === 0) return { min: null, max: null };
  const parsed = nums.map((n) => {
    const clean = n.replace(/[$,\s]/g, "");
    const isK = /[kK]/.test(n);
    const v = parseInt(clean, 10);
    if (isNaN(v)) return null;
    return isK ? v * 1000 : v;
  }).filter((v): v is number => v !== null);
  if (parsed.length === 0) return { min: null, max: null };
  if (parsed.length === 1) return { min: parsed[0], max: parsed[0] };
  return { min: Math.min(...parsed), max: Math.max(...parsed) };
}

export const remotiveSource: JobSource = {
  id: "remotive",
  label: "Remotive",

  isConfigured() {
    return true;
  },

  async fetch(input: JobSourceInput): Promise<JobSearchResult> {
    const params = new URLSearchParams();
    if (input.searchTerm) params.set("search", input.searchTerm);
    // Remotive supports `category` (software-dev, customer-support, etc.).
    // We don't have a clean category mapping yet, so just feed `search`.
    // `limit` caps response size to keep things snappy.
    params.set("limit", String(Math.min(50, Math.max(10, input.resultsWanted * 2))));

    const url = `${REMOTIVE_URL}?${params.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let data: RemotiveResponse;
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        if (res.status === 429) throw new Error("Remotive rate-limited — try again later");
        throw new Error(`Remotive HTTP ${res.status}`);
      }
      data = (await res.json()) as RemotiveResponse;
    } catch (e: any) {
      clearTimeout(timer);
      return {
        success: false,
        jobs: [],
        count: 0,
        platformBreakdown: { remotive: 0 },
        error: e?.message ?? "Remotive request failed",
      };
    } finally {
      clearTimeout(timer);
    }

    const incoming = data.jobs ?? [];

    // Optional client-side location filter: when the user is not searching
    // remote-only, we still keep all Remotive rows (Remotive is remote-only
    // by definition) but filter on `candidate_required_location` if it
    // excludes the user's region. Most listings say "Worldwide" or
    // "USA Only" — both keep.
    const trimmed = incoming.slice(0, input.resultsWanted);

    const jobs = trimmed.map((j) => {
      const url = j.url ?? "";
      const id = j.id != null ? `remotive:${j.id}` : `remotive:${Buffer.from(url).toString("base64").slice(0, 24)}`;
      const { min: salaryMin, max: salaryMax } = parseSalaryRange(j.salary);
      return {
        id,
        title: j.title ?? "Untitled",
        company: j.company_name ?? "Unknown Company",
        location: j.candidate_required_location ?? "Remote",
        city: null,
        state: null,
        salary_min: salaryMin,
        salary_max: salaryMax,
        salary_interval: salaryMin || salaryMax ? "yearly" : null,
        job_type: j.job_type ?? null,
        description: stripHtml(j.description ?? ""),
        job_url: url,
        date_posted: j.publication_date ?? null,
        site: "remotive",
      };
    });

    return {
      success: true,
      jobs,
      count: jobs.length,
      platformBreakdown: { remotive: jobs.length },
    };
  },
};
