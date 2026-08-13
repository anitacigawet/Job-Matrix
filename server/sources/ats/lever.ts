/**
 * Lever Public Postings API — per-company adapter.
 * Endpoint: GET https://api.lever.co/v0/postings/{boardId}?mode=json
 *
 * Returns a flat array of postings. No server-side search — adapter
 * filters client-side. Lever's job categories live under `categories`.
 */
import type { JobSearchResult } from "../../routers_indeed";
import { fetchAtsJson, matchesQuery, stripHtml, type JobBoardInput } from "./base";

interface LeverPosting {
  id?: string;
  text?: string;                 // job title
  hostedUrl?: string;
  applyUrl?: string;
  descriptionPlain?: string;
  description?: string;          // HTML
  createdAt?: number;            // epoch ms
  categories?: {
    team?: string;
    department?: string;
    location?: string;
    commitment?: string;         // "Full-time", etc.
    allLocations?: string[];
  };
  workplaceType?: string;        // "remote" | "on-site" | "hybrid"
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

export async function fetchLeverJobs(input: JobBoardInput): Promise<JobSearchResult> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(input.boardId)}?mode=json`;
  let data: LeverPosting[] | { ok: false; error?: string };
  try {
    data = await fetchAtsJson<LeverPosting[] | { ok: false; error?: string }>(url);
  } catch (e: any) {
    return {
      success: false,
      jobs: [],
      count: 0,
      platformBreakdown: { [`lever:${input.boardId}`]: 0 },
      error: e?.message ?? `Lever fetch failed for ${input.boardId}`,
    };
  }

  // Lever returns `{ ok: false, error: "Document not found" }` for bad slugs.
  if (!Array.isArray(data)) {
    return {
      success: false,
      jobs: [],
      count: 0,
      platformBreakdown: { [`lever:${input.boardId}`]: 0 },
      error: `Lever board "${input.boardId}" not found — check the catalog entry`,
    };
  }

  const cutoffMs = input.hoursOld ? Date.now() - input.hoursOld * 3600_000 : null;
  const filtered = data.filter((j) => {
    if (cutoffMs && typeof j.createdAt === "number" && j.createdAt < cutoffMs) return false;
    return matchesQuery(
      input.searchTerm,
      j.text ?? "",
      j.descriptionPlain ?? stripHtml(j.description ?? ""),
      [j.categories?.team, j.categories?.department].filter(Boolean).join(" "),
    );
  });

  const trimmed = filtered.slice(0, input.resultsWanted);
  const jobs = trimmed.map((j) => {
    const locName = j.categories?.location ?? j.categories?.allLocations?.[0] ?? null;
    const { city, state } = parseCityState(locName ?? undefined);
    const url = j.hostedUrl ?? j.applyUrl ?? "";
    return {
      id: `lever:${input.boardId}:${j.id ?? Buffer.from(url).toString("base64").slice(0, 16)}`,
      title: j.text ?? "Untitled",
      company: input.boardId,
      location: locName,
      city,
      state,
      salary_min: null,
      salary_max: null,
      salary_interval: null,
      job_type: j.categories?.commitment ?? null,
      description: j.descriptionPlain ?? stripHtml(j.description ?? ""),
      job_url: url,
      date_posted: typeof j.createdAt === "number" ? new Date(j.createdAt).toISOString() : null,
      site: `lever:${input.boardId}`,
    };
  });

  return {
    success: true,
    jobs,
    count: jobs.length,
    platformBreakdown: { [`lever:${input.boardId}`]: jobs.length },
  };
}
