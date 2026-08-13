/**
 * Companies Catalog — Zod schema + types. See DECISIONS.md D-020.
 *
 * The catalog file at `companies-catalog.yaml` (repo root) is parsed at
 * server boot via this schema. Invalid entries log a warning and are
 * dropped — a malformed contribution should never crash the app.
 */
import { z } from "zod";

export const ATS_IDS = ["greenhouse", "lever", "ashby", "workday"] as const;
export type AtsId = (typeof ATS_IDS)[number];

export const companyEntrySchema = z.object({
  /** Human-readable company name shown in UI. */
  name: z.string().trim().min(1).max(120),

  /**
   * Stable internal identifier. Lowercase, hyphenated. Used as a
   * primary key in watched_companies. Often matches `boardId` but the
   * two are kept separate so we can rename one without churning the DB.
   */
  slug: z.string().trim().regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, {
    message: "slug must be lowercase, hyphenated, alphanumeric",
  }).min(1).max(80),

  /** Applicant tracking system this company uses. */
  ats: z.enum(ATS_IDS),

  /**
   * The board identifier in the ATS URL — e.g. `anthropic` in
   * `boards-api.greenhouse.io/v1/boards/anthropic/jobs`. For Workday this
   * is the tenant (the `{tenant}` in `/wday/cxs/{tenant}/{site}/jobs`).
   */
  boardId: z.string().trim().min(1).max(120),

  /**
   * Workday only: the data-center host, `{tenant}.wdN.myworkdayjobs.com`.
   * Required when `ats === "workday"` (see refine below) because the
   * `wdN` data-center number is not derivable. Unused by the other ATSes.
   */
  host: z.string().trim().min(1).max(120).optional(),

  /**
   * Workday only: the (case-sensitive) site path — e.g. `targetcareers`
   * in `target.wd5.myworkdayjobs.com/targetcareers`. Required when
   * `ats === "workday"`. Unused by the other ATSes.
   */
  site: z.string().trim().min(1).max(120).optional(),

  /** Optional company website. */
  website: z.string().url().optional(),

  /** Optional tags for filtering. */
  tags: z.array(z.string().trim().min(1).max(40)).optional(),
}).superRefine((entry, ctx) => {
  if (entry.ats === "workday") {
    if (!entry.host) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["host"], message: "host is required for Workday entries (e.g. acme.wd5.myworkdayjobs.com)" });
    }
    if (!entry.site) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["site"], message: "site is required for Workday entries (the site path, e.g. acmecareers)" });
    }
  }
});

export const companiesCatalogSchema = z.object({
  companies: z.array(companyEntrySchema),
});

export type CompanyEntry = z.infer<typeof companyEntrySchema>;
export type CompaniesCatalog = z.infer<typeof companiesCatalogSchema>;

/**
 * API endpoint patterns per ATS — used by the adapters and by endpoint
 * health-check tooling. Takes the catalog-entry fields each ATS needs:
 * Greenhouse / Lever / Ashby use only `boardId`; Workday also needs
 * `host` + `site`.
 */
export type AtsEndpointInput = { boardId: string; host?: string; site?: string };

export const ATS_ENDPOINTS: Record<AtsId, { jobs: (e: AtsEndpointInput) => string; careersPage: (e: AtsEndpointInput) => string }> = {
  greenhouse: {
    jobs: (e) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(e.boardId)}/jobs?content=true`,
    careersPage: (e) => `https://boards.greenhouse.io/${e.boardId}`,
  },
  lever: {
    jobs: (e) => `https://api.lever.co/v0/postings/${encodeURIComponent(e.boardId)}?mode=json`,
    careersPage: (e) => `https://jobs.lever.co/${e.boardId}`,
  },
  ashby: {
    jobs: (e) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(e.boardId)}`,
    careersPage: (e) => `https://jobs.ashbyhq.com/${e.boardId}`,
  },
  workday: {
    // POST endpoint — body is { appliedFacets, limit, offset, searchText }.
    jobs: (e) => `https://${e.host}/wday/cxs/${e.boardId}/${e.site}/jobs`,
    careersPage: (e) => `https://${e.host}/${e.site}`,
  },
};
