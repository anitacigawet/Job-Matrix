/**
 * Companies router — catalog + watched companies (Phase 14, D-020).
 *
 * `catalog` — public catalog read; used by the Preferences "Companies"
 *  sub-tab to render the searchable list.
 * `watched` — per-user list of catalog slugs the user has added.
 *  Scan path consumes this to fan out per-company ATS fetches.
 */
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { readCompaniesCatalog } from "./companies-catalog";
import {
  listWatchedCompanies,
  addWatchedCompany,
  removeWatchedCompany,
  clearWatchedCompanies,
} from "./db";

const slugSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, { message: "slug must be lowercase, hyphenated, alphanumeric" })
  .min(1)
  .max(80);

export const companiesRouter = router({
  /** Full catalog of companies known to Job Matrix's ATS adapters. */
  catalog: protectedProcedure.query(() => {
    return { companies: readCompaniesCatalog() };
  }),

  /** Slugs the current user has elected to watch. */
  watched: protectedProcedure.query(async ({ ctx }) => {
    const rows = await listWatchedCompanies(ctx.user.id);
    const catalog = readCompaniesCatalog();
    const bySlug = new Map(catalog.map((c) => [c.slug, c]));
    // Join in catalog details so the UI doesn't need a second round-trip,
    // and drop watched rows that no longer match a catalog entry (could
    // happen if a community PR removed a company).
    return rows
      .map((row) => {
        const entry = bySlug.get(row.companySlug);
        if (!entry) return null;
        return { ...row, company: entry };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }),

  add: protectedProcedure
    .input(z.object({ companySlug: slugSchema }))
    .mutation(async ({ ctx, input }) => {
      const catalog = readCompaniesCatalog();
      if (!catalog.some((c) => c.slug === input.companySlug)) {
        throw new Error(`"${input.companySlug}" is not in the companies catalog. Open a PR at companies-catalog.yaml to add it.`);
      }
      return addWatchedCompany(ctx.user.id, input.companySlug);
    }),

  remove: protectedProcedure
    .input(z.object({ companySlug: slugSchema }))
    .mutation(async ({ ctx, input }) => {
      return removeWatchedCompany(ctx.user.id, input.companySlug);
    }),

  clear: protectedProcedure.mutation(async ({ ctx }) => {
    return clearWatchedCompanies(ctx.user.id);
  }),
});
