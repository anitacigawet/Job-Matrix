# Job Matrix — Active Tasks

Atomic-chunk ledger paired with [`ROADMAP.md`](ROADMAP.md). Completed work is
preserved here as history; explicitly operator-gated items are never picked up
autonomously.

**Session-open contract:** verify the current repository state first. If a true
implementation item exists under `ACTIVE`, the operator's “continue” cue picks
it up. Items labeled operator-gated require the stated live credentials,
provider interaction, or operator judgment.

Last updated: 2026-08-12.

---

## COMPLETED — Phase 18: Public beta front door (2026-08-12)

- Rewrote the README outside-in for job seekers and accessibility-minded
  contributors, using Fractal Framework's reader-first voice as the reference.
- Replaced the system-control landing card with a product introduction; Factory
  Reset moved to Settings → Local data with its hooks and confirmation intact.
- Added three reproducible Playwright screenshots from the sanitized snapshot.
- Added CI, dependency monitoring, Windows-safe production start, and patched
  DOMPurify/nanoid releases.
- Prepared GitHub description/topics and the v0.2.0-beta release boundary.
- Published Job Matrix under PolyForm Noncommercial 1.0.0, prohibiting
  commercial use while preserving JobSpy's separate upstream MIT notice.

## COMPLETED — Phase 17: Reliability and release-readiness stabilization (2026-08-03)

A full takeover audit identified runtime truth, privacy, test-quality,
dependency, responsive-layout, persistence, and repository-hygiene defects. The
stabilization pass repaired them before new feature work:

- database-backed onboarding and reset state on every request;
- loopback-only Express binding for the no-auth local server;
- one shared personalized-search pipeline for manual and scheduled scans;
- active-title and enabled-source enforcement, ATS source-ID preservation, and
  honest per-source failure aggregation;
- atomic SQLite export replacement and batched tracked-job writes;
- supported OpenAI, DeepSeek, and Gemini SDKs with normalized tool and response
  options;
- isolated behavioral tests with no skipped or self-validating cases;
- responsive mobile navigation plus route-level bundle splitting;
- dependency updates and an explicit transitive security override;
- honest local-data/provider-transmission language in the product and README;
- private operator memory and verbatim third-party prompt sources removed from
  Git tracking and preserved outside the repository.

The architectural contract is recorded in D-024.

---

## COMPLETED IMPLEMENTATION / OPERATOR-GATED EXIT — Phase 13: Data Source Maturity

Opened 2026-05-18 in response to operator-greenlit tiered-source plan. See `DECISIONS.md` D-019 for the architectural call. Goal: add a Tier-1 API source (Adzuna) alongside the existing Tier-2 JobSpy scrapers, so the dashboard has a reliable data path that isn't dependent on the JobSpy maintenance treadmill or the three "not operable" platforms from D-014.

**Exit criterion:** Adzuna lands as a first-class platform (toggle + credential UI + health telemetry + wired into the scan path), README + Concierge prompt mention it, and a real scan against the operator's profile returns Adzuna rows merged with the existing JobSpy Indeed/LinkedIn rows. Tier-3 (authenticated scraping) is explicitly out of scope; carved out for a later phase.

**Source adapter seam (D-019, Option A):** extend `SupportedPlatform` union with `"adzuna"`, branch in `searchJobs()` so JobSpy entries call the Python subprocess and Tier-1 entries call a TS-side adapter in `server/sources/`. New `PLATFORM_TIER` map labels each platform 1/2/3 for UI grouping. Reuse existing `scraper_health` table for telemetry — no migration.

- [x] **D13.1** — Source-adapter scaffolding landed. `shared/platforms.ts` exposes the `PLATFORM_TIER` map + `tierOf()` / `platformsInTier()` helpers. `server/sources/index.ts` defines `JobSource` + `JobSourceInput` and a `getSource(id)` registry. `server/sources/adzuna.ts` shipped as a stub that returns `success: true, count: 0`. `searchJobs()` in `routers_indeed.ts` now splits input platforms by tier and fans out — Tier 1 to TS adapters, Tier 2 to the Python subprocess via the new `scrapeViaJobSpy()` helper. Schema-level `platform` unions extended in `drizzle/schema.ts` to accept `"adzuna"` + `"google"` on `tracked_jobs` / `applied_jobs` / `job_scan_history` / `platform_credentials`. `db.ts` `SUPPORTED_SCRAPER_PLATFORMS` extended so health telemetry covers Adzuna.
- [x] **D13.2** — Real Adzuna client in `server/sources/adzuna.ts`. Hits `api.adzuna.com/v1/api/jobs/{country}/search/{page}` with `app_id` / `app_key` / `results_per_page` / `what` / `where` / `distance` (km, converted from miles) / `max_days_old` (converted from hours). Pagination capped at 4 pages × 50 rows for hobbyist quotas. `extractCityState()` parses `location.area` (US format `["US", "Texas", "Travis County", "Austin"]`) preferring `area[1]` as state + `area[area.length-1]` as city, with `display_name` comma-split fallback. Errors humanised at the boundary: 401/403 → "credentials rejected", 429 → "rate-limited", everything else → "HTTP {status}: {body}". Live API verified working against operator's Trial Access account during dev — returned 284 results for "software engineer / Austin, TX".
- [x] **D13.3** — `routers_settings.ts` extended with `getDataSources` / `saveDataSource` / `clearDataSource` / `testDataSource` mutations + a new `getDataSourcesForApi()` helper that exposes configured-state and masked credentials. `server/services/data-source-tester.ts` mirrors the provider-tester pattern. Settings UI gets a new "Data Sources" sub-tab in `SUBNAV_BY_ROUTE` slotted between LLM and Auto-scan; `DataSourcesCard.tsx` renders one card per Tier-1 source with credential inputs, Test Connection, Save, Clear. Env-var path is read-only in UI (inputs disabled, "set via env var" callout shown).
- [x] **D13.4** — `searchJobs()` now does cross-tier dedupe at the merge step. Key is `(title, company, city)` lowercased+trimmed; first occurrence wins, which means Tier-1 (Adzuna) survives over JobSpy twins because adapters run before the JobSpy subprocess in the fan-out order. Degenerate keys (missing title or company) are passed through to avoid collapsing distinct jobs into one bucket. `[Source Dispatch] Cross-tier dedupe dropped indeed: N` log line surfaces the activity. Defaults updated: `getEnabledPlatforms` now returns `["indeed", "linkedin", "adzuna"]` instead of `["indeed", "glassdoor", "linkedin"]` — drops the D-014 "not operable" Glassdoor and adds Tier-1 Adzuna. `updatePlatforms` Zod enum extended to accept `"adzuna"` + `"google"`.
- [x] **D13.5** — Adzuna card added to the Platforms page (first card, before the JobSpy lineup). New `tier: 1 | 2` field on `PlatformConfig` drives a "TIER 1 · API" emerald badge for Adzuna vs a "TIER 2 · SCRAPER" slate badge for the JobSpy platforms. When Adzuna is toggled on but `dataSources.adzuna.configured === false`, an amber inline callout surfaces with a "Configure in Settings →" CTA (`configure-adzuna-credentials` hook → `setLocation("/settings")`). When configured, a green callout reads "Credentials configured (from env var | settings file)". `localEnabled` default updated to match the new backend default.
- [x] **D13.6** — Docs sweep landed. README "Scraping scope" callout reframed as "Data source coverage" with separate Tier 1 / Tier 2 sections. SCRAPER_TRIAGE.md gained a 2026-05-19 preamble pointing at D-019. AGENT_HOOKS_REFERENCE.md extended with `save-adzuna-credentials` / `clear-adzuna-credentials` / `test-adzuna-credentials` / `configure-adzuna-credentials` actions, `data-source-{id}` / `data-source-{id}-status` / `platform-needs-credentials-{platform}` / `platform-credentials-ok-{platform}` status hooks, and `adzuna-app-id` / `adzuna-app-key` input hooks. Concierge prompt got a one-line Adzuna mention. CHANGELOG entry written for the phase. Smoke tests: `pnpm check` clean; `pnpm test` clean except for an unrelated pre-existing failure in `client/src/lib/sanitize.test.ts` (XSS-prevention test wraps `<img>` in `<p>` — last touched in `e12d698` before Phase 13; flagged as a follow-up task).
- [ ] **D13.7** — Phase 13 exit review with operator. *(operator)* Run a real scan against operator's profile + an Adzuna search radius they care about. Confirm rows merge cleanly, dedupe doesn't drop legit listings, health card shows Adzuna green. If satisfied, advance to D13.8+.

