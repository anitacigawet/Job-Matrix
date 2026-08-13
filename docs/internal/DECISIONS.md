# Job Matrix — Architectural Decisions Log

Append-only record of non-obvious calls. Future-Claude reads recent entries during session-open to avoid relitigating already-settled questions.

Format: each entry has an ID, title, date, status, context, decision, consequences. New decisions go at the **bottom**. Existing entries are NOT edited; if a decision is superseded, add a new entry that supersedes it and mark the old one `superseded by D-NNN`.

---

## D-001 — No Manus, no OpenRouter

**Date:** 2026-05-15
**Status:** active

**Context.** Job Matrix was originally scaffolded on the Manus platform with OpenRouter as a gateway for LLM calls. Operator has explicit feedback: purge both. OpenRouter charges fees on bring-your-own-key usage; Manus is a platform we don't want to depend on.

**Decision.** All references to Manus, OpenRouter, Forge, BUILT_IN_FORGE_*, vite-plugin-manus-runtime, .manus/, and any `openrouter/...` model slug have been removed. LLM access uses direct vendor SDKs only: `@google/genai`, `openai`, DeepSeek's OpenAI-compatible client. No gateways, ever.

**Consequences.** We maintain three adapters but one router. Adding a fourth provider is small. Re-introducing OpenRouter or Manus requires reopening this decision with the operator.

---

## D-002 — Local-first, single-user, bring-your-own-API-key — and that's the legal shield

**Date:** 2026-05-15
**Status:** active

**Context.** Job Matrix scrapes job boards whose ToS prohibits automated scraping. The legal exposure depends heavily on architecture: if the scraping happens on a central server we run, we're a target; if it happens on the end user's machine with their own API key, the exposure sits on them.

**Decision.** Keep the architecture local-first / single-user / BYO-key. The scraper subprocess, the SQLite database, the LLM API calls, the NotebookLM session cookies — all on the user's machine. We never host a central scraper. We never store user API keys server-side.

**Consequences.** This decision is the foundation of any commercial path (see D-007). Adding a hosted backend — even for "convenience" features like cloud sync — breaks the shield. Do not propose hosted infrastructure without reopening this with the operator and getting explicit consent.

---

## D-003 — MIT license for now; reversible since still private

**Date:** 2026-05-15
**Status:** resolved by D-023 — MIT is now permanent (public open source, no commercialization). The "reversible if D-007 lands on commercial" framing below is historical.

**Context.** The project ships with an MIT LICENSE. We're private, so nothing is irreversible yet — but once a public commit is MIT-licensed, the genie is out.

**Decision.** Stay on MIT while private. If/when the project goes commercial, swap to PolyForm Noncommercial, BSL, or proprietary BEFORE any public exposure. License decision and timing are operator's call.

**Consequences.** Future-Claude must not flip the repo public without confirming the LICENSE matches the commercial direction the operator has chosen. Hardcoded into `CLAUDE.md` rules.

---

## D-004 — NotebookLM Studio, not generic TTS, for the briefing audio

**Date:** 2026-05-16
**Status:** active

**Context.** The original ROADMAP plan was OpenAI TTS over our own scripts. Operator pointed out that Z-SPAN had a working NotebookLM wrapper with the Audio Overview "Deep Dive" two-host podcast format — which is genuinely differentiated polish that single-narrator TTS can't replicate.

**Decision.** Use NotebookLM Studio outputs (audio overviews, infographics) as the primary briefing engine, not a hand-rolled TTS pipeline. Port the Z-SPAN wrapper into `server/notebooklm/`.

**Consequences.** Introduces dependency on the unofficial `notebooklm-py` library (no official NotebookLM API exists). Inherits its rate limits, silent-rejection edge cases, and auth-cookie expiry behavior. Z-SPAN already encoded the safety scaffolding (cooldown, retry, auth-health check); we inherit that.

---

## D-005 — Fire-and-forget briefing generation; never block HTTP on it

**Date:** 2026-05-16
**Status:** active

**Context.** NotebookLM audio generation can take 20–25 minutes wall-clock. A tRPC mutation that awaits the full generation would block the HTTP request indefinitely.

**Decision.** `startBriefingGeneration` synchronously inserts a "generating" row, kicks off the Python subprocess in the background, and returns the row immediately. UI polls `briefings.get` for status changes.

**Consequences.** Operator can navigate away from /briefings without losing progress. Status flips from "generating" → "complete" or "failed" when the subprocess finishes. Server crashes mid-generation leave orphaned rows (acceptable — user can delete + retry).

---

## D-006 — AGENT_MANIFEST.md retired; concierge prompt is the only thing AI agents get

**Date:** 2026-05-16
**Status:** active (supersedes original AGENT_MANIFEST.md framing)

**Context.** Original design had AGENT_MANIFEST.md as a "public contract" enumerating every hook for AI agents to read before driving the app. Operator's actual experience: agents don't reliably consume a long manifest, and live-agent testing showed the app works well when an agent navigates by DOM hooks discovered as it goes.

**Decision.** Retire the AGENT_MANIFEST.md framing. The hook inventory moves to `docs/internal/AGENT_HOOKS_REFERENCE.md` (developer reference, not agent-facing). The tested concierge prompt at `docs/CONCIERGE_PROMPT.md` is the **only** thing AI agents are given. Do not pad it with hook documentation.

**Consequences.** Hooks are still mandatory in code (data-agent-* attributes), but their existence is for the DOM-navigation use case, not for the agent to "read about" up-front. The internal reference is for human contributors who add new hooks.

---

## D-007 — Public release paused; evaluate commercial direction

**Date:** 2026-05-16
**Status:** superseded by D-023 (2026-06-13 — decision made: open source). The "hold the public flip / don't push for it" guidance below is historical; the flip is now the plan.

**Context.** `v0.1.0-beta` is tagged in a private repo. Operator surfaced potential commercial release as a real consideration before flipping public.

**Decision.** Hold the public flip indefinitely. Use the time to (a) build out the NotebookLM briefings differentiator, (b) consult an IP attorney about scraping ToS exposure and AI-authorship copyright, (c) decide on license + distribution model. The repo stays private; revisit when the operator is ready.

**Consequences.** All forward-looking work happens in private. The deferred GitHub Pages demo (Phase 8) becomes ambiguous-scope until commercial direction is firm. Future-Claude must not push for the public flip — it's an operator-only call.

---

## D-008 — `briefings` is a single table with a `briefing_type` discriminator

