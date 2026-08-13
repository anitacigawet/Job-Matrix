/**
 * Greenhouse Job Board API — per-company adapter.
 * Endpoint: GET https://boards-api.greenhouse.io/v1/boards/{boardId}/jobs?content=true
 */
import type { JobSearchResult } from "../../routers_indeed";
import { fetchAtsJson, matchesQuery, stripHtml, type JobBoardInput } from "./base";

interface GreenhouseJob {
  id: number | string;
  title?: string;
  absolute_url?: string;
  content?: string;          // HTML; only present when content=true
  updated_at?: string;
  location?: { name?: string };
  departments?: Array<{ name?: string }>;
  offices?: Array<{ name?: string; location?: string }>;
  metadata?: unknown;
}

interface GreenhouseResponse {
  jobs?: GreenhouseJob[];
  meta?: { total?: number };
}

function parseCityState(loc?: string): { city: string | null; state: string | null } {
  if (!loc) return { city: null, state: null };
  const parts = loc.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return { city: parts[0], state: parts[parts.length - 1] };
  if (parts.length === 1) {
    const sole = parts[0];
    if (/remote|anywhere/i.test(sole)) return { city: null, state: null };
    return { city: sole, state: null };
  }
  return { city: null, state: null };
}

export async function fetchGreenhouseJobs(input: JobBoardInput): Promise<JobSearchResult> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(input.boardId)}/jobs?content=true`;
  let data: GreenhouseResponse;
  try {
    data = await fetchAtsJson<GreenhouseResponse>(url);
  } catch (e: any) {
    return {
      success: false,
      jobs: [],
      count: 0,
      platformBreakdown: { [`gh:${input.boardId}`]: 0 },
      error: e?.message ?? `Greenhouse fetch failed for ${input.boardId}`,
    };
  }

  const all = data.jobs ?? [];
  const cutoffMs = input.hoursOld ? Date.now() - input.hoursOld * 3600_000 : null;

  const filtered = all.filter((j) => {
    if (cutoffMs && j.updated_at) {
      const ts = Date.parse(j.updated_at);
      if (!Number.isNaN(ts) && ts < cutoffMs) return false;
    }
    if (!matchesQuery(
      input.searchTerm,
      j.title ?? "",
      stripHtml(j.content ?? ""),
      (j.departments ?? []).map((d) => d.name ?? "").join(" "),
    )) {
      return false;
    }
    return true;
  });

  const trimmed = filtered.slice(0, input.resultsWanted);
  const jobs = trimmed.map((j) => {
    const locName = j.location?.name ?? null;
    const { city, state } = parseCityState(locName ?? undefined);
    const url = j.absolute_url ?? "";
    return {
      id: `gh:${input.boardId}:${j.id}`,
      title: j.title ?? "Untitled",
      company: input.boardId, // overridden by caller with display name from catalog
      location: locName,
      city,
      state,
      salary_min: null,
      salary_max: null,
      salary_interval: null,
      job_type: (j.departments ?? []).map((d) => d.name ?? "").filter(Boolean).join(", ") || null,
      description: stripHtml(j.content ?? ""),
      job_url: url,
      date_posted: j.updated_at ?? null,
      site: `gh:${input.boardId}`,
    };
  });

  return {
    success: true,
    jobs,
    count: jobs.length,
    platformBreakdown: { [`gh:${input.boardId}`]: jobs.length },
  };
}