### Extended Phase 13 — additional search-aggregator sources (added 2026-05-19)

Operator clarified that "all Tier 1 platforms" was the original intent of Phase 13, not just Adzuna. Adding the four other usable search-aggregators with real public APIs. Per-company ATS sources (Greenhouse / Lever / Ashby / Workable) are deliberately deferred to Phase 14 because they need a new "Watched Companies" UX, not just a new adapter.

- [x] **D13.8** — USAJobs adapter shipped at [server/sources/usajobs.ts](../../server/sources/usajobs.ts). Calls `data.usajobs.gov/api/search` with `Authorization-Key` + `User-Agent` headers. Parses `MatchedObjectDescriptor` shape; pulls salary from `PositionRemuneration[0]` with `RateIntervalCode` → "yearly"/"hourly"/etc. mapping. `extractSalary()` handles the typed-number-as-string quirk. Adapter no-ops cleanly when credentials are missing — waits on operator-supplied key + email.
- [x] **D13.9** — Jooble adapter shipped at [server/sources/jooble.ts](../../server/sources/jooble.ts). POSTs `{keywords, location, page, ResultOnPage, radius, datecreatedfrom}` to `jooble.org/api/<key>`. Same no-op-when-missing pattern as USAJobs. `parseSalaryRange()` handles Jooble's loose salary string format ("$80,000 - $120,000", "80k - 120k", etc.).
- [x] **D13.10** — The Muse adapter shipped at [server/sources/themuse.ts](../../server/sources/themuse.ts). `isConfigured()` returns true unconditionally (no-auth tier always works). Optional API key from settings raises the per-IP rate limit. Live-verified: 20 jobs returned in one test call. Adapter over-fetches by 2× and then keyword-filters client-side because The Muse's server-side search is category-based not keyword-based.
- [x] **D13.11** — Remotive adapter shipped at [server/sources/remotive.ts](../../server/sources/remotive.ts). No auth. Single-page request — no pagination on Remotive's side. Live-verified: 18 jobs returned for "engineer".
- [x] **D13.12** — RemoteOK adapter shipped at [server/sources/remoteok.ts](../../server/sources/remoteok.ts). No auth, but requires a non-default `User-Agent` (bare `fetch` returns 403). First array element is a "legal" notice — adapter filters it out by checking for `position` field presence. Client-side keyword filter against `position + company + tags`. Live-verified: 99 real jobs returned.

**Cross-cutting refactor before D13.8 lands:** the settings.json shape from D13.3 has flat `adzunaAppId` / `adzunaAppKey` fields. With 5 new sources arriving — some with different credential shapes (USAJobs has `email + apiKey`, Jooble has just `apiKey`, the others have none) — flat fields don't scale. Refactor to a nested `dataSources: { adzuna: { appId, appKey }, usajobs: { email, apiKey }, jooble: { apiKey } }` shape. Back-compat: migrate existing flat fields into the nested shape on first read.

**UI propagation:** `getDataSourcesForApi()` returns a `fields[]` array per source so `DataSourcesCard.tsx` can render per-source forms dynamically rather than hard-coding Adzuna's shape. Platforms page gets cards for the 5 new sources; tier badge ("TIER 1 · API") is already in place. AGENT_HOOKS_REFERENCE extended with per-source action and input hooks.

**Operator-blocking dependencies:**
- D13.8 needs the operator's USAJobs API key + email — can ship code against a stub until then.
- D13.9 needs Jooble partner-key approval — same, ship code first.

---

## COMPLETED — Phase 14: Per-Company ATS Sources + Companies Catalog (shipped 2026-05-19)

The Tier-1 work in Phase 13 covered every search-aggregator worth integrating. Phase 14 added the second shape of Tier-1 source: **per-company ATS feeds** routed through a generic `JobBoardAdapter`, driven by a catalog at `companies-catalog.yaml`. *(Originally scoped as community-contributable by PR; D-022 later made the catalog maintainer-curated — catalog PRs are not accepted.)* Three ATSes shipped (Greenhouse, Lever, Ashby); Workable deferred (a Workday adapter shipped later in Phase 16).

See `DECISIONS.md` D-020 for the architectural call.

- [x] **D14.1** — D-020 written. Captures catalog format choice (YAML for inline-comment support), file location (repo root), validation strategy (per-entry, log-and-drop, never crash), watched-companies data model, scan-path integration, contributor flow, and the explicit out-of-scope list.
- [x] **D14.2** — `shared/companies-catalog-schema.ts` (Zod schema for entries + ATS endpoint URL helpers) + `server/companies-catalog.ts` (parser with memoized read, per-entry validation, first-occurrence-wins slug de-dupe). `js-yaml` added as a runtime dep.
- [x] **D14.8** — Bootstrap catalog at `companies-catalog.yaml` (repo root) seeded with 5 verified entries: Anthropic, Cloudflare, GitLab (Greenhouse); Netlify (Lever); PostHog (Ashby). Verified by hitting their live endpoints during dev. Header comment walks contributors through how to find a company's ATS + slug.
- [x] **D14.3** — `server/sources/ats/base.ts` defines the `JobBoardAdapter` interface + shared HTTP/HTML/match-query helpers + the per-ATS dispatcher (`fetchCompanyJobs`). Adapters: `greenhouse.ts` (hits `boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true`), `lever.ts` (hits `api.lever.co/v0/postings/{slug}?mode=json` and handles the `{ok:false}` non-array shape gracefully), `ashby.ts` (hits `api.ashbyhq.com/posting-api/job-board/{slug}` and filters out `isListed:false` entries).
- [x] **D14.4** — Migration `0004_watched_companies.sql` creates the `watched_companies` table with a `(user_id, company_slug)` unique index. Drizzle schema entry + `listWatchedCompanies` / `addWatchedCompany` / `removeWatchedCompany` / `clearWatchedCompanies` helpers in `db.ts`. New `routers_companies.ts` tRPC router (`catalog` read, `watched` joined with catalog details, `add` / `remove` / `clear` mutations) mounted at `appRouter.companies`.
- [x] **D14.6** — `runGlobalSearch` does a second fan-out after the per-(title, location) loop: for each watched company, fetch jobs in parallel for each user title. Adapters run independently — different hosts, no rate-limit collision. `saveTrackedJob` now accepts per-company `platform` strings (`gh:anthropic`, `lever:netlify`, `ashby:posthog`) verbatim — each company is its own dedup namespace in `tracked_jobs`. Company display names patched in from the catalog before save (adapters return the raw `boardId` slug).
- [x] **D14.5** — New `WatchedCompaniesPanel` component, mounted as the 5th sub-tab on `/preferences` (Profile · Job titles · Résumé · Presets · **Companies**). Searchable input + tag-filter chips + per-row checkbox UI. Empty state nudges contributors toward CONTRIBUTING.md. ATS-coloured badges (Greenhouse green, Lever violet, Ashby rose).
- [x] **D14.7** — `CONTRIBUTING.md` at the repo root. "Add a company" flow with verification `curl` commands per ATS, what we won't accept, PR title/body convention. Also covers bug reports + general code contributions.
- [ ] **D14.9** — Phase 14 exit review with operator. *(operator)* Run a real scan with at least one watched company configured, confirm the per-company jobs land in `tracked_jobs` with `site: "gh:anthropic"`-style values, confirm the AI filter still gates them correctly. If satisfied, close Phase 14.

