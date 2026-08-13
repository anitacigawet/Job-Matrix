# Changelog

All notable changes to Job Matrix will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0-beta] — Public beta (2026-08-12)

- Relicensed Job Matrix under PolyForm Noncommercial 1.0.0. Commercial use is
  not permitted. JobSpy remains separately available under its upstream MIT
  license.

### Added

- Reframed the public README around the job seeker's workflow, with an honest
  account of local storage, provider requests, current capabilities, and limits.
- Added reproducible Playwright screenshots of the welcome screen, populated
  dashboard, and human-gated guided-application workflow.
- Added GitHub Actions verification for type checking, tests, production builds,
  and production dependency advisories, plus monthly Dependabot updates.

### Changed

- Rebuilt the first-run screen as a human-facing introduction and moved Factory
  Reset to Settings → Local data without weakening its two-step confirmation.
- Made the production start command portable across Windows, macOS, and Linux.
- Replaced static source-health claims in the public README with capability
  descriptions and a pointer to observed in-app health telemetry.
- Made the JobSpy foundation explicit in the README and added its upstream MIT
  copyright and license to `THIRD_PARTY_NOTICES.md`. Job Matrix remains MIT and
  makes no ScootSolute LLC ownership claim.

### Security

- Updated DOMPurify to 3.4.13 and nanoid to 5.1.16, closing the production
  advisories reported against the previous pinned versions.

## [Unreleased] — Reliability and release-readiness stabilization (2026-08-03)

### Added

- Added a persistent application queue and a guided Chrome-agent packet that
  reuses locally saved application answers and résumé files, with an explicit
  user-approval boundary before the employer's final Submit action.
- Added read-only Gmail OAuth monitoring, privacy-first employer-response
  classification and application matching, Google Voice email recognition,
  an Applied → Responses review inbox, and optional Slack webhook alerts.
- Added Preferences → Application details and Settings → Inbox & Slack setup
  surfaces, including stable browser-agent hooks and manual connection tests.

### Fixed

- Restored real first-run behavior by resolving onboarding state from SQLite on
  every request, including immediately after factory reset.
- Bound the unauthenticated local server to `127.0.0.1` only.
- Unified manual and scheduled scans behind the full personalized-search
  procedures, including active titles, enabled sources, profile locations,
  watched ATS companies, scan history, and optional AI analysis.
- Preserved ATS source namespaces and stopped converting source failures into
  synthetic successes.
- Made SQLite replacement atomic and changed tracked-job ingestion from
  per-row exports to bounded bulk batches.
- Migrated OpenAI, DeepSeek, and Gemini provider calls to supported SDKs and
  normalized tool-choice and structured-response options.
- Replaced skipped and self-validating tests with isolated behavioral coverage.
- Added a responsive mobile navigation menu and route-level lazy loading.

### Security and privacy

- Updated vulnerable or deprecated production dependencies and pinned the
  patched `path-to-regexp` transitive release used by Express.
- Reconciled README and product copy so local storage is distinguished from
  deliberate requests to job sources, AI providers, and NotebookLM.
- Removed private operator memory and verbatim third-party prompt references
  from Git tracking while retaining project-owned analysis.

See `DECISIONS.md` D-024 for the stabilization contract.

## [Unreleased] — Phase 16: Workday ATS adapter + full catalog merge (2026-06-13)

Adds **Workday** as a fourth per-company ATS source and grows the companies catalog from the 5-entry seed to **661 verified entries**. See `DECISIONS.md` D-022.

**Catalog**
- Merged the full `catalog-builder/` sweep into `companies-catalog.yaml`: **650 Greenhouse/Lever/Ashby entries** (438 / 67 / 145), each verified against its live ATS API, plus 11 Workday entries (below).
- Reframed the catalog as **operator-maintained, not community-contributable** — the file header is now a maintainer reference (schema + endpoint mapping for health-check tooling) instead of a PR walkthrough.