**Date:** 2026-05-16
**Status:** active

**Context.** 13 distinct briefing types could have been 13 tables. But they share a lot of shape (id, userId, type, status, generation timestamps, NotebookLM bookkeeping, output content / media path, error message).

**Decision.** One `briefings` table with a discriminating `briefing_type` text column and `Briefing["briefingType"]` type-narrowed enum in TypeScript. Per-type columns optional: `text_content` for text outputs, `media_path` + `media_type` for studio artifacts.

**Consequences.** Adding a 14th briefing type is a one-line enum extension, not a new migration. Queries that need type-specific filtering use the discriminator. Sparse columns acceptable — SQLite handles them cheaply.

---

## D-009 — Briefing media files live under `data/briefings/`, served via Express static route

**Date:** 2026-05-16
**Status:** active

**Context.** Generated audio MP4s and infographic PNGs can be a few hundred KB each. Storing them as SQLite BLOBs would bloat the single-file DB; storing them on disk is cheap.

**Decision.** Media files live at `data/briefings/{audio,image,video}/{type}_{id}_{date}.{ext}`. Path stored in the `briefings.media_path` column relative to the data directory. Express serves them at `/briefings-media/*` via `express.static`.

**Consequences.** `data/briefings/` is gitignored (via the existing `data/` rule). Deleting a briefing row also deletes its media file (handled in `deleteBriefing`). Backups need to include both `data/app.db` and `data/briefings/` to be complete.

---

## D-010 — Sanitized SQLite snapshot, not JSON fixtures, for the (deferred) GitHub Pages demo

**Date:** 2026-05-15
**Status:** active (deferred until Phase 12 commercial direction clarifies)

**Context.** Phase 8 was scoped as a GitHub Pages static demo. Original plan: fabricated Austin-engineer persona + JSON fixtures. Operator pointed out the better demo is a snapshot of the real current state (real scraped jobs, sanitized personal info).

**Decision.** Capture a sanitized SQLite snapshot from the real `data/app.db`. Strip PII (name, exact location, salary), strip platform cookies, strip API key from `settings.json`, keep the real scraped jobs (public listings anyway). Ships at `client/src/snapshot/snapshot.db` with a `.gitignore` exception. Static demo (when built) loads it via sql.js.

**Consequences.** Snapshot generation script lives at `scripts/sanitize-snapshot.ts` for regeneration. The static demo plan at `docs/internal/github-pages-plan.md` needs updating to reflect SQLite-fixture approach (was originally JSON fixtures). Update is a Phase 12+ task.

---

## D-011 — Adopt AUTOPILOT_PROTOCOL formally

**Date:** 2026-05-16
**Status:** active

**Context.** Project has grown beyond what an ad-hoc TODO.md can track cleanly. Operator pointed at the Z-SPAN-derived AUTOPILOT_PROTOCOL methodology. Adopting it gives us the "operator types 'continue' → AI ships next atomic chunk" loop with appropriate gates.

**Decision.** Job Matrix adopts the protocol with these contract documents:
- `CLAUDE.md` (root) — operating manual
- `VISION.md` (root) — strategic vision
- `docs/internal/ROADMAP.md` — phase-by-phase plan
- `docs/internal/TASKS.md` — atomic-chunk ledger (this commit creates it)
- `docs/internal/DECISIONS.md` — append-only architectural log (this file)

Legacy `TODO.md` is retired; its content has been folded into `TASKS.md` COMPLETED ARCHIVE.

**Consequences.** Session-open reading order is now codified in `CLAUDE.md`. Operator's "continue" cue picks up the top item under `TASKS.md` ACTIVE. Future-Claude is expected to update both TASKS.md (ticking off chunks, adding follow-ups) and DECISIONS.md (logging non-obvious calls) as work progresses.

---

## D-012 — Python venv self-heal is per-package, not whole-wipe

**Date:** 2026-05-16
**Status:** active (supersedes prior "import jobspy → healthy → return" check)

**Context.** Adding `notebooklm-py` to REQUIRED_PACKAGES broke installs where the venv already existed: the previous health check only verified `import jobspy`, so an existing venv from before the addition was considered "healthy" and `notebooklm-py` was never installed. The Settings UI surfaced this honestly ("notebooklm-py is not installed: No module named 'notebooklm'") but the user shouldn't hit it.

**Decision.** `ensurePythonVenv()` now (a) probes the venv's Python itself for basic liveness, then (b) iterates each package in REQUIRED_PACKAGES and runs an individual `import` check, installing only the missing ones. No whole-venv wipe unless the Python interpreter itself is broken. REQUIRED_PACKAGES is now `{pkg, importName}[]` instead of `string[]` so the check has the right import name (which often differs from the PyPI package name — e.g., `python-jobspy` → `jobspy`, `notebooklm-py` → `notebooklm`).

**Consequences.** Adding a new package in the future is a one-line addition to REQUIRED_PACKAGES — next boot picks it up. Existing venvs don't need manual intervention. The check is mildly slower (one subprocess per package) but only on first request after server boot.

---

## D-013 — Defer scrape-level retry/backoff until we see transient failures

**Date:** 2026-05-17
**Status:** active (skipped Phase 10 D10.5 with rationale)

**Context.** Phase 10 D10.5 was scoped as "wrap JobSpy calls with retry + exponential backoff for transient errors." The D10.1 triage (see `SCRAPER_TRIAGE.md`) caught zero transient failures across the four non-Indeed platforms — instead, the observed failure modes are:
- Glassdoor: silent 0 rows (semantic degradation, not transient)
- ZipRecruiter: HTTP 403 from Cloudflare (hard block, retry makes it worse)
- LinkedIn: works
- Google Jobs: silent 0 rows (unclear, possibly degradation)

**Decision.** Skip D10.5 for now. Retry/backoff is speculative work that, given our observed failure profile, would either (a) do nothing because the failures are deterministic, or (b) actively hurt by hammering platforms that are already 403-ing us. Implementing it well would also require Python-side error classification, which is a non-trivial change to `job_scraper.py`.

**Consequences.** If future telemetry from the new `scraper_health` table shows transient failures clustering (e.g. 5xx responses, connection timeouts, intermittent successes), revisit this and build the retry helper. The data layer is in place — `D-002` and the scraper_health table already give us the visibility to know when retry would actually help.

---

## D-014 — Glassdoor, Google Jobs, ZipRecruiter classified as "not operable"

**Date:** 2026-05-17
**Status:** active

