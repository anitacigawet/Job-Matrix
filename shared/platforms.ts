/**
 * Platform tier classification — see DECISIONS.md D-019.
 *
 * Tier 1: real public API, documented, stable. No scraping, no ToS exposure.
 * Tier 2: scraper-backed (JobSpy). Best-effort; may break as platforms iterate.
 * Tier 3: authenticated scraping (cookie-based). Deferred; not yet implemented.
 */
export const PLATFORM_TIER = {
  // Tier 1 — real APIs (Phase 13)
  adzuna: 1,
  usajobs: 1,
  jooble: 1,
  themuse: 1,
  remotive: 1,
  remoteok: 1,

  // Tier 2 — JobSpy scrapers
  indeed: 2,
  glassdoor: 2,
  linkedin: 2,
  ziprecruiter: 2,
  google: 2,
} as const;

export type PlatformId = keyof typeof PLATFORM_TIER;
export type PlatformTier = 1 | 2 | 3;

export const ALL_PLATFORMS = Object.keys(PLATFORM_TIER) as PlatformId[];

export function tierOf(platform: PlatformId): PlatformTier {
  return PLATFORM_TIER[platform] as PlatformTier;
}

export function platformsInTier(tier: PlatformTier): PlatformId[] {
  return ALL_PLATFORMS.filter((p) => PLATFORM_TIER[p] === tier);
}