**Cross-cutting follow-ups (not blocking phase close):**
- Workable adapter — public API too fragmented; add when a specific use case forces it.
- Per-company health telemetry — only worth building if real failure patterns surface.
- CI hook to validate new catalog PRs (run the verification `curl` automatically).

**Operator-blocking dependencies inside Phase 13:**
- D13.3 needs the operator to sign up for an Adzuna API account at [developer.adzuna.com](https://developer.adzuna.com/) (free hobbyist tier, no credit card) and surface `app_id` + `app_key`. Can ship D13.1 / D13.2 against a stub before that happens.
- D13.7 is operator-only by nature.

---

## COMPLETED IMPLEMENTATION / OPERATOR-GATED EXIT — Phase 15: Work-style Quick Fill

Opened 2026-05-20. Curated static-data starter packs of job titles, picked by work-style category + Low/Medium/High slider, applied as append-only merge into `user_job_titles`. Zero LLM cost, zero new dependencies, zero DB migration. See `DECISIONS.md` D-021 for the architectural call.

**Exit criterion:** Quick Fill is reachable from both Preferences → Job titles AND Onboarding step 2; selecting a category + level + clicking Apply adds new titles to `user_job_titles` without disturbing existing entries; all four categories (Introvert-friendly · Extrovert-friendly · Hands-on · Entry-level / no degree) render with 8 entries × 3 levels; AGENT_HOOKS_REFERENCE updated; `pnpm check` and `pnpm test` clean.

- [x] **D15.1** — Architectural call + docs scaffold. D-021 in DECISIONS.md (done in this commit). Phase 15 entry in this file (done). ROADMAP.md "Where we are" updated with Phase 15.
- [x] **D15.2** — Static data file at `shared/work-style-suggestions.ts`. Four categories × three levels × eight titles each + per-level descriptions framed by *the work*, not the person. Titles chosen for actual search-engine hits (Indeed / Adzuna / LinkedIn) — no whimsical entries like "lighthouse keeper."
- [x] **D15.3** — `client/src/components/WorkStyleQuickFill.tsx`. Reusable dialog: category picker (4 cards) → level slider (Low/Medium/High) → checkable title list (pre-checked) → Apply button. Case-insensitive dedup against existing `user_job_titles`. The dialog is the same component whether triggered from Preferences or rendered inline in Onboarding step 2.
- [x] **D15.4** — Wire it up:
   - Preferences → Job titles sub-tab gets a "Quick fill ▾" button at the top of the manage-titles card. Opens the dialog.
   - Onboarding step 2 (Target Positions) gets a quiet "Need ideas? Quick fill" link/button that opens the same dialog. Clear Skip path so users who want to type their own can keep going.
- [x] **D15.5** — AGENT_HOOKS_REFERENCE.md updates (5 new hooks: `open-work-style-quickfill`, `select-work-style-category-{id}`, `set-work-style-level-{level}`, `toggle-suggested-title-{slug}`, `apply-work-style-suggestions`). `pnpm check` + `pnpm test` clean. Commit `e56e63e`.
- [ ] **D15.6** — Operator smoke test. *(operator)* Open the app fresh, click Quick fill in Preferences, try each of the four categories at each level, Apply, confirm the merge behaviour (existing untouched, new ones appended). Repeat the flow inside Onboarding. If satisfied, close Phase 15.

---

## COMPLETED — Phase 16: Workday ATS adapter + full catalog merge (shipped 2026-06-13)

The `catalog-builder/` sweep (Batches 1–5) verified ~650 companies on Greenhouse/Lever/Ashby and logged 544 on unsupported ATSes. Grouping the logs by host made the next move obvious: **Workday = 186 of 544 (34%)**. Phase 16 builds the Workday adapter and merges the full sweep into the live catalog. See `DECISIONS.md` D-022.

- [x] **D16.1** — Full catalog merge. `catalog-builder/promote-to-live.mjs` combines the 5-entry seed + the 645-entry sweep delta, dedupes by slug, sorts ATS-then-name, and rewrites `companies-catalog.yaml` (650 entries: Greenhouse 438 · Lever 67 · Ashby 145). Header reframed from contributor-PR walkthrough to operator-maintainer reference (operator decision: the catalog is his own, not community-contributable). Validated through the real server-side `readCompaniesCatalog()` Zod parse — zero drops, zero dupe slugs.
- [x] **D16.2** — Workday API contract verified live (D-022). Probed the public `POST /wday/cxs/{tenant}/{site}/jobs` endpoint: confirmed request body, `jobPostings[]` response shape, server-side `searchText`, and that `https://{host}/{site}{externalPath}` job URLs resolve. 11 of 18 logged candidates passed the naive tenant=subdomain derivation; the 7 failures confirmed per-company verification is mandatory (not bulk-derive).
- [x] **D16.3** — Schema extension. `shared/companies-catalog-schema.ts`: `"workday"` added to `ATS_IDS`; optional `host` + `site` fields required-when-Workday via `superRefine`; `ATS_ENDPOINTS` signature changed to take entry fields (was unused, safe). Greenhouse/Lever/Ashby entries unchanged.
- [x] **D16.4** — `server/sources/ats/workday.ts` adapter + dispatcher wiring in `base.ts` (`JobBoardInput` gains `host`/`site`; `fetchCompanyJobs` threads them through). Server-side search, pagination, best-effort location + fuzzy-date parsing, empty description (documented limitation). End-to-end smoke green against Target (real jobs, resolving URLs).
- [x] **D16.5** — 11 verified Workday seed entries in `companies-catalog.yaml` (catalog now 661). Workday amber badge in `WatchedCompaniesPanel`. `merge.mjs` + `promote-to-live.mjs` future-proofed to emit/validate/sort `host`+`site` for the upcoming population sweep. `pnpm check` clean. CHANGELOG + DECISIONS + this ledger updated.
- [ ] **D16.6** — Population sweep for the remaining ~175 logged Workday companies. *(follow-on)* Same catalog-builder agent pattern, but every entry needs live cxs verification (the naive derivation only works ~60% of the time). Not started — a discrete future fan-out.

**Cross-cutting follow-up:** the catalog is maintainer-curated, so `CONTRIBUTING.md`'s "add a company" flow, the README "community-maintained catalog" line, and the Preferences → Companies "Add it via PR" CTA were all stale. De-community-fied in the 2026-06-13 stance-alignment pass after the open-source decision (D-023) confirmed the direction.

---

## ACTIVE — operator-gated phase (carried over)

The forward-looking phase below needs actions from the operator, not Claude. Don't pick it up autonomously.

- [ ] **Phase 9 — Briefings live validation** (D9.3 / D9.4 / D9.5 / D9.6 / D9.10). Listen-tests + prompt iteration for daily-coach / weekly-market / infographic / monthly-retrospective. Need the operator to actually run the generations and react. Full chunk list preserved further down under DEFERRED.

*(Phase 12 — Legal & Commercial Pre-flight — was parked here; it is now **closed** by `DECISIONS.md` D-023, resolved as open source. See the closed-out section below.)*

---

## COMPLETED — Phase 11.5: Design Refresh (closed 2026-05-18)

A two-day push that replaced the per-page chrome with a global app-shell, ported every long-lived page to the new SubNav system, ran a code audit + cleanup pass, and added two pieces of cross-cutting polish (master briefings toggle, magnetic-strip SubNav). Decision rationale lives in `DECISIONS.md` D-015 through D-018; this section is the chunk ledger.

### Shell + design tokens (ph1)
- [x] **DR.ph1** — New `client/src/App.tsx` wraps the route tree in `<AppearanceProvider>` + `<AppShell>` (TopNav + SubNav + page-content + footer). New `client/src/contexts/AppearanceContext.tsx` (theme / per-theme accent / glass / density / nav / briefings — persisted in `localStorage["jobmatrix.appearance"]`). New components: `TopNav`, `SubNav` + `SubNavProvider`, `AppearancePopover` + `AppearanceTrigger` + `SettingsAppearance`. `index.css` gained the design tokens, primitives (`.card`, `.btn-*`, `.badge-*`, `.chip`, `.stat`, `.field`, `.empty`, etc.), and the layout classes for the dashboard 3-zone grid + the workflow rail. Commits `36dec24`, plus the drag-to-scrub accent picker (`aa6946d`) and glass slider gradient fix (`005395e`).

### Dashboard port (ph2)
- [x] **DR.ph2** — `TrackedJobsPersonalized.tsx` restructured into `.dash-grid` (rail + main). New components: `WorkflowRail` (consolidates Scan → Filter → Score chain + the Cleanup affordance), `DailyBriefingStrip` (4 states — empty / generating / failed / fresh — for the daily-coach surface), `StatusStrip` (5 cells: Scanned / Eligible / Filtered out / Scored / Awaiting score). Removed the redundant per-page nav-pill row (TopNav owns nav now), the duplicated AI-Filtering timestamp banner, two dead button refs, the orange "(!) Set Up Profile" pill (SearchCriteriaCard already surfaces it). Operation Progress promoted to a full-width banner above the grid. Job cards re-styled: emoji meta row (📍 / 💵 / 💼), hover-date tooltip on the relative-time badge, platform-branded Apply buttons (single + multi-platform popover with an oil-spill gradient), "Eligible Match" + reason line collapsed into "Passed all filters" + confidence badge. Commit `44da555` plus the polish series `6807e3e` / `62a9673` / `c660fe2` / `1c11120` (markdown renderer for descriptions).

### SubNav ports (ph3a–ph3f)
- [x] **DR.ph3a** — Settings reads `useSubNav()` and renders one section at a time (LLM / Notif / Auto-scan / NotebookLM / Appearance). Internal 3-tab shadcn `<Tabs>` strip retired. Bottom "Back to Dashboard" button retired. Commit `800c556`.
- [x] **DR.ph3b** — Briefings split into Generate vs Inbox tabs; empty-state copy updated to point at the Generate tab. Commit `6fb6e9b`.
- [x] **DR.ph3c** — Applied reshapes per tab: `all` is the default list, `pipeline` shows the status grid larger with click-to-filter-and-jump-to-All behavior, `timeline` auto-expands every job's timeline panel. Commit `06e2c73`.
- [x] **DR.ph3d** — JobPreferences's long form split into Profile / Job titles / Résumé. Save Profile button shared between Profile + Résumé via a centralized guard. Commits `9e94137` + `eec9397`.
- [x] **DR.ph3e** — Analytics cards split across Pipeline (funnel, top companies, job types) / Matches (score distribution, top matches) / Scans (recent scans, jobs by platform). Key Metrics Row + Profile Summary always visible. Commit `81c17ce`.
- [x] **DR.ph3f** — Platforms split into Sources (toggle cards + System Overview) and Health (ScraperHealthCard). Gradient-text "Data Sources" H1 banner + redundant "Enter Dashboard" button removed in favour of a standard PageHeader. Commit `652ceb2`.

### Audit + cleanup
- [x] **DR.audit** — Code audit caught five real bugs (null platform crash in PlatformApplyButton, silent fetch error in DailyBriefingStrip, empty-prose fallback in rolePreview, Date|string ambiguity in WorkflowRail, etc.). All fixed in commit `e12d698`.
- [x] **DR.cleanup** — Onboarding bypasses the shell (no TopNav exposure mid-flow); PageHeader's `backHref` default flipped to `null` so 7 sub-pages stop rendering a redundant "Back to Dashboard" arrow; `ThemeContext` + `ThemeToggle` retired (now no-op shims with no callers); dead state purged from `TrackedJobsPersonalized.tsx` (-128 lines: `scanProgress`, `isRefreshingStats`, `debugMode*`, `personalizedScan`, `aiAnalysisTest`, `debugStage1/2/3`); dead CSS purged from `index.css` (-178 lines: `.score*`, `.kbd`, `.skel`, `.empty`, `.toast-*`, `.dialog`, `.pipeline*`, `.provider-tab*`, `.sidenav`, `.terminal*`); 13 undocumented agent hooks caught up in AGENT_HOOKS_REFERENCE. Commits `e68b054`, `2ef62d1`, `41ffd54`, `9f39617`.

### Master briefings toggle + presets move
- [x] **DR.briefings-toggle** — `briefings: boolean` added to AppearanceContext (default true). When off, the DailyBriefingStrip, TopNav "Briefings" entry, Settings "NotebookLM auth" sub-tab, Settings auto-scan briefings block, and per-applied-card JobBriefingMenu all hide. `BriefingsBackendSync` watches the falling edge and fires `settings.updateAutoScan({ autoDailyBriefing: false, autoWeeklyBriefing: false })` so the server cron stops too. The `/briefings` route stays reachable by direct URL so previously-generated briefings remain viewable. Commits `e99c8db` + `fc0fe06` (the latter also added `mx-auto` to 6 page wrappers since Tailwind v4's `.container` doesn't auto-center).
- [x] **DR.presets-into-prefs** — Presets folded into `/preferences` as a 4th sub-tab (Profile · Job titles · Résumé · Presets). Standalone `/presets` route + TopNav entry retired. `SearchPresets.tsx` refactored: function renamed `SearchPresetsContent`, page wrapper stripped, "New Preset" CTA + intro paragraph inlined. JobPreferences renders it when `activeTab === "presets"`. Commit `e8fd274`.

### Magnetic-strip SubNav
- [x] **DR.subnav-anchor** — SubNav anchors under the active TopNav tab via a CSS variable (`--subnav-anchor-x`) published by a layout effect in TopNav. Three iterations: first left-aligned under the active button (`d9f6092`), then text-to-text aligned (`b338593`), then the operator-requested final form where the SubNav row's geometric midpoint centers under the active button's midpoint (`b185c40`). 180ms ease transition + ResizeObserver for runtime item-changes (e.g. briefings toggle). See `DECISIONS.md` D-016.

---

## COMPLETED — Phase 11: Product Polish (closed 2026-05-18)

Carries over the post-beta parking-lot items plus what surfaced during Phase 9 and Phase 10. Goal: smooth rough edges so a first-time user doesn't trip over anything that screams "beta."

**Exit criterion:** every page demo-able on a phone, no obvious empty-state confusion, audio player feels intentional, theme works in both light and dark, keyboard navigation is at least possible, and provider configuration includes a self-test path so users don't first discover a bad key during their actual job-search work.

- [x] **D11.1** — New `server/services/provider-tester.ts` sends one minimal round-trip per provider (Gemini / OpenAI / DeepSeek) with humanised HTTP-status mapping (401/403 → "API key rejected", 404 → "wrong model", 429 → "rate-limited", etc.). New `settings.testProvider` tRPC mutation. Each provider tab gets a "Test Connection" button that uses the currently-typed (not yet saved) values. New `test-{provider}-connection` hooks added to AGENT_HOOKS_REFERENCE.
- [x] **D11.1a** — Follow-up to D11.1. New `settings.testSavedProvider(provider)` tRPC mutation that round-trips with the persisted unmasked key (not the masked display value). Fixes a silent bug in D11.1's per-sub-tab button: with a saved key but empty input field, it was sending `info?.keyMasked` (`sk-...abc`) and getting a 401 from the provider, telling the user "API key rejected" for a perfectly valid saved key. Now the per-sub-tab Test falls back to `testSavedProvider` when the input is empty; otherwise it tests the typed value as before. New header-level "Test active provider" button on the LLM card (next to the `llm-key-status` badge, only rendered when a key is configured). New `test-active-provider` hook documented in AGENT_HOOKS_REFERENCE.
- [x] **D11.2** — Theme toggle wired. `ThemeProvider` in App.tsx is now `switchable` so localStorage persists the choice across reloads. New `client/src/components/ThemeToggle.tsx` renders a small sun/moon icon button — currently mounted in the Settings page header (next to the "Settings" title). Tailwind's existing `.dark` class scheme on `<html>` handles the swap. Light-mode contrast audit deferred until operator reports a specific issue (every Tailwind token-based color flips automatically; only hardcoded hex values would break, and a grep didn't find any in app code).
- [x] **D11.3** — Empty-state pass. Reviewed every empty surface across Dashboard, Applied tracker, Presets, Briefings, and the six Analytics cards. Already-good copy left alone (`empty-presets`, `empty-applied-jobs` — both have CTAs that point at the next action). Rewrites: `empty-briefings` now suggests starting with Daily Coach Briefing and points at Settings for NotebookLM auth; `no-matching-applied-jobs` shows the total count plus conditional Clear-search / Clear-status-filter buttons (rather than a vague "try adjusting"); `empty-jobs` branches three ways — nothing-scanned vs. scanned-but-not-filtered vs. filtered-but-none-eligible — each with explicit next action. Analytics: six existing inline empties (Pipeline, Top Companies, Job Types, Recent Scans, Match Score Distribution, Top Matches) gained `data-agent-status="empty-*"` hooks + `aria-live="polite"` + actionable next-step copy. `AGENT_HOOKS_REFERENCE.md` extended with a new Analytics empty-state section and the `empty-jobs` description rewritten to flag the three-way branch.
- [x] **D11.4** — Better audio player on /briefings. New `client/src/components/BriefingAudioPlayer.tsx` replaces the browser-default `<audio controls>` on each briefing card. Wrapper `<div role="region">` is focusable (`tabIndex=0`), keyboard-operable: Space / K toggles play/pause, ←/→ seeks ±5s, arrow keys on the scrubber range input get native behavior. Renders play/pause button, elapsed-time / scrubber / total-time row, a 4-pill radio group for playback speed (1× / 1.25× / 1.5× / 2×), and a download link that pulls the source MP4 with a filename derived from the briefing title. `briefing-audio-{id}` hook is preserved on the new container; new hooks documented in AGENT_HOOKS_REFERENCE: `toggle-briefing-audio-{id}`, `set-playback-rate-{rate}` (scoped inside each player), `download-briefing-audio-{id}`.
- [x] **D11.5** — New `<KeyboardShortcuts />` component mounted at app root in App.tsx. Gmail-style two-key navigation (`g d` dashboard, `g a` applied, `g p` preferences, `g n` analytics, `g r` presets, `g b` briefings, `g s` settings) with a 1.5s second-key timeout. Press `?` for a help overlay listing every shortcut; `Esc` closes. Shortcuts no-op while the focus is on an input / textarea / contenteditable so typing in forms isn't intercepted. Ctrl/Cmd/Alt combos are passed through to the browser. New `keyboard-shortcuts-help` status hook for agents.
- [x] **D11.6** — Briefing inbox enhancements. Filter bar added between the generator card and the list on /briefings: search-by-title input (X to clear), filter-by-type (all 13 + "all"), filter-by-status (pending / generating / complete / failed / all), sort (newest / oldest / type A→Z). All client-side off the existing `briefings.list` query — single-user app, small dataset, no point round-tripping. Live "Showing X of Y" counter (`filtered-briefings-count`, aria-live) renders only when filters/sort diverge from defaults. New `no-matching-briefings` empty state when filters narrow to zero, with a "Clear filters" CTA that mirrors the inline Clear button. New hooks added to AGENT_HOOKS_REFERENCE: `briefing-search`, `briefing-filter-type`, `briefing-filter-status`, `briefing-sort` (inputs); `clear-briefing-search`, `clear-briefing-filters` (actions); `filtered-briefings-count`, `no-matching-briefings` (status).
- [x] **D11.7** — Mobile responsiveness pass (first sweep). Targeted fixes for the highest-impact 375 / 414 breakage points found in audit:
  - **Dashboard** (`TrackedJobsPersonalized`): the workflow buttons row (Start New Scan / WorkflowArrow / AI Job Filtering) was a fixed-direction `flex` that overflowed at mobile widths. Now stacks vertically below `sm` (640px), full-width buttons, with the WorkflowArrow hidden in the stacked layout (it implies left-to-right flow). The stray vertical divider preceding the workflow row is hidden below `lg`. The second action row (Match Scoring / Database Cleanup) given the same `flex-col sm:flex-row` + `w-full sm:w-auto` treatment and the empty placeholder `<div />` removed in favour of `justify-end`.
  - **Briefings filter bar** (`Briefings.tsx`): the type / status / sort `<SelectTrigger>` widths were fixed-pixel (220 / 150 / 170). Now `w-full sm:w-[XXXpx]` so each fills the row on mobile and clamps on `sm+`. Search input was already responsive via `min-w-[200px] flex-1` and stays.
  - **Settings tabs**: 3-column grid with icon + label was tight at 375px (longest label "Notifications" was 122px vs ~114px available). Icons now `hidden sm:inline-block` so mobile gets text-only tabs with full width to breathe.
  - Codebase-wide grep for `w-[≥350px]` and `min-w-[≥350px]` returned zero further offenders.
  - Areas reviewed but already fine: AppliedJobs status pills (`grid-cols-2 md:grid-cols-3 lg:grid-cols-6`), AppliedJobs page header (`flex-wrap gap-4`), nav pills (`flex-wrap`), modals (Radix Dialog handles viewport), Select dropdowns (Radix Popper auto-flips), Onboarding (centered single column), Presets (single column already). Tap targets: every primary action button on the audited surfaces uses shadcn `size="lg"` (44px) or default `h-9` (36px) — no sub-32px targets in critical paths. If a deeper page-by-page audit surfaces more issues later, queue as D11.7a.