**Context.** After the D10.1 surface triage, operator asked whether the broken scrapers were fixable. Deep-dive (documented in `SCRAPER_TRIAGE.md` 2026-05-17 update):
- **Glassdoor** — JobSpy's location-AJAX endpoint gets HTTP 400 from Glassdoor; the job-search endpoint returns vague "Error encountered in API response." Library expects an API shape Glassdoor no longer serves.
- **Google Jobs** — JobSpy's cursor-extraction logic can't find the pagination cursor in Google's current HTML response. Library expects a DOM shape Google no longer produces. Google isn't even listed as supported in JobSpy's PyPI summary.
- **ZipRecruiter** — Cloudflare 403 before any application code runs. Hard network-level block; only fix is residential-proxy rotation, which we will not ship (violates D-002).

**Decision.** Job Matrix officially treats these three platforms as **not operable** as of 2026-05-17. We will not pursue fixes from inside Job Matrix because:
- Glassdoor + Google are upstream-library issues — JobSpy would need to be updated or forked. Forking is a substantial commitment to a non-core dependency.
- ZipRecruiter is unfixable without architectural compromises (proxy rotation) that we have committed not to make.

UI consequence: the Platforms page should warn users when they toggle these on, so they don't waste cycles trying to scrape something we know won't work. They remain toggleable in case JobSpy ships a fix and the user wants to re-validate without waiting for a Job Matrix release.

**Revisit triggers (any of):**
1. JobSpy ships a new release with Glassdoor / Google fixes — re-validate immediately.
2. Operator decides commercial path is worth a paid-proxy architecture for ZipRecruiter (likely "no" — see D-002 + D-007).
3. Real user telemetry on `scraper_health` shows one of these platforms suddenly succeeding (would suggest an upstream fix landed).

**Consequences.** Only Indeed and LinkedIn count for Phase 10's "platforms green" exit criterion. README and Platforms page are being updated to reflect this honestly rather than the previous "experimental" hedge.

---

## D-015 — App-shell + SubNav design system, ported per page

**Date:** 2026-05-18
**Status:** active

**Context.** Phase 11 closed most of the rough edges but the app still rendered with per-page chrome — every page painted its own header, nav-pills row, theme handling, and background blur effects. Adding new top-level affordances (Appearance prefs, briefings toggle, etc.) meant editing 8–10 page files. The pattern didn't scale.

**Decision.** Introduce a global page-shell in `App.tsx` consisting of:
- `<TopNav />` — single source of truth for primary navigation (8 routes → 7 after D-018), brand mark, Appearance trigger, LLM-key status pill.
- `<SubNav />` — context-aware secondary tabs per route, fed by a `SUBNAV_BY_ROUTE` map and consumed via a `useSubNav()` hook each page wires into its body.
- `<AppearanceProvider>` — single context that owns theme + per-theme accent + glass intensity + density + nav layout + feature flags (D-017), persisted in `localStorage["jobmatrix.appearance"]` and applied via `data-*` attributes on `<html>`.
- A new `index.css` token + primitive layer (`.card`, `.btn`, `.badge`, `.chip`, `.workflow-step`, `.status-strip`, `.dash-grid`, etc.) replacing the old per-page Tailwind soup.

The port lands incrementally:
- **Phase 11.5/ph1** — shell + design tokens.
- **Phase 11.5/ph2** — dashboard ported to the new 3-zone `.dash-grid` (WorkflowRail / DailyBriefingStrip / StatusStrip + the existing job list).
- **Phase 11.5/ph3a–f** — every page with a SubNav entry (Settings, Briefings, Applied, Preferences, Analytics, Platforms) reads `useSubNav()` and conditional-renders per active sub-tab.

Routes opt out of the shell via `BARE_ROUTES` (currently just `/onboarding`, which is a gated flow).

**Consequences.**
- Adding a new top-level surface = one edit to `TopNav` + optionally one to `SubNav`.
- Pages render under a consistent shell, max-width 1480px, centered.
- Legacy `.glass-card` className survives as a bridge so pages that haven't been re-styled still pick up `--glass-bg` / `--glass-blur` from the Appearance toggles.
- `ThemeContext` and `ThemeToggle` are retired (replaced by AppearanceContext + the popover trigger).
- A separate `BARE_ROUTES` mechanism in `AppShell` is the seam for future routes that should escape the shell (modals as routes, kiosk modes, etc.).

---

## D-016 — Magnetic-strip SubNav: midpoint centered under active TopNav button

**Date:** 2026-05-18
**Status:** active

**Context.** With the SubNav shipping the conventional "left-aligned to page-content" pattern, the secondary bar felt orphaned — visually disconnected from the TopNav tab that opened it. Operator pushed back twice, asking for the SubNav to feel like a dropdown extension of the parent tab. First attempt (b338593) aligned the first SubNav item under the active tab; operator clarified they wanted the *whole row's midpoint* centered under the active button.

**Decision.** `TopNav` publishes the active tab's center-x as a CSS custom property `--subnav-anchor-x` on `documentElement` (computed inside a `useLayoutEffect` that defers one rAF for layout settlement). `.subnav-inner`'s `padding-left` is `max(space-8, var(--subnav-anchor-x, space-8))`, where the anchor is set to `activeCenter - subnavLeft - contentWidth/2`. Result: the SubNav row's geometric midpoint lands under the active TopNav button's midpoint. A 180ms ease transition smooths the slide when the user changes tabs. A `ResizeObserver` on `.subnav-inner` re-runs the measurement when items change without an activeId change (e.g. when the briefings master toggle hides a sub-tab).

**Consequences.**
- The SubNav is visually tethered to its parent tab — call it "magnetic strip" behavior.
- Adding/removing sub-tabs at runtime works automatically (the ResizeObserver catches it).
- Overflow remains handled by `.subnav-inner`'s `overflow-x: auto` if a far-right active tab has many sub-items that would push past 1480px.
- Other components can read the same CSS var if they ever want to align with the active tab (none do yet, but the seam is there).

---

## D-017 — Briefings master toggle is a UI flag that also kills server-side schedules

**Date:** 2026-05-18
**Status:** active

**Context.** NotebookLM briefings are the project's most visually pervasive feature — DailyBriefingStrip on the dashboard, TopNav "Briefings" entry, JobBriefingMenu on every applied-job card, two sub-tabs in Settings, two cron toggles in Auto-scan. A user who doesn't want them shouldn't have to scroll past them everywhere. Also: NotebookLM auth requires Google login + cookies, so "off" needs to be a genuine option.

