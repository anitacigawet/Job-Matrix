/**
 * RemoteOK — Tier 1 real API source. See DECISIONS.md D-019.
 *
 * No-auth API. Remote-only, tech-heavy listings. The endpoint returns a
 * single flat array with a "legal" notice as the first element; this
 * adapter strips that and does client-side keyword filtering against
 * the search term.
 *
 * Docs: https://remoteok.com/api
 */
import type { JobSource, JobSourceInput } from "./index";
import type { JobSearchResult } from "../routers_indeed";

const REMOTEOK_URL = "https://remoteok.com/api";
const REMOTEOK_UA = "JobMatrix/0.1 (https://github.com/anitacigawet/Job-Matrix)";
const REQUEST_TIMEOUT_MS = 20_000;

interface RemoteOKJob {
  // RemoteOK returns mixed strings/numbers — be permissive on input.
  id?: number | string;
  slug?: string;
  position?: string;
  company?: string;
  location?: string;
  tags?: string[];
  description?: string;
  url?: string;
  apply_url?: string;
  date?: string;
  salary_min?: number;
  salary_max?: number;
  // First array element is a "legal" object with a `legal` string; identifiable
  // by absence of a position/title.
  legal?: string;
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

export const remoteokSource: JobSource = {
  id: "remoteok",
  label: "RemoteOK",

  isConfigured() {
    return true;
  },

  async fetch(input: JobSourceInput): Promise<JobSearchResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let raw: RemoteOKJob[];
    try {
      // RemoteOK requires a non-default User-Agent — bare `fetch` is blocked.
      const res = await fetch(REMOTEOK_URL, {
        signal: controller.signal,
        headers: { "User-Agent": REMOTEOK_UA, Accept: "application/json" },
      });
      if (!res.ok) {
        if (res.status === 429) throw new Error("RemoteOK rate-limited — try again later");
        if (res.status === 403) throw new Error("RemoteOK blocked the request — User-Agent rejected");
        throw new Error(`RemoteOK HTTP ${res.status}`);
      }
      raw = (await res.json()) as RemoteOKJob[];
    } catch (e: any) {
      clearTimeout(timer);
      return {
        success: false,
        jobs: [],
        count: 0,
        platformBreakdown: { remoteok: 0 },
        error: e?.message ?? "RemoteOK request failed",
      };
    } finally {
      clearTimeout(timer);
    }

    // First element is a "legal" notice (no `position`). Filter it out.
    const real = raw.filter((j) => j && (j.position || j.slug) && !j.legal);

    // Client-side keyword filter against position + tags + company. RemoteOK
    // has no server-side search, so this is the only filter available.
    const needle = input.searchTerm.trim().toLowerCase();
    const matched = needle
      ? real.filter((j) => {
          const hay = [
            j.position ?? "",
            j.company ?? "",
            ...(j.tags ?? []),
          ].join(" ").toLowerCase();
          return hay.includes(needle);
        })
      : real;

    const trimmed = matched.slice(0, input.resultsWanted);
    const jobs = trimmed.map((j) => {
      const url = j.url ?? j.apply_url ?? `https://remoteok.com/remote-jobs/${j.slug ?? j.id ?? ""}`;
      const id = j.id != null ? `remoteok:${j.id}` : `remoteok:${Buffer.from(url).toString("base64").slice(0, 24)}`;
      return {
        id,
        title: j.position ?? "Untitled",
        company: j.company ?? "Unknown Company",
        location: j.location ?? "Remote",
        city: null,
        state: null,
        salary_min: typeof j.salary_min === "number" ? j.salary_min : null,
        salary_max: typeof j.salary_max === "number" ? j.salary_max : null,
        salary_interval: j.salary_min || j.salary_max ? "yearly" : null,
        job_type: null,
        description: stripHtml(j.description ?? ""),
        job_url: url,
        date_posted: j.date ?? null,
        site: "remoteok",
      };
    });

    return {
      success: true,
      jobs,
      count: jobs.length,
      platformBreakdown: { remoteok: jobs.length },
    };
  },
};
