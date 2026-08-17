import { protectedProcedure, router } from "./_core/trpc";
import { getScraperHealthSnapshot } from "./db";

/**
 * Scraper health surface — per-platform last-success / last-failure / error
 * snapshot. Drives the Settings page's "Scraper Health" card so users see
 * the truth about which platforms work and which are blocked, instead of
 * the README's static (and quickly stale) "experimental" disclaimer.
 *
 * Updates happen as a side effect of every `searchJobs` call in
 * `routers_indeed.ts` — every scrape attempt records per-platform health.
 */
export const scrapersRouter = router({
  /** Current health snapshot across all supported platforms. */
  health: protectedProcedure.query(async ({ ctx }) => {
    const snapshot = await getScraperHealthSnapshot();
    if (ctx.hosted) {
      return snapshot.map(row => ({
        platform: row.platform,
        lastSuccessAt: null,
        lastAttemptAt: null,
        lastError: null,
        totalAttempts: 0,
        totalFailures: 0,
      }));
    }
    return snapshot;
  }),
});