**Decision.** Add a `briefings: boolean` flag to AppearanceContext (`localStorage["jobmatrix.appearance"]`, default `true`). When `false`, every consumer (TopNav, SubNav for `/settings` + `/briefings`, dashboard, Settings Auto-scan section, AppliedJobs cards) gates its briefings-related JSX on the flag. The `/briefings` route stays reachable by direct URL so already-generated briefings stay accessible — only the surfaces that nudge **new** generation hide.

Critically, the toggle also syncs to the server: `BriefingsBackendSync` watches for the falling edge (true → false) and fires `settings.updateAutoScan({ autoDailyBriefing: false, autoWeeklyBriefing: false })`. Otherwise the cron would keep running despite the user opting out of the UI. Rising edge (false → true) does NOT auto-enable schedules — re-enabling generation requires explicit opt-in via the now-visible Auto-scan switches.

**Consequences.**
- One switch hides ~7 distinct UI surfaces in real-time.
- Existing briefings remain accessible via direct URL.
- Schedulers actually stop, not just go silent in the UI.
- The pattern (UI flag + falling-edge server sync) is a template for other "master toggle" features.

---

## D-018 — Presets folded into /preferences as a sub-tab; /presets route retired

**Date:** 2026-05-18
**Status:** active

**Context.** Presets is conceptually a feature of Preferences — different saved configurations of the same profile. Having it as a peer top-level route alongside Preferences padded the TopNav and broke the magnetic-strip slide (jumping to `/presets` felt like leaving the Preferences sub-tree). Operator pointed this out directly.

**Decision.** The standalone `/presets` route is removed from `App.tsx`. Its content (renamed `SearchPresetsContent`, stripped of `PageHeader` + container wrapper) is rendered inline inside `JobPreferences` when `useSubNav().current === "presets"`. The `/preferences` SubNav grew from 3 items to 4: Profile · Job titles · Résumé · Presets. The TopNav lost the Presets entry (8 routes → 7). The `g r` keyboard shortcut is retired (`g p` reaches Preferences, then a SubNav click reaches Presets).

The `go-to-presets` agent-action hook is dropped from AGENT_HOOKS_REFERENCE. Agents reach the new sub-tab via the parameterized `subnav-presets` hook.

**Consequences.**
- TopNav is leaner (7 tabs), magnetic strip slides cleaner across them.
- Direct `/presets` URL bookmarks break (404). Acceptable for a private beta with one user; if commercial release reopens, consider a redirect.
- This is a precedent for future "is this really a peer route?" questions — Search Presets being a configuration of Job Preferences turned out to be the right mental model.

---

## D-019 — Tiered data sources: real APIs are Tier 1, JobSpy is Tier 2, authenticated scraping is Tier 3

**Date:** 2026-05-18
**Status:** active (opens Phase 13 — Data Source Maturity)

**Context.** Phase 10 closed with two working scrapers (Indeed, LinkedIn) and three classified "not operable" (Glassdoor + Google Jobs upstream JobSpy drift, ZipRecruiter Cloudflare hardwall — see D-014). Operator's read: scraping the big-5 is a permanent maintenance treadmill, and three of them are unrecoverable from inside our architecture. Asked whether we can either (a) supplement JobSpy where it's broken, or (b) reach the same listings through real APIs.

Reality check on APIs for the big-5: there isn't one worth chasing. Indeed killed its Publisher API in 2020–2023, Glassdoor killed its Partner API in 2021 (merged into Indeed's parent), LinkedIn's Jobs API is recruiter-partner-only, Google Jobs has no public API, ZipRecruiter is partner-only. The market has actively closed off API access to push competitors toward scraping (or paying for their ads platform).

What does exist: **third-party aggregators with real public APIs that re-index much of the same supply.** Adzuna is the standout — global aggregator, generous free hobbyist tier, well-documented, returns JSON. Per-company ATS APIs (Greenhouse / Lever / Ashby / Workable) also exist but represent a different UX ("follow these companies," not "search jobs anywhere").

**Decision.** Adopt a three-tier model for data sources, ordered by reliability (Tier 1 most reliable, Tier 3 most fragile):

- **Tier 1 — Real APIs.** Documented, stable, no scraping, no ToS exposure. **Six sources ship in Phase 13:** Adzuna (global aggregator), USAJobs (US federal civilian), Jooble (global aggregator — partner key), The Muse (early/mid-career tech + media), Remotive (remote-only), RemoteOK (remote-only tech). Per-company ATS sources (Greenhouse/Lever/Ashby/Workable) ship in **Phase 14** because they need a "Watched Companies" UX, not just adapters.
- **Tier 2 — JobSpy scrapers.** What we have today: Indeed + LinkedIn green, Glassdoor + Google + ZipRecruiter "not operable" per D-014. No change to existing behavior; this tier is best-effort and may break further as platforms iterate.
- **Tier 3 — Authenticated scraping.** Out of scope for Phase 13; documented here so future work has a home. User pastes their own session cookie (e.g. LinkedIn `li_at`) and a per-platform module routes requests through it. Most likely backend: a fork or alternative library (`linkedin-jobs-scraper`-style) that accepts cookies, since JobSpy v1.1.82 does not. **Real costs to call out before building:** authenticated access trades unauthenticated scraping's CFAA exposure for a sharper contract-law exposure (user accepted ToS that forbids automation), AND puts the user's real account at ban-risk if detection trips. Off by default; behind explicit warning; throttled aggressively. Deferred to a later phase pending operator decision on whether the ban-risk trade is worth shipping.