**Workday adapter**
- `server/sources/ats/workday.ts` — POSTs the public `wday/cxs/{tenant}/{site}/jobs` endpoint. Unlike the other three ATSes it filters **server-side** (`searchText` in the body), necessary because large tenants return thousands of postings (Target: 2000). Paginated, capped like the other adapters.
- Schema extension: Workday entries carry `host` (the `{tenant}.wdN.myworkdayjobs.com` data-center subdomain) and `site` (case-sensitive path), required-when-Workday via a Zod `superRefine`. Greenhouse/Lever/Ashby entries are unchanged (`boardId` only).
- Job URLs build as `https://{host}/{site}{externalPath}` (verified to resolve). `postedOn` is a fuzzy human string, so `hoursOld` filtering is best-effort. The list endpoint carries no description — left empty (the AI filter tolerates this and falls back to title + location); per-job description enrichment is a deferred follow-up.
- 11 verified Workday seed companies land (Target, The Home Depot, Moderna, Tempus, GoodRx, Devoted Health, Cityblock Health, iHeartMedia, Universal Music Group, Sonder, Bed Bath & Beyond). The remaining ~175 logged Workday companies are a follow-on population sweep.

**UI**
- Preferences → Companies gains a Workday badge (amber). The catalog list, search, and tag filters are unchanged — they're already ATS-agnostic.

**Why Workday next**
- The catalog-builder sweep logged 544 companies on unsupported ATSes; **Workday was 186 of them (34%)** — by far the largest unlock. It covers most large enterprises (airlines, hotel parents, big-box retail, defense primes, automotive OEMs, telco majors).

## [Unreleased] — Phase 15: Work-style Quick Fill (2026-05-20)

Curated static-data starter packs of job titles for users who don't know what to type. Pick a work-style category, move a Low/Medium/High slider, see eight curated titles, uncheck what doesn't fit, Apply. Zero LLM call, zero new dependencies, zero DB migration. See `DECISIONS.md` D-021.

**Dataset**
- `shared/work-style-suggestions.ts` — four categories (Introvert-friendly · Extrovert-friendly · Hands-on / physical · Entry-level / no degree) × three levels (Low / Medium / High) × eight curated titles per level, plus a one-line description per level framed by *the work*, not the person. Titles chosen for real search-engine hits on Indeed / Adzuna / LinkedIn — no whimsical entries.

**Component**
- `client/src/components/WorkStyleQuickFill.tsx` — single reusable dialog. Category picker (4 cards) → level slider with live description → checkable title list (pre-checked) → Apply. Case-insensitive dedup against the user's existing job titles.

**Wiring**
- Preferences → Job titles: "Quick fill" button at the top of the Manage Job Titles card opens the dialog.
- Onboarding step 2 (Target Positions): a quiet "Not sure what to type?" callout opens the same dialog inline; the manual-entry path stays primary.

**Apply semantics**
- Append-only merge into `user_job_titles`. Existing rows untouched (their `isActive` state preserved); new titles default `isActive: true`. No deletes, no overwrites — pruning happens in the existing Job titles UI.

**Hooks**
- 5 new `data-agent-action` hooks (`open-work-style-quickfill`, `select-work-style-category-{id}`, `set-work-style-level-{level}`, `toggle-suggested-title-{slug}`, `apply-work-style-suggestions`) + supporting region/state hooks documented in AGENT_HOOKS_REFERENCE.

**Why no LLM here**
- The existing "Generate variations" button is already the LLM path. Quick Fill is the predictable static starting point for the user who doesn't yet know what category to ask the LLM about.

## [Unreleased] — Phase 14: Per-Company ATS Sources + Companies Catalog (2026-05-19)

> **Note (2026-06-13):** the "community-contributable catalog / add a company via PR" framing in this entry was **superseded by Phase 16 / D-022** — the catalog is now maintainer-curated and catalog PRs are not accepted. The adapter framework and catalog mechanics described below are unchanged.

Per-company job feeds land as the second shape of Tier-1 data source (D-020). Instead of "give me a query, get matching jobs everywhere," this layer is "give me a company, get all their jobs." Three ATS systems supported in v1: **Greenhouse, Lever, Ashby**. Workable is deferred — its public API is fragmented per-company.

