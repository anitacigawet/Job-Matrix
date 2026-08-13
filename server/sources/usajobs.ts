/**
 * USAJobs — Tier 1 real API source. See DECISIONS.md D-019.
 *
 * US federal civilian job listings (SSA, USDA, NIH, DoD civilian, etc.).
 * Requires a free API key from https://developer.usajobs.gov/ — both the
 * `Authorization-Key` header AND a `User-Agent` matching the email tied to
 * that key are required; USAJobs verifies the pair before serving results.
 *
 * Docs: https://developer.usajobs.gov/Search-API/Usage
 */
import type { JobSource, JobSourceInput } from "./index";
import type { JobSearchResult } from "../routers_indeed";
import { ENV } from "../_core/env";
import { readSettings } from "../_core/settings";

const USAJOBS_BASE = "https://data.usajobs.gov/api/search";
const REQUEST_TIMEOUT_MS = 20_000;

interface USAJobsCreds {
  email: string;
  apiKey: string;
}

interface USAJobsRemuneration {
  MinimumRange?: string;
  MaximumRange?: string;
  RateIntervalCode?: string;
}

interface USAJobsPositionLocation {
  LocationName?: string;
  CityName?: string;
  CountrySubDivisionCode?: string; // 2-letter state
  CountryCode?: string;
}

interface USAJobsMatchedDescriptor {
  PositionID?: string;
  PositionTitle?: string;
  OrganizationName?: string;
  PositionLocation?: USAJobsPositionLocation[];
  PositionRemuneration?: USAJobsRemuneration[];
  PositionURI?: string;
  ApplyURI?: string[];
  PositionStartDate?: string;
  PositionEndDate?: string;
  PublicationStartDate?: string;
  UserArea?: { Details?: { JobSummary?: string; PositionFormattedDescription?: Array<{ Label?: string; LabelDescription?: string }> } };
}

interface USAJobsSearchResultItem {
  MatchedObjectDescriptor?: USAJobsMatchedDescriptor;
  MatchedObjectId?: string;
}

interface USAJobsSearchResult {
  SearchResultItems?: USAJobsSearchResultItem[];
  SearchResultCount?: number;
}

interface USAJobsSearchResponse {
  SearchResult?: USAJobsSearchResult;
}

function resolveCredentials(): USAJobsCreds | null {
  const settings = readSettings();
  const fromSettings = settings.dataSources?.usajobs ?? {};
  const email = ENV.usajobsEmail || fromSettings.email || "";
  const apiKey = ENV.usajobsApiKey || fromSettings.apiKey || "";
  if (!email || !apiKey) return null;
  return { email, apiKey };
}

function milesToMiles(miles: number): number {
  return Math.max(1, Math.round(miles));
}

function hoursToDays(hours: number): number {
  return Math.max(1, Math.ceil(hours / 24));
}

function isRemoteOnly(loc: string): boolean {
  const t = loc.trim().toLowerCase();
  return !t || t === "remote" || (t.includes("remote") && t.includes("nationwide"));
}

function extractSalary(rem?: USAJobsRemuneration[]): { min: number | null; max: number | null; interval: string | null } {
  const first = rem?.[0];
  if (!first) return { min: null, max: null, interval: null };
  const min = first.MinimumRange ? parseFloat(first.MinimumRange) : null;
  const max = first.MaximumRange ? parseFloat(first.MaximumRange) : null;
  // RateIntervalCode codes: "PA" per annum, "PH" per hour, "BW" biweekly, etc.
  let interval: string | null = null;
  switch (first.RateIntervalCode) {
    case "PA": interval = "yearly"; break;
    case "PH": interval = "hourly"; break;
    case "BW": interval = "biweekly"; break;
    case "PM": interval = "monthly"; break;
    case "PD": interval = "daily"; break;
    default: interval = null;
  }
  return {
    min: typeof min === "number" && !Number.isNaN(min) ? min : null,
    max: typeof max === "number" && !Number.isNaN(max) ? max : null,
    interval,
  };
}