**Architecture (Tier 1 implementation seam).** Use Option A — extend the existing `SupportedPlatform` union with new entries (`"adzuna"` first), and have `searchJobs()` in `routers_indeed.ts` branch by platform: JobSpy entries dispatch to the Python subprocess (today's path), Tier-1 entries dispatch to a Node-side adapter in `server/sources/`. A `PLATFORM_TIER` map labels each entry as tier 1/2/3 for UI badging and grouping. Telemetry stays as-is — Adzuna writes rows to the existing `scraper_health` table (same shape, same fire-and-forget call). No DB migration needed for v1.

Rejected — **Option B (two-class system with separate `enabled_sources` setting, separate `source_health` table, separate UI section).** Cleaner conceptually but more surface area and forces parallel telemetry. The user already understands one Platforms toggle list; making half of it API-backed is an implementation detail, not a new user concept. If we later need to split the UI by tier, do it as a presentation change over the same data model.

**Architectural red line preserved.** D-002 holds for all three tiers: API keys (Adzuna app_id/app_key, future cookies) stay on the user's machine in `settings.json`. We host no scraping infrastructure, route no requests through a server we operate. Tier 3 specifically: the cookie belongs to the user, the scrape happens locally, the ToS exposure is theirs — same shield model as Tier 2.

**Consequences.**
- Phase 13 (Data Source Maturity) opens; commercial-placeholder phases in ROADMAP renumber from 13–15 to 14–16.
- The README's "Scraping scope" section needs an Adzuna addition once Phase 13 lands. The Platforms page gains an Adzuna card alongside existing JobSpy cards; the broken-platform "BROKEN" badges from D-014 stay.
- Future "what about source X?" questions answer themselves through the tier model: if X has a documented public API, Tier 1 candidate; if X needs scraping, Tier 2 (and inherits all of D-014's caveats); if X needs authentication, Tier 3 (and inherits the ban-risk caveat).
- Naming: keep calling them "Platforms" in the UI. Internally they're "sources" once Tier 1 ships, but a UI rename burns user-facing terminology with no upside.
- The `linkedin-jobs-scraper` library and any other Tier-3 backend are NOT being adopted in Phase 13 — flagged here only to mark the future seam.

---

## D-020 — Per-company ATS sources via a community-contributed catalog

**Date:** 2026-05-19
**Status:** active (opens Phase 14 — Per-Company ATS + Companies Catalog). NOTE: the **community-contributable catalog framing in this entry is superseded by D-022** — the catalog is maintainer-curated, not community-PR-contributable (and the project is open source per D-023). The adapter framework + catalog mechanics described here remain accurate.

**Context.** Phase 13 (D-019) shipped six Tier-1 search-aggregator sources. The natural follow-up is **per-company ATS feeds** — Greenhouse / Lever / Ashby / Workable each expose a public JSON job board *per company*, no auth. These cover a different surface from the aggregators: instead of "give me a query, get matching jobs everywhere," it's "give me a company, get all their jobs." Per-company feeds are usually the freshest signal for the company-specific roles a user actually cares about (Anthropic's Greenhouse board has 397 listings as of test; aggregators index a fraction of those).

The operator's strategic insight when scoping Phase 14: **the company list itself should be a community-contributable catalog.** That converts "Job Matrix supports company X" from a code change into a GitHub PR. The contributor magnet that `awesome-*` lists provide. *That mechanism is the feature*, not a side-effect of the adapters.

**Decision.** Adopt this shape:

- **Catalog file at the repo root: `companies-catalog.yaml`.** Hand-edited, community-contributed via PR. Top-level location for discoverability — finding it should not require navigating the docs tree.
- **YAML over JSON** because YAML allows inline comments. Contributors can explain *why* their entry is right (where they found the slug, when they verified it works). Adds `js-yaml` as a small runtime dependency.
- **Schema:** each entry is `{ name, slug, ats, boardId, website?, tags[]? }`. `slug` is the stable identifier the app uses for de-duplication and DB references; `boardId` is the per-ATS identifier in the URL (e.g. `anthropic` in `boards-api.greenhouse.io/v1/boards/anthropic/jobs`). Often `slug === boardId` but not always — separate fields keep us flexible.
- **Validation:** Zod schema, parsed at server boot. Invalid entries log a warning and are skipped (never crash the app — a bad entry from a contributor should not kill the deploy). The catalog is read once and cached in memory; `pnpm dev` restart picks up edits.
- **Three ATS adapters in v1:** Greenhouse, Lever, Ashby. Each implements the same `JobBoardAdapter` interface in `server/sources/ats/`. **Workable is deferred** — its public API is fragmented per-company (some sites use `apply.workable.com/api/v3/accounts/{slug}/jobs`, others use a different feed entirely, some have no public surface). Not worth shipping until we have a real use case forcing a specific company.
- **Watched-companies DB table** keyed on `(user_id, company_slug)`. New tRPC router `watchedCompanies` with `list / add / remove / clear`. The scan path fans out one ATS adapter call per watched company alongside the existing Tier-1/Tier-2 dispatch. Cross-tier dedupe (already in `searchJobs()`) absorbs duplicates that the aggregators also surface.
- **New Preferences SubNav sub-tab "Companies."** Searchable, tag-filterable list of the catalog with checkboxes. Selected entries become the watched-companies set. Empty state with a "Suggest a company" link to CONTRIBUTING.md.
- **CONTRIBUTING.md flow** dedicated to "Add a company": how to find a company's ATS (look at careers page URL — `boards.greenhouse.io/{slug}`, `jobs.lever.co/{slug}`, `jobs.ashbyhq.com/{slug}`), how to find the boardId, schema fields, the PR template (one company per PR for easy review).

**What we explicitly skipped.**
- **Per-company health telemetry.** The existing `scraper_health` table is keyed by platform string; adding `(ats, boardId)` granularity is a parallel table or a relaxed key — neither is worth building until we see real failure patterns. For v1: errors log to console, the aggregate scan history's per-platform breakdown surfaces "companies returned N jobs" as a single line.
- **Catalog UI editing.** No "add a company through the app" affordance. The PR flow is the affordance — discoverability + review built in.
- **A bigger seed list.** I tried to bootstrap with well-known companies; most aren't on the slugs I guessed (`openai`, `notion`, `figma`, `shopify`, `ramp` — all wrong on Greenhouse or Lever). Rather than ship guesses, the seed is 5 verified entries (anthropic, gitlab, cloudflare on Greenhouse; netlify on Lever; posthog on Ashby). Contributors fill the rest. Better an honest small list than a wrong long one.

**Consequences.**
- One global YAML file under source control. Conflicts are rare (PR per company) but when they happen, normal merge resolution applies.
- Adding a company is a PR with a one-paragraph diff. CI should validate the new entry parses + the live API endpoint returns at least one job, so we catch bad slugs at PR time. (CI hook is a Phase 14 follow-up, not blocking.)
- The Companies sub-tab is the first UI surface that's purely catalog-driven — its content scales with the YAML file size, not with the app. Worth virtualising the list if the catalog hits ~500 entries; not needed at v1 scale.
- We've now established three distinct ways to consume Tier 1: query-aggregators (D-019), per-company ATS feeds (D-020), and the deferred Tier-3 auth-cookie path. Future sources slot into whichever pattern fits.

---

## D-021 — Work-style Quick Fill — curated static job-title starter packs, no LLM

**Date:** 2026-05-20
**Status:** active (opens Phase 15 — Work-style Quick Fill)

**Context.** First-time users hit a real cold-start problem on Job Matrix: the Job titles step asks them to type job titles, and many users (especially non-technical, career-changers, or "I just need a job" job-seekers) genuinely don't know what to type. The existing flow has two outs — type something manually, or click "Generate variations" which costs an LLM call. Neither is great for the "I don't know what I want to search for" case. Operator pitched a Quick Fill: pick a work-style category (Introvert-friendly, Extrovert-friendly, Hands-on, Entry-level / no degree), move a Low/Medium/High slider, see ~8 pre-checked job titles that match, uncheck what doesn't fit, apply.

**Decision.** Ship the Quick Fill as a **static curated dataset, no LLM at runtime, append-only merge into `user_job_titles`**. Specifically:

- Single TypeScript data file at `shared/work-style-suggestions.ts` holds all categories × levels × titles + the short level descriptions. Same shape as the Phase 14 companies-catalog: easy to PR-contribute, easy to extend, no DB schema change.
- Four categories at v1: **Introvert-friendly · Extrovert-friendly · Hands-on / physical · Entry-level / no degree**. Each has three levels (Low / Medium / High); each level holds 8 hand-picked job titles plus a one-line description framed by *the work*, not the person.
- The UI is **one reusable component** (`WorkStyleQuickFill.tsx`) — a dialog with a category picker, a level slider, a checkable title list (all pre-checked by default), and an Apply button. The dialog is rendered behind a "Quick fill ▾" button on the Preferences → Job titles sub-tab AND as an in-line panel on Onboarding step 2 (Target Positions). Same component, two entry points.
- **Apply behaviour:** case-insensitive merge into existing `user_job_titles`. Existing rows are untouched (their `isActive` state preserved); newly added titles default `isActive: true`. No surprise deletions; no overwrite.
- **No LLM, no API call, no telemetry.** The data file is the only source of truth. Adding categories is a PR with a one-paragraph diff.

Rejected — **LLM-generated suggestions.** That's already what the existing "Generate variations" button does. The whole point of Quick Fill is to give users a curated, predictable starting point when they don't even know what category to ask the LLM about.

Rejected — **Replace existing titles on Apply.** Even with confirmation, this is a footgun: a user could lose an entire hand-built list by accident. Append-only is the only safe default; the existing Job titles UI is where users prune.

Rejected — **Onboarding becomes a separate step.** Adding a 6th step inflates the perceived setup cost. The Quick Fill panel slots inside the existing step 2 (Target Positions) so the step count stays at 5.

**Architectural fit.**
- Reinforces the README's "noise + repetition + I-don't-know-what-to-type" framing — the third bullet in "Why Job Matrix exists" is exactly the problem this solves.
- Preserves Agentic Accessibility — every interaction in the dialog gets a `data-agent-*` hook so a browser agent can drive it on the user's behalf (same surface humans see).
- Preserves D-002 (local-first, BYO-key): the dataset ships in the bundle, no server call.
- Zero ongoing cost — no LLM tokens spent, no API quota burned. Static asset, free forever.

**Consequences.**
- New file `shared/work-style-suggestions.ts` becomes the canonical curated dataset. Lock-step contributor flow with the Phase 14 catalog. CONTRIBUTING.md gets a paragraph (Phase 15 follow-up).
- `JobPreferences.tsx` and `Onboarding.tsx` get small additive edits (new button + dialog render). No refactor.
- AGENT_HOOKS_REFERENCE.md gets ~5 new entries (`open-work-style-quickfill`, `select-work-style-category-{id}`, `set-work-style-level-{level}`, `toggle-suggested-title-{slug}`, `apply-work-style-suggestions`).
- Future categories slot in without code changes. Operator-requested categories at v1 are the four above; *Creative*, *Numbers / analytical*, *Outdoors*, *Remote-only* are likely v1.1 candidates.
- No DB migration — `user_job_titles` is unchanged.

---

## D-022 — Workday as a fourth ATS adapter; catalog is operator-maintained (not community)

**Date:** 2026-06-13
**Status:** active (extends D-020)

**Context.** The catalog-builder sweep (D-020 follow-through) verified ~650 companies on Greenhouse / Lever / Ashby and, as a side effect, logged **544 companies on unsupported ATSes**. Grouping those logs by host produced a clean prioritisation signal: **Workday is 186 of the 544 (34%)** — by far the largest single unlock. Every major airline, hotel parent, big-box retailer, defense prime, automotive OEM, and telco major routes its careers site through Workday. The operator greenlit building the Workday adapter as the next ATS.

The operator also clarified a standing point that supersedes D-020's framing: **the companies catalog is the operator's own, not community-contributable.** D-020 designed the catalog as a 5-entry seed that contributors would grow by PR ("better an honest small list than a wrong long one"). That premise is retired. The catalog is now a maintained asset the operator extends in bulk via `catalog-builder/` and keeps healthy with their own tooling. The `companies-catalog.yaml` header was rewritten from a contributor walkthrough to a maintainer reference; `CONTRIBUTING.md` + the README "community-maintained" framing are flagged stale pending the Phase 12 private-vs-OSS call.

**Decision.** Add `"workday"` as a fourth ATS, implemented as a peer adapter behind the existing `JobBoardAdapter` framework (D-020). Specifically:

- **Schema extension.** Workday needs more than a `boardId`. Its public job API lives at `POST https://{host}/wday/cxs/{tenant}/{site}/jobs`, where `host` is the data-center subdomain (`tenant.wdN.myworkdayjobs.com`, and the `wdN` data-center number — wd1, wd3, wd5, wd501 — is **not derivable**, it varies per tenant) and `site` is a case-sensitive site path (`targetcareers`, `CareerDepot`). So `companies-catalog-schema.ts` gains two **optional** fields, `host` and `site`, **required when `ats === "workday"`** via a `superRefine`. Greenhouse / Lever / Ashby entries are unchanged — they still need only `boardId`. `boardId` for a Workday entry holds the tenant.
- **Server-side search.** Unlike the other three ATSes (which return all jobs and filter client-side), Workday's cxs endpoint accepts `searchText` in the POST body and filters server-side. The adapter passes the user's search term straight through — necessary because large tenants return thousands of postings (Target: 2000). Pagination via `limit`/`offset`, capped like the other adapters.
- **Adapter shape.** `server/sources/ats/workday.ts` POSTs the cxs endpoint, maps `jobPostings[]` (`title`, `externalPath`, `locationsText`, `postedOn`, `bulletFields`) into the unified `JobSearchResult`. Job URL is `https://{host}/{site}{externalPath}` (verified to resolve 200, no locale prefix needed). `postedOn` is a fuzzy human string ("Posted Today" / "Posted 5 Days Ago"), so `hoursOld` filtering is best-effort: parse the relative phrase when possible, include the job when not. Per-company `site` value is `wd:{boardId}` (matching the `gh:` / `lever:` / `ashby:` convention).
- **Dispatcher.** `JobBoardInput` gains optional `host` / `site`; `fetchCompanyJobs` passes them through from the catalog entry. `ATS_ENDPOINTS` (previously `(boardId) => string`) changes to take the entry fields so the Workday URL can be built — safe because nothing consumed `ATS_ENDPOINTS` yet.

**Verification caveat that shapes the population sweep.** Probing 18 logged Workday candidates with the naive derivation (tenant = first subdomain label, site = first path segment) passed **11**; 7 returned HTTP 422/500. The failures aren't the adapter — they're that some tenants use a cxs tenant that differs from the subdomain, or require extra `appliedFacets`, or expose the board under a different site path than the careers URL suggests. **Consequence:** the 186-company population is NOT a bulk-derive — each entry must be verified live (POST returns ≥1 job) before landing, exactly like the Greenhouse/Lever/Ashby sweep. The adapter ships with **11 verified seed entries**; the remaining ~175 are a follow-on catalog-builder sweep.

**Consequences.**
- Four ATSes now supported; the catalog `ats` enum and the UI badge map (Workday → amber) grow by one. `final-catalog.yaml` sort order extends to greenhouse → lever → ashby → workday.
- Schema is no longer uniform — Workday entries carry `host` + `site`. Accepted: the alternative (cramming host+site into a delimited `boardId` string) would be less honest and harder to validate. Explicit optional fields with a conditional requirement is the cleaner schema.
- The endpoint-health-check tooling the operator plans (periodic re-verification of catalog endpoints) now has a fourth endpoint shape to probe; the `ATS_ENDPOINTS` map documents all four for exactly that use.
- No DB migration — `watched_companies` stores a slug; `tracked_jobs.platform` stores the `wd:{tenant}` text at runtime (SQLite TEXT, the Drizzle union is compile-time only, same as the existing `gh:`/`lever:`/`ashby:` values).

---

## D-023 — Open source. Public release under MIT; commercial path closed.

**Date:** 2026-06-13
**Status:** active (supersedes D-007; resolves the open question in D-003 and the Phase 12 strategic block)

**Context.** D-007 (2026-05-16) paused the public release to evaluate a commercial direction. After building out the product (Phases 10–16) and weighing it, the operator made the call: the commercial path isn't worth it. The reasoning is architectural, not just effort:
- The local-first / single-user / BYO-key model (D-002) is the legal shield — scraping happens on the user's machine, the ToS exposure is theirs. But that same property makes the product nearly unmonetizable: no server means no license enforcement (a paid local app is trivially copied), and the only "real" commercial shape is a hosted SaaS, which breaks the shield by making us the scraper operator. The architecture that protects us is structurally anti-commercial.
- The project's actual value is as a reference implementation of the **Agentic Accessibility** thesis (`VISION.md`) — a paradigm meant for others to adopt. That is maximized public, strangled if locked.
- We are not even publishing the scraper: JobSpy (the scraping engine) is already a popular public OSS project maintained by others. Job Matrix is a dashboard that *consumes* it alongside legitimate APIs (Adzuna, USAJobs, the ATS catalog). We distribute aggregation + filtering UI, not scraping tech.
- Going non-commercial removes the entire IP-attorney / license-swap / pricing / "AI-built hurts sales" pre-flight. The "made by AI" framing flips from liability to the centerpiece of the story.

**Decision.** Open-source Job Matrix.
- **Destination: a public GitHub repo under the existing MIT license.** The
  repository remains private until the operator explicitly performs that
  visibility change. No license change is needed. (AGPL was considered to block
  proprietary SaaS forks; rejected — it adds adoption friction, and the
  operator's intent is to hand the work to the commons and step out of the
  commercial-control posture, not to police downstream hosting.)
- **Code is open; the companies catalog is maintainer-curated.** Code contributions are welcome but high-bar (discuss via issue first, per `CONTRIBUTING.md`). Catalog entries are NOT community-contributable (D-022) — the operator curates them and keeps endpoints healthy with their own tooling.
- **The "made by AI / maintained by AI" framing is kept and made central**, in the project's established public voice (warm, neutral, educational — the thinking, not the thinker).
- **A scraping disclaimer is added** (the youtube-dl posture): the tool runs on the user's machine; they are responsible for complying with the ToS of any site they point it at; provided as-is, no warranty.
- **The flip is a clean-slate single-commit publish** (no leaked git history), per the portfolio release workflow.

**Architectural red line preserved.** Local-first / single-user / BYO-key (D-002) is unchanged. Open-sourcing does not add a backend, a hosted scraper, or any central infrastructure.

**Consequences.**
- **Phase 12 (Legal & Commercial Pre-flight) is closed as "resolved: open source."** Its sub-items (IP consult, license decision, pricing, distribution channel, commercial "made by AI" rewrite) are moot.
- The strategic-direction section of `ROADMAP.md`, the "stay private" framing, and the commercial musings throughout the internal docs are now stale and need a stance-alignment pass (a doc audit, this session).
- The deferred GitHub Pages demo (Phase 8 / D-010) becomes a straightforward OSS marketing/demo surface again (sanitized snapshot, never live-scraping from our infra).
- Pre-publish hygiene becomes the gate instead of legal: secrets audit, snapshot PII scrub, scraping disclaimer, SECURITY.md, and reconciling references to files outside the repo (e.g. the external `AUTOPILOT_PROTOCOL.md`).
- This is a one-way door under MIT (a public permissive release can't be reclaimed as exclusive). Accepted deliberately.

---

## D-024 — Runtime truth is shared, local-only, atomic, and behaviorally tested

**Date:** 2026-08-03
**Status:** active (stabilization contract)

**Context.** A takeover audit found several places where the implementation
looked complete while its runtime behavior disagreed: request contexts returned
a hard-coded onboarded user; Express listened beyond the local machine despite
having no authentication; scheduled scans implemented a smaller Indeed-only
workflow instead of the manual personalized-search path; source failures could
be converted into a synthetic success; ATS namespaces and inactive titles were
lost; database exports and per-row job writes created avoidable corruption and
performance risk; and tests asserted invented procedure names or skipped their
own failed setup. Public privacy copy also described local storage without
clearly naming the deliberate requests sent to job, AI, and NotebookLM
providers.

**Decision.** Treat the following as one architectural contract:

- **SQLite is the source of user state.** Every request resolves the local user
  from the database, including onboarding completion. Factory reset and a fresh
  database must return to onboarding without a server restart.
- **No-auth means loopback-only.** The Express listener and port probe bind to
  `127.0.0.1`; exposing Job Matrix to a LAN or the internet would require a new
  authentication and threat-model decision.
- **One scan pipeline owns search semantics.** Manual and scheduled runs call
  the same personalized-search procedures. Active titles, enabled platforms,
  profile locations and radius, watched companies, history, deduplication, and
  optional AI analysis cannot drift into parallel implementations.
- **Partial failure stays visible.** A source counts as successful only after a
  real source call succeeds. An empty platform selection is an error, not a
  fabricated no-op success. Stored ATS identifiers retain their `gh:`,
  `lever:`, `ashby:`, or `wd:` namespace.
- **Persistence replaces atomically and writes in batches.** A pending SQLite
  export is flushed and fsynced before rename over the live database. Bulk job
  inserts preload existing keys and commit bounded batches rather than
  exporting the full database once per row.
- **Provider boundaries use supported SDKs.** OpenAI-compatible providers use
  the OpenAI SDK with an explicit vendor base URL; Gemini uses the Google GenAI
  SDK. Common tool-choice and structured-response options are normalized at the
  shared boundary.
- **Tests prove behavior against isolated state.** Vitest points each worker at
  temporary database and settings paths. Router registration, onboarding,
  preset CRUD, filtering, application state, scan failures, network binding,
  and source normalization are asserted through real code paths; skipped and
  self-validating tests are not accepted.
- **Privacy language names transmission as well as storage.** Job Matrix does
  not create a hosted account or telemetry backend, but searches go to enabled
  job sources, AI features send selected context to the chosen provider, and
  NotebookLM features send their generated source material to Google.
- **Private and third-party preservation material stays outside Git.** Durable
  project conclusions belong in project-owned documentation; operator memory
  and verbatim third-party prompt files do not ship with the repository.

**Consequences.** Route-level lazy loading and responsive navigation are part of
the same release-readiness baseline, as is a complete dependency audit with no
known advisory. Live provider scans and subjective briefing
reviews remain operator-gated verification work; they do not justify parallel
runtime implementations or weaker automated tests.

---

## D-025 — Guided applications keep submission human; response monitoring stays local and read-only

**Date:** 2026-08-03
**Status:** active (Phase 18)

**Context.** Job Matrix already discovered, filtered, scored, and tracked jobs,
but the handoff from a good listing to an employer application was only an
external link. Application status also depended on manual updates even when an
employer had replied by email or called the user's Google Voice number. The
requested extension was more autonomy without rebuilding the product or
pretending that unattended submission and an unofficial Voice integration were
safe foundations.

**Decision.** Extend the existing surfaces with three small, composable paths:

- `tracked_jobs.status = interested` is the persistent application queue. No
  parallel queue table is introduced.
- A browser-readable application packet combines the tracked listing, optional
  reusable application answers, résumé asset, and existing search-profile
  background. A Chrome assistant may navigate and fill, but its instructions
  require it to ask about missing/sensitive information and stop before the
  employer's final Submit action. The user confirms submission, after which the
  existing applied-jobs pipeline becomes the source of truth.
- Gmail is connected through a local loopback OAuth callback using the
  read-only scope. A five-minute poller runs only while Job Matrix is running.
  It discards unrelated mail before AI classification, applies deterministic
  rules first, calls the configured LLM only for ambiguous job-related mail,
  stores only a short snippet/summary, and matches against recent applications.
  High-confidence interview, offer, and rejection events may advance the
  existing pipeline and always leave a timeline note.
- Slack uses a one-way incoming webhook for optional alerts. Google Voice is
  represented only through its official missed-call and voicemail notification
  emails in the connected Gmail inbox; no unofficial Voice API is added.

**Security and privacy boundaries.** OAuth refresh tokens, Google client
credentials, and the Slack webhook remain in the local settings file with
owner-only file permissions where the OS supports them. Résumé assets are
served only from the loopback-bound application-assets route. Gmail cursor
state and response summaries live in SQLite. There is no hosted worker, inbound
webhook, application auto-submit endpoint, or attempt to bypass employer
anti-bot systems.

**Consequences.** Monitoring pauses when the server stops or the computer
sleeps. A future always-on mode should be a launch-at-login packaging decision,
not a hidden hosted backend. Consumer Google Voice remains email-derived; a
Workspace administrator could add official Voice audit-log support later as a
separate organizational feature. The final-submit boundary is architectural,
not merely UI copy, and should not be weakened without a new decision.

---

## D-026 — Job Matrix stays contributor-owned and credits JobSpy

**Date:** 2026-08-13
**Status:** superseded by D-027

**Context.** The publicize pass briefly proposed assigning Job Matrix's
copyrightable material to ScootSolute LLC. The operator corrected that framing:
Job Matrix began around the open-source JobSpy project, and placing this project
under the LLC would misstate the relationship and spirit of the work. Technical
verification confirmed that Job Matrix installs `python-jobspy`, invokes its
`scrape_jobs` entry point through a subprocess wrapper, and adds a separate
local dashboard, source-adapter, tracking, and application layer. JobSpy itself
uses the MIT License.

**Decision.** Job Matrix stays contributor-owned and credits JobSpy as its
central upstream dependency. The original MIT licensing conclusion was
superseded before the clean-history republication by D-027.

**Consequences.** Job Matrix may describe its own additions but may not imply
ownership of JobSpy, third-party job data, provider services, or other
dependencies.

---

## D-027 — PolyForm Noncommercial for Job Matrix and later portfolio projects

**Date:** 2026-08-13
**Status:** permanent

**Decision.** Job Matrix is source-available under PolyForm Noncommercial
1.0.0. People may inspect, modify, and redistribute it for noncommercial
purposes; commercial use is prohibited. JobSpy remains separately licensed
under MIT. The public repository is republished from a clean root commit so the
published Git history contains only the noncommercial edition.
