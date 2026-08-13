/**
 * Ashby Job Board API — per-company adapter.
 * Endpoint: GET https://api.ashbyhq.com/posting-api/job-board/{boardId}
 *
 * Returns a `jobs` array on the company's public posting API. 404 on
 * a bad slug. Response includes both plain-text and HTML descriptions.
 */
import type { JobSearchResult } from "../../routers_indeed";
import { fetchAtsJson, matchesQuery, type JobBoardInput } from "./base";

interface AshbyJob {
  id?: string;
  title?: string;
  department?: string;
  team?: string;
  employmentType?: string;       // "FullTime" | "PartTime" | ...
  location?: string;
  secondaryLocations?: string[];
  publishedAt?: string;
  isListed?: boolean;
  isRemote?: boolean;
  workplaceType?: string;        // "Remote" | "Onsite" | "Hybrid"
  descriptionPlain?: string;
  descriptionHtml?: string;
  applyUrl?: string;
  jobUrl?: string;
}

interface AshbyResponse {
  jobs?: AshbyJob[];
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

export async function fetchAshbyJobs(input: JobBoardInput): Promise<JobSearchResult> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(input.boardId)}?includeCompensation=true`;
  let data: AshbyResponse;
  try {
    data = await fetchAtsJson<AshbyResponse>(url);
  } catch (e: any) {
    return {
      success: false,
      jobs: [],
      count: 0,
      platformBreakdown: { [`ashby:${input.boardId}`]: 0 },
      error: e?.message ?? `Ashby fetch failed for ${input.boardId}`,
    };
  }

  const all = data.jobs ?? [];
  const cutoffMs = input.hoursOld ? Date.now() - input.hoursOld * 3600_000 : null;

  const filtered = all.filter((j) => {
    if (j.isListed === false) return false;
    if (cutoffMs && j.publishedAt) {
      const ts = Date.parse(j.publishedAt);
      if (!Number.isNaN(ts) && ts < cutoffMs) return false;
    }
    return matchesQuery(
      input.searchTerm,
      j.title ?? "",
      j.descriptionPlain ?? "",
      [j.department, j.team].filter(Boolean).join(" "),
    );
  });

  const trimmed = filtered.slice(0, input.resultsWanted);
  const jobs = trimmed.map((j) => {
    const locName = j.location ?? null;
    const { city, state } = parseCityState(locName ?? undefined);
    const url = j.jobUrl ?? j.applyUrl ?? "";
    return {
      id: `ashby:${input.boardId}:${j.id ?? Buffer.from(url).toString("base64").slice(0, 16)}`,
      title: j.title ?? "Untitled",
      company: input.boardId,
      location: locName,
      city,
      state,
      salary_min: null,
      salary_max: null,
      salary_interval: null,
      job_type: j.employmentType ?? null,
      description: j.descriptionPlain ?? "",
      job_url: url,
      date_posted: j.publishedAt ?? null,
      site: `ashby:${input.boardId}`,
    };
  });

  return {
    success: true,
    jobs,
    count: jobs.length,
    platformBreakdown: { [`ashby:${input.boardId}`]: jobs.length },
  };
}
