/**
 * Tier-1 source adapters.
 *
 * A `JobSource` is the contract every Tier-1 (real API) data source implements.
 * Tier-2 scrapers go through the existing Python/JobSpy path in routers_indeed.ts.
 *
 * Adapters here run inside the Node process — no Python subprocess needed —
 * and return rows in the same shape as JobSpy output so the rest of the
 * pipeline (dedup, save, AI filter, score) doesn't care where rows came from.
 */
import type { JobSearchResult } from "../routers_indeed";
import { adzunaSource } from "./adzuna";
import { usajobsSource } from "./usajobs";
import { joobleSource } from "./jooble";
import { themuseSource } from "./themuse";
import { remotiveSource } from "./remotive";
import { remoteokSource } from "./remoteok";
import { PLATFORM_TIER, type PlatformId } from "../../shared/platforms";

export interface JobSourceInput {
  searchTerm: string;
  location: string;
  radiusMiles: number;
  resultsWanted: number;
  /** Hours since posting; mirrors JobSpy's `hours_old`. May be ignored by adapters that don't support it. */
  hoursOld?: number;
}

export interface JobSource {
  /** Stable id; must match a Tier-1 entry in PLATFORM_TIER. */
  id: PlatformId;
  /** Display label for UI ("Adzuna"). */
  label: string;
  /** True iff the user has supplied the credentials this source needs. */
  isConfigured(): boolean;
  /** Run one search. Always resolves — errors are returned as `{ success: false, error }`. */
  fetch(input: JobSourceInput): Promise<JobSearchResult>;
}

const SOURCES: Record<string, JobSource> = {
  adzuna: adzunaSource,
  usajobs: usajobsSource,
  jooble: joobleSource,
  themuse: themuseSource,
  remotive: remotiveSource,
  remoteok: remoteokSource,
};

export function getSource(id: PlatformId): JobSource | null {
  return SOURCES[id] ?? null;
}

/** Tier-1 platforms registered as adapters in this module. */
export function tier1Platforms(): PlatformId[] {
  return (Object.keys(SOURCES) as PlatformId[]).filter((id) => PLATFORM_TIER[id] === 1);
}