The operator's strategic addition to the phase: **the company list is itself a community-contributable catalog at `companies-catalog.yaml` (repo root)**. Adding a company is a GitHub PR with one new YAML entry — no code change. Contributor magnet built in.

**Catalog**
- `companies-catalog.yaml` at the repo root. Top-level location for discoverability. YAML chosen over JSON because contributors can leave inline comments explaining their entry.
- `shared/companies-catalog-schema.ts` — Zod schema (name, slug, ats, boardId, website?, tags[]?) + ATS endpoint URL helpers.
- `server/companies-catalog.ts` — parser with memoized read, per-entry validation (one bad entry doesn't blank out the catalog), first-occurrence-wins de-dupe by slug.
- Bootstrap seed: 5 verified entries — Anthropic / Cloudflare / GitLab (Greenhouse), Netlify (Lever), PostHog (Ashby). Verified by hitting their live endpoints during dev. Contributors fill the rest.

**ATS adapter framework**
- `server/sources/ats/base.ts` — `JobBoardAdapter` interface, shared HTTP/HTML/match-query helpers, dispatch by ATS id.
- `server/sources/ats/greenhouse.ts` — hits `boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true`. Returns title + departments + HTML description.
- `server/sources/ats/lever.ts` — hits `api.lever.co/v0/postings/{slug}?mode=json`. Handles the `{ok: false, error: "Document not found"}` non-array shape gracefully.
- `server/sources/ats/ashby.ts` — hits `api.ashbyhq.com/posting-api/job-board/{slug}`. Filters out `isListed: false` entries.
- All three filter client-side by `searchTerm` (against title + description + department) since per-company ATS APIs don't expose server-side search across all listings. `hoursOld` applied when the API surfaces `updated_at` / `createdAt` / `publishedAt`.

**Data model**
- New `watched_companies` table (migration `0004_watched_companies.sql`): `(user_id, company_slug)` with a unique index. Drizzle schema, `listWatchedCompanies` / `addWatchedCompany` / `removeWatchedCompany` / `clearWatchedCompanies` helpers in `db.ts`.
- New `routers_companies.ts` tRPC router: `catalog` (read), `watched` (joined with catalog details), `add` / `remove` / `clear`. `add` validates the slug exists in the catalog before insert.

**Scan path integration**
- `runGlobalSearch` (in `routers/scan.ts`) now does a second fan-out after the existing per-(title, location) loop: for each watched company, fetch jobs in parallel for each user title. Adapters run independently — different hosts, no rate-limit collision.
- `saveTrackedJob` accepts per-company `platform` values (`gh:anthropic`, `lever:netlify`, `ashby:posthog`) verbatim. SQLite stores any TEXT; the Drizzle `.$type<>()` constraint is compile-time only. Each company is its own dedup namespace in `tracked_jobs`.
- Company `name` is patched in from the catalog entry before save (adapters return the raw `boardId` slug as a placeholder).

**UI**
- New `/preferences` SubNav sub-tab: "Companies". Companies sub-tab order: Profile · Job titles · Résumé · Presets · **Companies**.
- New `WatchedCompaniesPanel` component: searchable + tag-filterable list of the catalog with a checkbox per entry. Selections persist via the watchedCompanies mutations. Empty state nudges contributors toward the CONTRIBUTING flow.

**Contributor flow**
- New `CONTRIBUTING.md` at the repo root. Step-by-step "Add a company" workflow with verification `curl` commands per ATS, what won't be accepted, PR template hint.

**Out of scope (flagged for follow-ups)**
- **Workable adapter** — public API too fragmented per-company. Will add when a real use case forces it.
- **Per-company health telemetry** — for v1, errors log to console and the aggregate scan-history's per-platform breakdown is enough signal. Add a `company_board_health` table or relax `scraper_health` if failure patterns surface.
- **CI validation hook** for new catalog entries — verify the slug returns ≥1 job at PR time. Easy to add; not blocking on v1.

## [Unreleased] — Phase 13: Data Source Maturity (2026-05-19)

Tiered data-source architecture lands. JobSpy scrapers are now Tier 2 (best-effort, may break); a new Tier 1 layer adds real public APIs — **six Tier-1 sources ship** (Adzuna, USAJobs, Jooble, The Muse, Remotive, RemoteOK). Three of the five JobSpy platforms (Glassdoor / Google Jobs / ZipRecruiter) remain "not operable" per D-014, but the dashboard no longer depends on them being fixed because the Tier-1 path is independent. Authenticated cookie-based scraping (Tier 3) and per-company ATS sources (Greenhouse, Lever, Ashby, Workable) are deferred — both need their own design pass. See `DECISIONS.md` D-019.

**Source adapters**
- New `JobSource` interface in `server/sources/`. Tier-1 adapters run inside Node (no Python subprocess needed); Tier-2 platforms continue to use the existing Python/JobSpy path.
- `searchJobs()` in `routers_indeed.ts` is now a dispatcher: splits the input platform list by tier, fans Tier-1 adapters out in parallel, runs the Tier-2 subprocess once with the remaining list, merges results.
- `PLATFORM_TIER` map in `shared/platforms.ts` classifies every supported platform 1/2/3.
- Cross-tier dedupe at the merge step: jobs with matching `(title, company, city)` collapse to a single row; Tier-1 wins (Adzuna's data is cleaner and the redirect URL still lands on the source site).

**Tier-1 sources (6 total)**
- **Adzuna** — `server/sources/adzuna.ts` against `api.adzuna.com/v1/api/jobs`. Free hobbyist plan supported (250 calls/month). Conservative pagination cap (4 pages × 50 rows = 200 ceiling) to respect Trial Access quotas.
- **USAJobs** — `server/sources/usajobs.ts` against `data.usajobs.gov/api/search`. Requires both `Authorization-Key` header AND `User-Agent: <email>` matching the registered email. US federal civilian jobs.
- **Jooble** — `server/sources/jooble.ts` against `jooble.org/api/<key>`. POST request body, partner key in URL path. Worldwide aggregator across many sources.
- **The Muse** — `server/sources/themuse.ts` against `themuse.com/api/public/jobs`. No-auth tier works out of the box; optional API key raises the rate limit. Early/mid-career roles, tech-heavy.
- **Remotive** — `server/sources/remotive.ts` against `remotive.com/api/remote-jobs`. No auth. Remote-only across many categories.
- **RemoteOK** — `server/sources/remoteok.ts` against `remoteok.com/api`. No auth (but requires a real `User-Agent` — bare `fetch` is blocked with 403). Returns a flat 100-row list; adapter does client-side keyword filtering against position + tags.

**Settings refactor (cross-source)**
- New nested settings shape: `dataSources: { adzuna: {appId, appKey}, usajobs: {email, apiKey}, jooble: {apiKey}, themuse: {apiKey} }`. Legacy flat `adzunaAppId` / `adzunaAppKey` fields migrate forward on read.
- `getDataSources` returns a `fields[]` descriptor per source so `DataSourcesCard.tsx` renders dynamically — no hardcoded credential shapes in the UI. Each field declares `inputType` (text / password / email), placeholder, masked value, and required flag.
- `data-source-tester.ts` extended with humanised round-trips for USAJobs, Jooble, and The Muse.

**Settings UI**
- New Settings sub-tab "Data Sources" (`/settings` → SubNav) iterates over the 6 sources. Cards for the 4 credentialed sources surface field inputs + Test Connection + Save + Clear. No-auth sources (Remotive, RemoteOK) get a "No setup needed" badge and skip credential UI entirely. The Muse renders as no-auth-with-optional-key.
- Env vars override: `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `USAJOBS_EMAIL`, `USAJOBS_API_KEY`, `JOOBLE_API_KEY`, `THEMUSE_API_KEY`. When env is set, the Settings inputs go read-only with a "set via env var" callout.
- Platforms page: 6 new Tier-1 cards alongside the existing JobSpy ones. Each Tier-1 card shows tier badge, credential-state callout (green = configured, amber = needs setup, blue = no setup needed). "Configure in Settings →" deep-link on credentialed-but-unconfigured cards.

**Defaults**
- Out-of-box `DEFAULT_PLATFORMS` is now `["indeed", "linkedin", "adzuna", "remotive", "remoteok", "themuse"]` — every no-friction source on, credentialed sources off until configured.

**Schema**
- `tracked_jobs.platform`, `applied_jobs.platform`, `job_scan_history.platform`, `platform_credentials.platform` unions extended with `"google"` and `"adzuna"`. SQLite TEXT columns underneath — no migration needed.
- `scraper_health` table tracks Adzuna alongside the JobSpy platforms (constant `SUPPORTED_SCRAPER_PLATFORMS` extended).

**Docs**
- README "Scraping scope" callout reframed as "Data source coverage" with Tier 1 / Tier 2 sections.
- New SCRAPER_TRIAGE.md preamble pointing readers to D-019.
- AGENT_HOOKS_REFERENCE updated with new credential hooks (`save-adzuna-credentials`, `clear-adzuna-credentials`, `test-adzuna-credentials`, `configure-adzuna-credentials`, `toggle-platform-adzuna`) and status hooks (`data-source-adzuna`, `platform-needs-credentials-{platform}`, `platform-credentials-ok-{platform}`).
- Concierge prompt mentions Adzuna as an optional second source.

## [Unreleased] — Design Refresh (2026-05-17 → 2026-05-18)

Major UI overhaul. The app shifted from per-page chrome to a global page-shell, every multi-section page was ported to the new SubNav model, and a series of cross-cutting polish + cleanup landed. No public release tag yet; folded toward `v0.2.0-beta` when the operator is ready.

**App shell**
- New global TopNav (brand + 7 routes + Appearance trigger + LLM-key status pill) and contextual SubNav (per-route secondary tabs that consume `useSubNav()`).
- New `AppearanceContext` — single source of truth for theme, per-theme accent (Aurora / Plasma / Terminal / Mint), glass intensity, density, nav layout, and the briefings feature flag. Persisted in `localStorage`.
- Drag-to-scrub accent picker (range slider with a blended gradient track).
- Glass-intensity slider now actually hits every card (legacy `.glass-card` was a no-op className before).
- `/onboarding` opts out of the shell so the gated flow stays gated.

**Dashboard**
- Rebuilt around a 3-zone `.dash-grid` (rail + main).
- New `WorkflowRail` consolidates the Scan → Filter → Score chain plus the Cleanup affordance.
- New `DailyBriefingStrip` surfaces today's Daily Coach Audio with empty / generating / failed / fresh states.
- New `StatusStrip` shows 5 derived stats (Scanned / Eligible / Filtered out / Scored / Awaiting score).
- Job cards: emoji meta row, hover-date tooltip on the relative-time badge, platform-branded Apply buttons (with a multi-platform popover when a job is listed on several boards), "Eligible Match" + reason collapsed into "Passed all filters".
- Markdown-aware description rendering (handles `**bold**`, `\-` escapes, `*` bullets — common patterns from Indeed source data).

**SubNav ports**
- Settings → LLM / Auto-scan / Notifications / NotebookLM auth / Appearance sub-tabs (was a 3-tab shadcn `<Tabs>` strip).
- Briefings → Inbox / Generate.
- Applied → All / Pipeline / Timeline (Pipeline cell click jumps to All with the filter pre-applied; Timeline auto-expands every job's notes panel).
- Preferences → Profile / Job titles / Résumé / Presets (Presets folded in from a retired top-level route).
- Analytics → Pipeline / Matches / Scans.
- Platforms → Sources / Health.

**SubNav magnetic strip**
- The secondary bar's geometric midpoint now centers under the active TopNav button's midpoint. CSS variable published by a `useLayoutEffect`, ResizeObserver catches runtime sub-tab changes, 180ms ease for tab switches.

**Briefings master toggle**
- New "AI features → NotebookLM briefings" switch in the Appearance popover. When off, the DailyBriefingStrip, TopNav "Briefings" entry, Settings NotebookLM auth + auto-briefing sub-sections, and the per-job Briefings dropdown all hide. The toggle also syncs to the server — falling edge fires `settings.updateAutoScan({ autoDailyBriefing: false, autoWeeklyBriefing: false })` so the cron stops too.

**Cleanup**
- `TrackedJobsPersonalized.tsx`: −128 lines of dead state (`personalizedScan`, `aiAnalysisTest`, `debugStage1/2/3`, etc.).
- `index.css`: −178 lines of dead CSS (`.score*`, `.kbd`, `.skel`, `.empty`, `.toast-*`, `.dialog`, `.pipeline*`, `.provider-tab*`, `.sidenav`, `.terminal*`).
- `ThemeContext` + `ThemeToggle` retired (now replaced by AppearanceContext + the popover trigger).
- `PageHeader` back-arrow default flipped to `null` so 7 sub-pages stop rendering redundant "Back to Dashboard" buttons; the TopNav already provides that path.
- 13 undocumented agent hooks caught up in `AGENT_HOOKS_REFERENCE.md`.

**Bug fixes from the design-refresh audit**
- Null-platform crash in `PlatformApplyButton` when a job arrived without a `platform` value.
- `DailyBriefingStrip` rendered the "Generate now" empty state on `briefings.list` fetch errors — now surfaces an actionable error rail.
- `rolePreview` returned an empty string when a description was nothing but header lines; now falls back to a markdown-stripped slice of the full text.
- `WorkflowRail` callers were passing `Date.toString()` on timestamps that superjson sometimes hydrates as strings; helper now accepts `string | Date | null | undefined`.

See `docs/internal/DECISIONS.md` D-015 → D-018 for design rationale and `docs/internal/TASKS.md` (Phase 11.5) for the chunk-by-chunk record.

## [0.1.0-beta] — 2026-05-15

First public release. Local-first, single-user, bring-your-own-API-key job-search dashboard.

**AI provider stack**
- Multi-provider LLM router with direct vendor SDKs — no third-party gateway, no extra fees:
  - **Google Gemini** (default; `gemini-2.0-flash`)
  - **OpenAI** (`gpt-4o-mini`)
  - **DeepSeek** (`deepseek-chat`)
- Settings page exposes one API key field per provider; only the active provider's key is required to run. Env vars override settings.json. Existing single-provider `data/settings.json` files migrate automatically.

**Agentic Accessibility (core architectural commitment)**
- Every interactive surface carries documented `data-agent-action`, `data-agent-status`, and `data-agent-input` hooks so AI agents can drive the app via the DOM, not coordinate-clicks.
- A tested, copy-paste concierge prompt for browser-driving agents lives at `docs/CONCIERGE_PROMPT.md`.
- The hook inventory for human contributors is documented at `docs/internal/AGENT_HOOKS_REFERENCE.md`.

**Core features**
- Job scraping via Python JobSpy subprocess. **Indeed is the only platform validated in this beta.** Glassdoor, LinkedIn, ZipRecruiter, and Google Jobs are wired through the same backend and selectable in Settings, but results are inconsistent until later releases.
- Multi-stage AI filtering (remote eligibility, education, experience, scam detection, salary).
- Fit-score analysis weighted across skills, education, experience, and location.
- Cross-platform deduplication with "Also on" merging.
- Application tracking pipeline (Applied → Interview → Offer → Accepted/Rejected) with timeline notes.
- Saved search presets, automated scanning at configurable intervals, weekly digest summary.

**Dashboard**
- Sort by fit score, date, or salary; filter by text, job type, or platform.
- Bulk actions (select all, mark applied, export CSV); platform badges on every card.
- XSS-safe job-description rendering via DOMPurify.

**Analytics**
- Fit-score distribution histogram, top matches this week, platform distribution breakdown, scan-history trends.

**Technical**
- React 19 + Vite + Tailwind 4 + shadcn/ui + tRPC frontend.
- Express + tRPC backend, multi-provider LLM router, Python subprocess for scraping.
- Single-file SQLite storage at `./data/app.db` via sql.js (pure WASM — no native compile step, works on Windows ARM64).
- Mobile-responsive UI (44px touch targets); split tRPC router architecture.
- 66 passing tests across 5 test files (plus 11 intentionally skipped).
- Single-user — no OAuth, no sessions, no invite codes; one local user is seeded at install.
