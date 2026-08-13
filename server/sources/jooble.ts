/**
 * Jooble — Tier 1 real API source. See DECISIONS.md D-019.
 *
 * Aggregator covering many job-board sources. POST request body, API key
 * embedded in the URL path. Requires a partner API key (manual approval —
 * sign up at https://jooble.org/api/about).
 *
 * Docs: https://jooble.org/api/about
 */
import type { JobSource, JobSourceInput } from "./index";
import type { JobSearchResult } from "../routers_indeed";
import { ENV } from "../_core/env";
import { readSettings } from "../_core/settings";

const JOOBLE_BASE = "https://jooble.org/api";
const REQUEST_TIMEOUT_MS = 20_000;

interface JoobleJob {
  title?: string;
  location?: string;
  snippet?: string;
  salary?: string;
  source?: string;
  type?: string;
  link?: string;
  company?: string;
  updated?: string;
  id?: number;
}

interface JoobleSearchResponse {
  totalCount?: number;
  jobs?: JoobleJob[];
}

function resolveApiKey(): string | null {
  const settings = readSettings();
  const fromSettings = settings.dataSources?.jooble ?? {};
  const apiKey = ENV.joobleApiKey || fromSettings.apiKey || "";
  return apiKey.length > 0 ? apiKey : null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSalaryRange(salary?: string): { min: number | null; max: number | null } {
  if (!salary) return { min: null, max: null };
  const nums = salary.match(/(\d[\d,\.]*)\s*(?:k|K)?/g);
  if (!nums || nums.length === 0) return { min: null, max: null };
  const parsed = nums.map((n) => {
    const isK = /[kK]/.test(n);
    const v = parseFloat(n.replace(/[^\d.]/g, ""));
    if (isNaN(v)) return null;
    return isK ? v * 1000 : v;
  }).filter((v): v is number => v !== null && v > 0);
  if (parsed.length === 0) return { min: null, max: null };
  if (parsed.length === 1) return { min: parsed[0], max: parsed[0] };
  return { min: Math.min(...parsed), max: Math.max(...parsed) };
}

function extractCityState(loc?: string): { city: string | null; state: string | null } {
  if (!loc) return { city: null, state: null };
  const parts = loc.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return { city: parts[0], state: parts[parts.length - 1] };
  if (parts.length === 1) return { city: parts[0], state: null };
  return { city: null, state: null };
}

function isRemoteOnly(loc: string): boolean {
  const t = loc.trim().toLowerCase();
  return !t || t === "remote" || (t.includes("remote") && t.includes("nationwide"));
}

function hoursToDays(hours: number): number {
  return Math.max(1, Math.ceil(hours / 24));
}

export const joobleSource: JobSource = {
  id: "jooble",
  label: "Jooble",

  isConfigured() {
    return resolveApiKey() !== null;
  },

  async fetch(input: JobSourceInput): Promise<JobSearchResult> {
    const apiKey = resolveApiKey();
    if (!apiKey) {
      return {
        success: false,
        jobs: [],
        count: 0,
        platformBreakdown: { jooble: 0 },
        error: "Jooble API key not configured",
      };
    }

    const remote = isRemoteOnly(input.location);
    const body: Record<string, unknown> = {
      keywords: input.searchTerm,
      page: 1,
      ResultOnPage: Math.min(50, Math.max(10, input.resultsWanted)),
    };
    if (!remote && input.location) {
      body.location = input.location;
      if (input.radiusMiles > 0) body.radius = String(input.radiusMiles);
    }
    if (input.hoursOld) {
      body.datecreatedfrom = new Date(Date.now() - hoursToDays(input.hoursOld) * 86400 * 1000)
        .toISOString().slice(0, 10);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let data: JoobleSearchResponse;
    try {
      const res = await fetch(`${JOOBLE_BASE}/${encodeURIComponent(apiKey)}`, {
        signal: controller.signal,
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error("Jooble rejected the API key");
        }
        if (res.status === 429) {
          throw new Error("Jooble rate-limited — wait and retry");
        }
        throw new Error(`Jooble HTTP ${res.status}`);
      }
      data = (await res.json()) as JoobleSearchResponse;
    } catch (e: any) {
      clearTimeout(timer);
      return {
        success: false,
        jobs: [],
        count: 0,
        platformBreakdown: { jooble: 0 },
        error: e?.message ?? "Jooble request failed",
      };
    } finally {
      clearTimeout(timer);
    }

    const incoming = data.jobs ?? [];
    const trimmed = incoming.slice(0, input.resultsWanted);
    const jobs = trimmed.map((j) => {
      const url = j.link ?? "";
      const id = j.id != null ? `jooble:${j.id}` : `jooble:${Buffer.from(url).toString("base64").slice(0, 24)}`;
      const { min: salaryMin, max: salaryMax } = parseSalaryRange(j.salary);
      const { city, state } = extractCityState(j.location);
      return {
        id,
        title: j.title ?? "Untitled",
        company: j.company ?? j.source ?? "Unknown Company",
        location: j.location ?? null,
        city,
        state,
        salary_min: salaryMin,
        salary_max: salaryMax,
        salary_interval: salaryMin || salaryMax ? "yearly" : null,
        job_type: j.type ?? null,
        description: stripHtml(j.snippet ?? ""),
        job_url: url,
        date_posted: j.updated ?? null,
        site: "jooble",
      };
    });

    return {
      success: true,
      jobs,
      count: jobs.length,
      platformBreakdown: { jooble: jobs.length },
    };
  },
};