function buildDescription(d?: USAJobsMatchedDescriptor): string | null {
  if (!d) return null;
  const summary = d.UserArea?.Details?.JobSummary ?? "";
  const formatted = d.UserArea?.Details?.PositionFormattedDescription ?? [];
  const extras = formatted.map((f) => `${f.Label ?? ""}: ${f.LabelDescription ?? ""}`).filter(Boolean);
  const joined = [summary, ...extras].filter(Boolean).join("\n\n");
  return joined.length > 0 ? joined : null;
}

export const usajobsSource: JobSource = {
  id: "usajobs",
  label: "USAJobs",

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
        platformBreakdown: { usajobs: 0 },
        error: "USAJobs credentials not configured (email + apiKey required)",
      };
    }

    const remote = isRemoteOnly(input.location);
    const params = new URLSearchParams({
      Keyword: input.searchTerm,
      ResultsPerPage: String(Math.min(500, Math.max(10, input.resultsWanted))),
    });
    if (!remote && input.location) {
      params.set("LocationName", input.location);
      if (input.radiusMiles > 0) params.set("Radius", String(milesToMiles(input.radiusMiles)));
    } else if (remote) {
      // USAJobs marks remote roles in the search results' RemoteIndicator;
      // there's no clean server-side "remote-only" filter, but adding a
      // synonym keyword helps. The downstream remote/state filter will
      // drop non-fits.
      params.set("RemoteIndicator", "true");
    }
    if (input.hoursOld) {
      params.set("DatePosted", String(hoursToDays(input.hoursOld)));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let data: USAJobsSearchResponse;
    try {
      const res = await fetch(`${USAJOBS_BASE}?${params.toString()}`, {
        signal: controller.signal,
        headers: {
          "Authorization-Key": creds.apiKey,
          "User-Agent": creds.email,
          Accept: "application/json",
          Host: "data.usajobs.gov",
        },
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error("USAJobs rejected the credentials. Check Authorization-Key and User-Agent (email).");
        }
        if (res.status === 429) {
          throw new Error("USAJobs rate-limited — wait a minute and retry");
        }
        throw new Error(`USAJobs HTTP ${res.status}`);
      }
      data = (await res.json()) as USAJobsSearchResponse;
    } catch (e: any) {
      clearTimeout(timer);
      return {
        success: false,
        jobs: [],
        count: 0,
        platformBreakdown: { usajobs: 0 },
        error: e?.message ?? "USAJobs request failed",
      };
    } finally {
      clearTimeout(timer);
    }

    const items = data.SearchResult?.SearchResultItems ?? [];
    const jobs = items.slice(0, input.resultsWanted).map((item) => {
      const d = item.MatchedObjectDescriptor;
      const loc = d?.PositionLocation?.[0];
      const { min: salaryMin, max: salaryMax, interval: salaryInterval } = extractSalary(d?.PositionRemuneration);
      const url = d?.PositionURI ?? d?.ApplyURI?.[0] ?? "";
      const rawId = item.MatchedObjectId ?? d?.PositionID ?? Buffer.from(url).toString("base64").slice(0, 24);
      return {
        id: `usajobs:${rawId}`,
        title: d?.PositionTitle ?? "Untitled",
        company: d?.OrganizationName ?? "U.S. Government",
        location: loc?.LocationName ?? null,
        city: loc?.CityName ?? null,
        state: loc?.CountrySubDivisionCode ?? null,
        salary_min: salaryMin,
        salary_max: salaryMax,
        salary_interval: salaryInterval,
        job_type: null,
        description: buildDescription(d),
        job_url: url,
        date_posted: d?.PublicationStartDate ?? d?.PositionStartDate ?? null,
        site: "usajobs",
      };
    });

    return {
      success: true,
      jobs,
      count: jobs.length,
      platformBreakdown: { usajobs: jobs.length },
    };
  },
};