- [x] **D11.9** — Add "Apply preset" button on each preset card. New `presets.apply(id)` tRPC mutation overwrites the user's active profile fields (city/state parsed from preset.location with a 2-letter-state-code fallback that keeps the existing state if parse fails, search radius, remote preference, salary filter), `user_settings.enabledPlatforms`, and `user_job_titles` (matches in the preset become active, others deactivate without delete, new ones get inserted). Education / experience / skills / résumé are not touched — presets don't track those. New Apply button on each preset card opens a confirmation Dialog listing exactly what will be overwritten before firing. On success the dialog closes, a toast fires (or a warning toast surfaces the location-parse fallback), and `presets.list` / `personalized.getUserProfile` / `onboarding.getJobTitles` / `settings.getEnabledPlatforms` are invalidated so /preferences, /jobs and Platforms reflect the new state immediately. New hooks: `apply-preset-{id}`, `cancel-apply-preset`, `confirm-apply-preset`, `apply-preset-confirm-{id}`. (Once you've eyeballed this, that knocks Search Presets from "unusable feature" to "complete feature.")
- [x] **D11.10** — Fix Onboarding step 1's hardcoded DeepSeek copy. Three strings at `Onboarding.tsx:354-361` literally said "DeepSeek" regardless of which provider was active (CLAUDE.md mandates Gemini as default). Server side: new `getActiveProviderLabel()` helper in `_core/environment.ts` returns the bare display name; `environment.status` tRPC query now also returns `activeProviderLabel` ("Google Gemini" / "OpenAI" / "DeepSeek"). Client side: the three hardcoded strings now interpolate `envStatus.activeProviderLabel`. The "key not set" copy also gained "or switch the active provider on the Settings page" so the user knows their first-time provider choice is reversible.
- [x] **D11.11** — Make Platforms reachable + add Settings to the dashboard nav pills. Added two new nav-pills to the dashboard row: Platforms (indigo, Globe icon, `go-to-platforms`) and Settings (slate, Settings icon, `go-to-settings-global`). Platforms was previously unreachable except by typing the URL. Settings was only reachable from Landing or a conditional warning banner; persistent dashboard entry is now matched to its importance. AGENT_HOOKS_REFERENCE updated; `go-to-settings-global` description now lists all four surfaces it appears on.
- [x] **D11.12** — Merged ScraperHealthCard with Platforms toggles. Moved the `<ScraperHealthCard />` mount from Settings.tsx (where it lived as an un-tabbed orphan below the LLM/Notifications/Auto-Scan tabs) into Platforms.tsx, replacing the bottom "About Job Hunter Matrix" section (audit-flagged as duplicate of dashboard's profile summary + stale project name). Per-platform on/off toggles and per-platform telemetry now live on the same page; Settings is left lean (3 tabs + NotebookLM auth card). Unused imports cleaned (Shield, Bot, getProfile / getJobTitles queries on Platforms; ScraperHealthCard import on Settings). AGENT_HOOKS_REFERENCE updated to reflect the new home of `scraper-health-card`.
- [x] **D11.13** — Retired the Quick Notes editor on AppliedJobs; kept the Timeline as the only way to add notes. Removed: the Dialog + button + `editingNotesId` / `notesText` state + the now-dead `Dialog*` import line. Kept: the read-only "Legacy Quick Notes" display block — relabeled "Quick Notes (read-only — open Timeline to add new notes)" so it telegraphs its status, with a longer code-comment explaining why the `notes` column on `appliedJobs` stays in the schema (existing user data must keep rendering). The `edit-quick-notes-{id}` / `save-quick-notes-{id}` hooks were never documented in AGENT_HOOKS_REFERENCE, so no reference cleanup was needed. updateApplicationStatus's `notes` parameter still exists server-side (defensive — no callers anymore but cheap to leave). Per-job card now has one notes path, not two.
- [x] **D11.14** — Lifted per-provider "Test Connection" out of the bottom button row (where it looked like a peer of Save) and placed it inline with the help text directly under the API Key Input. Now it visually belongs to the input it tests, not to the form's submit actions. Clear-key button now lives alone in its own right-aligned row. The header-level "Test active provider" (D11.1a) stays. Two clear depths: header = test what's saved on the active provider; per-sub-tab inline = test the typed-but-unsaved value of whichever provider you're editing. Tooltip on the per-sub-tab button reflects which behavior the current state triggers.
- [x] **D11.15** — Added a "Go to Dashboard" outline button under each of the six Analytics empty-state cards (Pipeline, Top Companies, Job Types, Recent Scans, Match Score Distribution, Top Matches) — all six now bottom out at the dashboard, the universal "do the thing that populates this" surface. All six reuse the existing `go-to-dashboard` action hook; agents disambiguate by walking from the surrounding `empty-*` status. Added an "Edit in Preferences" outline button to the ConfigDebug page header, breaking the read-only dead-end the audit flagged. Reuses the existing `edit-preferences` action hook.
- [x] **D11.16a** — Small audit follow-ups bundled (three quick wins from §C "Low"):
  - **Onboarding step 1**: moved the "How do you want to start?" mode selector + the conditional auto-fill upload widget *above* the Continue button. Continue's label depends on the mode, so the mode now precedes the action.
  - **JobPreferences**: promoted the Résumé textarea out of "Skills & Experience" into its own Section 3.5 card (`resume-text-section` hook + FileText icon + "Optional / Required for the Resume Critique briefing" badge). Previously buried; the Resume Critique briefing was undiscoverable from Preferences.
  - **Briefings**: dropped the manual `refresh-briefings-list` button. The list query auto-polls every 8s while anything is generating and invalidates after every mutation — no flow requires manual refresh. `RefreshCw` import dropped. AGENT_HOOKS_REFERENCE entry removed.
- [x] **D11.16b** — Standardized the page-header pattern (audit Theme 6 — five different patterns across 11 pages). New `client/src/components/PageHeader.tsx` is a 3-slot component (back-arrow icon left / title + subtitle middle / optional rightAction). Refactored 7 sub-pages to use it: Applied, Analytics, Presets, Settings, Preferences, ConfigDebug, Briefings. Hub-like pages left alone (Landing, Onboarding, Dashboard `/jobs`, Platforms — each has a unique entry-point header). Subtitle accepts ReactNode so callers can preserve their own attributes (e.g. Applied's `aria-live` + `data-agent-status="applied-jobs-count"` subtitle survives the refactor). All 7 pages now share one back-arrow style, one title-icon convention, and one right-action slot pattern. `back-to-dashboard` hook is now centralized in PageHeader; no AGENT_HOOKS_REFERENCE changes needed (the hook description was already generic).
- [x] **D11.16c** — AI Debug Console is now collapsible (default collapsed). Was always-expanded, dumped the entire filtered-out list on every dashboard load, pushing the eligible-jobs section below the fold whenever scans had rejections. Now wrapped in a toggle button (`toggle-ai-debug-console` action hook + `aria-expanded`). When collapsed, a one-line hint (`ai-debug-console-collapsed` status) explains what's hidden; when expanded, the existing rich list renders inside `ai-debug-console`. State is ephemeral (resets to collapsed on reload) — it's a power-user diagnostic, not a workflow.
- [x] **D11.16d** — Dashboard action-row consolidation. AI Match Scoring moved out of the secondary "Action Buttons Row" into the workflow chain in Row 1, so the dashboard now reads as one **Scan → (Arrow) → AI Filter → (Arrow) → Match Score** pipeline instead of the previous Scan→Filter chain with Match Scoring orphaned below it. New Arrow 2 (`hidden sm:flex` matching Arrow 1's mobile behavior; `isActive=fitScoring.isPending`, `isCompleted=Boolean(lastAIAnalysis?.completedAt)`). Database Cleanup gets its own row labeled "Maintenance" — it's admin / destructive, not workflow, so it doesn't belong in the chain. No new hooks; `execute-match-scoring` and `trigger-db-cleanup` keep their existing action names.
- [ ] **D11.8** — Phase 11 exit review with operator. *(operator)*

---

## DEFERRED — Phase 9: Briefings Live Validation

D9.1, D9.7, D9.8, D9.9 are complete; D9.2 through D9.6 are operator-gated (waiting on real NotebookLM generations) and D9.10 is the operator's phase-exit signal. Holding here until operator is ready to run a live `daily_coach_audio` generation.

### Original Phase 9 chunks (preserved for reference)

(Phase 9 history kept below the COMPLETED ARCHIVE section at the bottom of this file.)

---

## COMPLETED — Phase 10: Scraper Maturity (closed 2026-05-17)

Operator ratified Phase 10 with the realistic exit criterion: two platforms green (Indeed, LinkedIn), three honestly labeled with specific failure reasons (Glassdoor + Google Jobs upstream JobSpy drift, ZipRecruiter Cloudflare-blocked), telemetry in place to detect recovery. Final deliverables: scraper_health table + tRPC + telemetry, ScraperHealthCard on Settings, broken-platform UI warnings on Platforms page, SCRAPER_TRIAGE.md investigation, DECISIONS.md D-013 (retry deferral) + D-014 (broken-platforms classification), partial-success scan-row status fix, SIGTERM-on-cancel for snappy scrape termination.

### Original Phase 10 ACTIVE chunks

The chunk-by-chunk record is preserved below for completeness.

(Original Phase 10 ACTIVE list)

Currently Indeed is the only validated scraper. Glassdoor / LinkedIn / ZipRecruiter / Google Jobs are wired through JobSpy but flagged "experimental" in the README. For an honest tool we need to either fix them or stop pretending they're an option — and either way, surface the truth in the UI.

**Exit criterion:** at least three platforms green; the others honestly labeled with the specific reason they don't work; failure modes documented for future contributors.

- [x] **D10.1** — Triaged all four non-Indeed scrapers. Findings in `docs/internal/SCRAPER_TRIAGE.md`. Headline: LinkedIn works (surprising — 5 real rows in 1.4s), Glassdoor + ZipRecruiter blocked (ZR is Cloudflare-403), Google empty (ambiguous, needs a second test). Two working platforms (Indeed + LinkedIn), two broken, one unclear.
- [x] **D10.2** — `scraper_health` table (one row per platform), `recordScraperAttempt` / `getScraperHealthSnapshot` helpers in `db.ts`, new `scrapers.health` tRPC query. Telemetry side-effects fire-and-forget from `searchJobs` finish() callback in `routers_indeed.ts` — every scrape attempt records per-platform health (including the "returned 0 rows" silent-failure mode that Glassdoor exhibits). Migration `0003_scraper_health.sql` applied.
- [x] **D10.3** — `ScraperHealthCard` lives on Settings (between the Tabs and the NotebookLM card). Shows one row per platform with state badge (Working / Recently failed / Blocked / Not tested), last-success age, attempt count, success rate, last error message. Auto-refreshes once a minute. New hooks: `scraper-health-card`, `scraper-row-{platform}`, `scraper-error-{platform}`.
- [x] **D10.4** — `runGlobalSearch` now writes `status: "failed"` to the scan history row when every per-(title, platform) search errored AND zero jobs were saved. Previously it wrote `status: "completed"` unconditionally, which gave green badges to scans that returned literally nothing. Partial-success cases (some platforms returned data, others failed) keep `status: "completed"` with the per-platform breakdown surfaced in `progressMessage`.
- [~] **D10.5** — Deferred with rationale (see DECISIONS.md D-013). Triage caught zero transient failures — observed modes are deterministic degradation (Glassdoor, Google empty) or hard blocks (ZipRecruiter 403). Retry would either do nothing or worsen the hard-block case. Will revisit if `scraper_health` telemetry shows transient clustering.
- [x] **D10.6** — New `server/scrape-process-registry.ts` tracks every live Python scrape subprocess (flat Set — single-user app, one scan at a time). `searchJobs` registers on spawn, auto-unregisters on close/exit/error. `cancelOperation` now calls `killAllScrapeProcesses()` after marking the DB row — sends SIGTERM, schedules a SIGKILL fallback 3s later for stragglers. Cancel now reflects within seconds rather than waiting for the current JobSpy request to finish naturally.
- [x] **D10.7** — README "Scraping scope" callout rewritten with the actual per-platform status from D10.1, plus a pointer to **Settings → Scraper Health** as the live source of truth. The internal `SCRAPER_TRIAGE.md` already serves the deeper "what to do when X breaks" purpose — collapsing the two would just create drift.
- [~] **D10.9** — Deep-dive investigation of broken platforms (operator-requested follow-up). Inspected JobSpy source for Glassdoor and Google; re-tested all three with corrected params (`is_remote=True`, `google_search_term`, real cities). Conclusion: all three are unfixable from inside Job Matrix without forking JobSpy or violating D-002 (residential proxies for ZipRecruiter). Findings appended to `SCRAPER_TRIAGE.md` (2026-05-17 deep-dive update); formal classification in `DECISIONS.md` D-014. Visible "BROKEN" badge + inline reason now rendered on the three known-broken cards on the Platforms page so users don't waste cycles toggling them on.
- [ ] **D10.8** — Phase 10 exit review with operator. *(operator)*

---

## DEFERRED — Phase 9: Briefings Live Validation

D9.1, D9.7, D9.8, D9.9 are complete; D9.2 through D9.6 are operator-gated (waiting on real NotebookLM generations) and D9.10 is the operator's phase-exit signal. Holding here until operator is ready to run a live `daily_coach_audio` generation.

### Original Phase 9 chunks (preserved for reference)

The NotebookLM bridge ships with 13 prompts and full plumbing (commit `16657a8`). None of it has been run against a real NotebookLM session yet. This phase proves the system end-to-end and tunes the prompts based on what real output looks like.

**Exit criterion:** at least one of each output kind (audio, infographic, text) has run end-to-end and the result is "good enough to ship." Daily Coach Audio is the keystone — that has to feel right.

- [ ] **D9.1** — `notebooklm login` one-time auth on this host. *(operator)* The Settings page will open a browser; operator signs into Google, then clicks "I've signed in — confirm" in the UI. Once status flips to "Connected" we're unblocked. (Note: requires the venv to have `notebooklm-py` installed — first run of `pnpm setup` or `pnpm dev` on a fresh checkout self-heals the venv via `python_manager.ts`.)
- [x] **D9.2** — First live `daily_coach_audio` generation end-to-end. Ran 2026-05-17 17:35:21 → 17:42:51 UTC (**7m 30s**, faster than the 10–25 min expected band). Briefing ID 1, status flipped `generating` → `complete` cleanly with no error message. Output: `data/briefings/audio/daily_coach_audio_1_2026-05-17.mp4` (16.2 MB, ~216 kbps). Express static route at `/briefings-media/audio/...` serves it 200 OK with `Content-Type: video/mp4`. End-to-end pipeline confirmed: tRPC mutation → fire-and-forget Python subprocess → NotebookLM upload + Studio config + audio gen + download → DB write → static route → BriefingAudioPlayer (D11.4) for playback. **Note:** context fed to NotebookLM was thin (no recent listings / applications / scan history in the 24h window) — the briefing exercises the empty-context fallback path of the prompt rather than a typical-day output. A second generation with real context will be needed before D9.3's tone-iteration can land properly.
- [ ] **D9.3** — Listen-test the daily coach audio + iterate the prompt. *(operator owns direction; Claude edits the file)* Likely two or three iterations to land the tone. Each iteration is its own atomic chunk — change the prompt, regenerate, listen, decide.
- [ ] **D9.4** — Repeat the cycle for `weekly_market_audio`. *(both)* Iterate until the analytical tone lands.
- [ ] **D9.5** — Generate at least one infographic (`daily_dashboard_infographic`) end-to-end. *(both)* Verify the BENTO_GRID style renders cleanly and the data is accurate; iterate the prompt if not.
- [ ] **D9.6** — Generate at least one text output (`monthly_retrospective` is the easiest to evaluate). *(both)* Verify the long-form narrative reads well.
- [x] **D9.7** — New `server/services/briefings-scheduler.ts` ticks hourly, fires `daily_coach_audio` after 23h and `weekly_market_audio` after 6.5 days for users with the toggles enabled. Two new user_settings columns (`auto_daily_briefing`, `auto_weekly_briefing`, both default off — opt-in to avoid burning quota) + matching toggles in Settings → Auto-Scan tab. Migration `0002_auto_briefings.sql`. Will not double-fire while a previous generation of the same type is still in `generating` state.
- [x] **D9.8** — Added a "Briefings ▾" dropdown on each applied-job card (`client/src/components/JobBriefingMenu.tsx`). Menu items fire per-job NotebookLM generations: Pre-Application Brief, Interview Prep audio, Interview Flashcards, Interview Quiz. New hooks: `open-briefing-menu-{id}`, `generate-pre-application-brief-{id}`, `generate-interview-prep-{id}`, `generate-interview-flashcards-{id}`, `generate-interview-quiz-{id}`. (Tracked-jobs cards still need the menu — follow-up, not blocking.)
- [x] **D9.9** — NotebookLM auth card now shows 7-day briefing activity: total count, breakdown by status (complete / in progress / failed), and recent failure messages so the user can spot rate-limit pressure before hitting it. New `notebooklm.recentActivity` tRPC endpoint backs the panel; refreshes once a minute.
- [ ] **D9.10** — Phase 9 exit review with operator. *(operator)* Greenlight to advance to Phase 10, or refine Phase 9's scope if the briefings aren't shippable yet.

---

## CLOSED — Phase 12: Legal & Commercial Pre-flight (resolved 2026-06-13 — open source)

**Closed by `DECISIONS.md` D-023: the project is open source, no commercialization.** This phase existed to decide the commercial-vs-OSS direction; that decision is made. The sub-items are moot:
- IP-attorney consult — not needed for a non-commercial release with a standard scraping disclaimer.
- License decision — MIT, permanent (no swap).
- Pricing / distribution channel — N/A.
- "Made by AI" framing — kept and made central (an OSS pre-flight item, not a commercial rewrite).
- Trademark filing — not pursued.

The OSS pre-flight that *replaces* this phase (scraping disclaimer, SECURITY.md, de-community-fy pass, clean-slate publish) is tracked via D-023 and the stance-alignment doc pass.

---

## COMPLETED ARCHIVE

History of closed phases. Append-only, dated.

### 2026-05-15 — Cleanup-to-beta (Phases 1–7 of the original TODO)

The Job Matrix project was inherited from an earlier Manus-based scaffold. This work brought it to a shippable beta state.

- Phases 1–2: Manus + OpenRouter purge complete. Every reference removed; verified by case-insensitive grep.
- Phases 3–4: Multi-provider LLM router built (`server/_core/llm.ts` + `llmProvider.ts`). Direct vendor SDKs only — Gemini default, OpenAI, DeepSeek. Settings UI exposes all three.
- Phase 5: Documentation consolidation. Root MD set finalized (README, VISION, CHANGELOG, TODO at the time, CLAUDE, LICENSE). Internal docs moved under `docs/internal/`.
- Phase 6: Smoke tests (pnpm install / check / test / dev) all clean.
- Phase 7: Clean-slate publish. Old `anitacigawet/Job-Matrix` renamed to `Job-Matrix-old`. New private repo created from a single curated commit. Tagged `v0.1.0-beta`. Commits: `610ecc3` initial + `85de9e5` housekeeping.

### 2026-05-15 — Pre-public-flip polish

Concerns raised in `Concerns.txt` before any public flip:
- README rewrite: ghost-jobs pain point, TOC, divider for skim-readers, `pnpm setup` framing (Python is required, not optional), new "For AI agents" section.
- `pnpm setup` script (`scripts/setup.mjs`) replaces the manual Python venv + pip steps.
- AGENT_MANIFEST.md retired as a public AI contract. Moved + rewritten as `docs/internal/AGENT_HOOKS_REFERENCE.md`. The tested concierge prompt at `docs/CONCIERGE_PROMPT.md` is the only thing AI agents are given.
- `requirements.txt` corrected (was wrong project's deps).
- `package.json` version aligned to `0.1.0-beta`.
- Commits: `66698bf` (README + agent surface), `b858479` (gitignore python bytecode).

### 2026-05-16 — Strategic direction locked, public release paused

Operator decided to evaluate commercial release rather than flip the repo public. `docs/internal/ROADMAP.md` captures the decision. Public flip paused indefinitely. Memory updated (`project_jobmatrix_status.md`). **Superseded 2026-06-13 by D-023 — decision made: open source. The public flip is back on.**

### 2026-05-16 — NotebookLM briefings foundation

Ported the NotebookLM bridge from Z-SPAN. Built the full Job Matrix consumer end-to-end:
- `server/notebooklm/{client.py, auth_check.py, run.py}` + reference docs.
- `briefings` DB table + `resume_text` on `user_profiles`, migration `0001_briefings_and_resume.sql`.
- `server/services/briefings.ts` (fire-and-forget orchestrator) + `routers_briefings.ts` + `routers_notebooklm.ts`.
- Express `/briefings-media/*` static route.
- `client/src/pages/Briefings.tsx`, `client/src/components/NotebookLMAuthCard.tsx`, résumé textarea on Preferences, dashboard nav pill.
- 13 hand-written prompt files at `server/notebooklm/prompts/`.
- Updated `AGENT_HOOKS_REFERENCE.md` with the new hook surface.
- Commit: `16657a8`.

### Phase 8: GitHub Pages static demo — UNBLOCKED (D-023)

A public demo/landing surface for the open-source project. The commercial-vs-OSS ambiguity that held it is resolved (D-023 — open source), so this is now straightforward: a static build that loads the sanitized snapshot (`client/src/snapshot/snapshot.db`, D-010) and never live-scrapes. A hosted demo link is the single highest-value addition to the public repo's front door. See `github-pages-plan.md`.
