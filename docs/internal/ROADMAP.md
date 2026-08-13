# Job Matrix — Roadmap & Strategic Direction

Internal-only. Captures decisions, vision, and the next big feature track so future work doesn't lose context.

Last updated: 2026-08-03.

---

## Where we are

- `v0.1.0-beta` is the latest tag in `anitacigawet/Job-Matrix`. The next
  working version is `v0.2.0-beta`; no new tag has been cut. D-023 sets the
  direction toward a public MIT release, but the GitHub repository is still
  private until the operator explicitly changes its visibility.
- Previous history archived at `anitacigawet/Job-Matrix-old` (stays private; pre-cleanup, contains Manus/OpenRouter references — not part of the public release).
- Cleanup phases 1–7 complete; Phase 8 (GitHub Pages static demo) is **unblocked** by the open-source decision (D-023) — it becomes the public demo/marketing surface.
- **Phase 10 (Scraper Maturity)** closed 2026-05-17 — two platforms green (Indeed, LinkedIn), three classified "not operable" with documented reasons (`DECISIONS.md` D-014). Per-platform health telemetry shipped.
- **Phase 11 (Product Polish)** closed 2026-05-18 — every D11 chunk shipped, including the multi-provider Test Connection path, the audio player, the keyboard shortcuts, the empty-state pass, the mobile responsiveness sweep, and the briefings inbox.
- **Phase 11.5 (Design Refresh)** closed 2026-05-18 — global page-shell with TopNav + SubNav + AppearanceContext, dashboard ported to a 3-zone layout, every multi-section page ported to its SubNav (Settings, Briefings, Applied, Preferences, Analytics, Platforms), code audit + cleanup, master briefings toggle with backend sync, Presets folded into Preferences as a sub-tab, magnetic-strip SubNav anchoring. See `DECISIONS.md` D-015 → D-018 for the design rationale and `TASKS.md` for the chunk ledger.
- **Phase 13 (Data Source Maturity)** shipped 2026-05-19. Six Tier-1 real-API sources alongside the existing Tier-2 JobSpy scrapers: Adzuna, USAJobs, Jooble, The Muse, Remotive, RemoteOK. Tier 3 (authenticated cookie-based scraping) deferred. See `DECISIONS.md` D-019. D13.7 (operator exit review) is the only remaining chunk.
- **Phase 14 (Per-Company ATS Sources + Companies Catalog)** shipped 2026-05-19. Three ATS adapters (Greenhouse, Lever, Ashby) routed through a `JobBoardAdapter` framework, driven by `companies-catalog.yaml` at the repo root — **maintainer-curated** (see `DECISIONS.md` D-022; the catalog is not community-PR-contributable). New `watched_companies` data model, new Preferences "Companies" sub-tab, scan-path fan-out. See `DECISIONS.md` D-020 (catalog mechanics) and D-022 (which superseded the original community-PR framing). D14.9 (operator exit review) is the only remaining chunk.
- **Phase 15 (Work-style Quick Fill)** shipped 2026-05-20. Curated static-data starter packs of job titles, picked by work-style category + Low/Medium/High slider. Four categories at v1 (Introvert-friendly · Extrovert-friendly · Hands-on / physical · Entry-level / no degree). Reachable from Preferences → Job titles AND Onboarding step 2. Zero LLM cost, append-only merge into `user_job_titles`. See `DECISIONS.md` D-021. D15.6 is an operator experience review, not unfinished implementation.
- **Phase 17 (Reliability and release-readiness stabilization)** shipped 2026-08-03. Runtime truth, loopback safety, scan parity, atomic persistence, behavioral tests, provider SDKs, responsive navigation, route splitting, dependency hygiene, privacy copy, and private-file exclusions were reconciled together. See `DECISIONS.md` D-024.
- **Phase 18 (Guided applications and response monitoring)** shipped 2026-08-03. The existing dashboard now carries selected jobs into a Chrome-assisted application queue, keeps final submission under user approval, monitors read-only Gmail and Google Voice notification emails, matches responses to applications, and optionally alerts Slack. See `DECISIONS.md` D-025.
- **Next phases:** D13.7, D14.9, D15.6, and Phase 9 are operator-gated live reviews. D16.6 is a discrete future catalog fan-out. *(Phase 12 — Legal & Commercial Pre-flight — is **closed** by D-023: the intended release model is open source, with no commercialization.)*

## Strategic direction (decided 2026-06-13 — open source)

**Job Matrix is committed to an open-source release.** The intended destination
is a public GitHub repository under the existing **MIT** license, with no
commercialization. The repository remains private while release presentation
and operator decisions are unfinished; that current visibility does not reopen
the strategic decision. See `DECISIONS.md` D-023 for the full rationale.

This **supersedes** the earlier "stay private, evaluate commercial" stance (D-007) and **closes Phase 12** (Legal & Commercial Pre-flight) as resolved.

What the decision fixes in place:
- **License: MIT, permanent.** No swap. (AGPL was considered to block proprietary SaaS forks and rejected — adoption friction, and the intent is to hand the work to the commons, not police downstream hosting.)
- **Code is open; the companies catalog is maintainer-curated** (D-022). Code contributions welcome (issue-first); catalog PRs are not accepted.
- **The "made by AI / maintained by AI" framing is kept and made central** — it's the story, told in the project's warm, neutral public voice.
- **A scraping disclaimer ships in the README** (the youtube-dl posture: runs on your machine, you're responsible for the ToS of any site you point it at, provided as-is).
- **Architecture red line preserved** (D-002): local-first / single-user / BYO-key. Open-sourcing adds no backend, no hosted scraper.
- **Repository visibility changes remain explicit operator actions.** The
  private operator archive and verbatim third-party prompt sources are already
  excluded from tracking, removing the two known content blockers before any
  future public release.

---

## Headline feature track: NotebookLM-style job briefings

**Vision:** the user wakes up to (or sits down to) a polished, NotebookLM-style audio briefing about their job search — what's new, what's trending, what's worth their attention today. The app feels like it's been working for them overnight.

This is the headline feature. Plain dashboards are commodity. Studio-quality daily/weekly audio briefings tied to your real job-search context are not.

### Components

1. **Daily personal job report**
   - "Here's what landed in your inbox overnight. 4 new listings matched your profile — one at 92% fit. Two of your tracked applications haven't replied in over a week."
   - Pulls from the existing tracked-jobs, applied-jobs, and fit-score state.
   - Generated overnight (auto-scan scheduler is already there).
2. **Weekly market statistics**
   - "This week, Senior Frontend roles in Austin trended up 12%. The average posted salary range moved from $X to $Y. Glassdoor saw more activity than Indeed for your profile."
   - Aggregates `tracked_jobs` and `job_scan_history` across the week.
3. **Audio narration (the NotebookLM piece)**
   - TTS over the generated script. Studio voice, not robotic.
   - Provider choices to evaluate: **OpenAI TTS** (`tts-1` / `tts-1-hd`, several voices, cheap), **Google Gemini TTS** (newer, native integration with our default provider), **ElevenLabs** (best quality but expensive, separate account).
   - The user already supplies an OpenAI or Gemini key — reusing that path means no new vendor relationship.
4. **Newsletter / digest export**
   - HTML version for in-app viewing and optional copy-out.
   - MP3/WAV download for "I'll listen on my commute."
   - Plain-text fallback for accessibility.
5. **Distribution / scheduling**
   - Hook into the existing auto-scan scheduler so daily briefings generate after the overnight scan.
   - In-app inbox listing each generation.
   - No email delivery in v1 (introduces SMTP / deliverability headaches). Add later if users ask.

### Open design questions

- **TTS provider for the MVP.** I'd lean OpenAI (`tts-1` is ~$15/1M chars, great quality, OpenAI key is already a supported provider). Gemini TTS is newer and worth a look. Final call should be yours.
- **Audio storage path.** Local files under `./data/audio/` (simple) vs. embedded in SQLite as BLOBs (single-file portability). Trade-off: file system is faster and easier to debug; SQLite blobs keep everything in one file.
- **Script generation prompt.** This is the most product-defining piece. The prompt that turns raw job data into a friendly two-minute briefing is what makes or breaks the polish.
- **API-cost transparency.** TTS costs real money. A heavy daily-listener could rack up $1–3/month in TTS API spend, charged to the user's own provider key. Worth surfacing upfront so the cost is never a surprise.
- **First-run experience.** Don't auto-generate audio on first install — needs an explicit opt-in, possibly with a sample voice preview.

### Build plan (locked 2026-05-16 — using NotebookLM Studio outputs, not generic TTS)

Pivoted away from the original "OpenAI TTS over our own scripts" approach. The Z-SPAN NotebookLM bridge ported into `server/notebooklm/` gives us access to NotebookLM's full Studio output suite — including the **Audio Overview Deep Dive** two-host podcast format, which is the differentiating polish a generic single-narrator TTS can't replicate.

**Foundation layer (build first, shared by every briefing type):**
- NotebookLM auth status UI on Settings — refresh button, auto-poll, surface expiry before silent failures
- `briefings` DB table (single table, `briefing_type` discriminator)
- `BriefingsClient.add_file_source` method (for uploading our generated markdown context to NotebookLM as a source)
- Python runner + Node service for orchestration (context-gather → upload → configure → generate → download → DB write)
- `/briefings` page in the React UI — list, view, audio player, generate dropdown
- `data-agent-*` hooks on every new interactive element

**Briefing catalog (13 types):**

Audio (NotebookLM Studio Audio Overview):
1. **Daily Coach Briefing** — DEEP_DIVE / DEFAULT, ~10–12 min. Two-host morning briefing with personal-coach tone. Headline feature.
2. **Weekly Market Pulse** — BRIEF / DEFAULT, ~5 min. Sunday-evening market summary.
3. **Interview Prep Audio** — DEEP_DIVE / DEFAULT, on-demand per applied-job. One of the highest-value on-demand briefings.
4. **Resume Critique** — CRITIQUE / DEFAULT, on-demand. Requires a new resume-text profile field.
5. **Career Direction Debate** — DEBATE / LONG, ~20 min, on-demand decision-support.

Infographic (NotebookLM Studio Infographic):
6. **Daily Dashboard Infographic** — PORTRAIT / BENTO_GRID / STANDARD.
7. **Job Funnel Infographic** — LANDSCAPE / INSTRUCTIONAL / DETAILED.
8. **Application Status Board** — LANDSCAPE / BENTO_GRID / DETAILED.

Text / structured outputs (via NotebookLM chat + custom prompt):
9. **Pre-Application Job Brief** — per-job markdown report pulled before applying.
10. **Monthly Search Retrospective** — long-form narrative report.
11. **Career Path Mind Map** — visual graph of tracked roles, skills, geographic patterns.
12. **Interview Flashcards** — behavioral-question flashcards keyed to a specific role.
13. **Interview Quiz** — multi-choice prep quiz keyed to a specific role.

**Out of scope for the initial build (deferred to follow-ups):**
- Scheduled (auto-generated) daily / weekly briefings — manual "Generate now" only in v1
- MP3 transcoding (NotebookLM delivers MP4 with audio track; browsers play natively)
- Email / newsletter delivery
- Video Overview outputs (skipped — audio + infographics is enough for the differentiating polish)

**Prompt-authoring guideline:** every prompt file under `server/notebooklm/prompts/` is product-defining. Tone, structure, what to cover, what to forbid — all in the prompt body. The wrapper is plumbing.

---

## Other carried-over work (smaller stuff)

Carried over from the now-retired `TODO.md`. They don't require a strategic decision — file them under "do when relevant" in `TASKS.md`.

- ~~Per-provider "Test connection" button on the Settings page~~ — shipped as Phase 11 D11.1 + D11.1a (per-tab buttons + a header-level "Test active provider" button on the LLM card).
- ~~Validate / harden Glassdoor, LinkedIn, ZipRecruiter, Google Jobs scrapers~~ — investigated in Phase 10; three classified "not operable" (`DECISIONS.md` D-014), LinkedIn confirmed working, scraper-health telemetry shipped.
- Phase 8 (GitHub Pages static demo) — a public demo/landing surface for the open-source project (D-023 unblocked it). Loads the sanitized snapshot (D-010); never live-scrapes from our infra. A hosted demo link is the single highest-value addition to the public repo's front door.
- Manual scrape round-trip on Gemini as a final smoke test (Phase 6 deferred item).
- **Site-wide discoverability audit** *(operator request)*. Walk every page with fresh eyes, surface anything that's hard to find (buried buttons, scattered config, settings split across tabs that should be grouped). Owner: Claude + operator review. Good to run as part of the open-source pre-flight polish, since every surface is now user-facing.

## Cross-project — Housekeeping (the NotebookLM bridge, extracted)

On 2026-05-17 the generic-shaped pieces of `server/notebooklm/` were lifted into a standalone project at `~/Desktop/Housekeeping/` (deliberately outside `FINALIZE_PROJECTS/` so it can be picked up by other projects independently; local-only git repo, no remote yet) to make the NotebookLM Studio bridge + the "Living Help" pattern reusable across projects. Job Matrix keeps its own working copy of the bridge inside `server/notebooklm/` and continues to evolve it independently — the two won't auto-sync. If a real bug-fix lands in one that's worth porting to the other, do it explicitly. The concept doc capturing what the pattern *is* lives at `~/Desktop/Housekeeping/LIVING_HELP_PATTERN.md`.

## Carried-over future enhancements

From the v1.0 roadmap, still relevant but post-beta:

- Salary trend analysis across platforms (overlaps with the weekly briefing)
- Job alert notifications (overlaps with daily briefing)
- Resume/profile import from LinkedIn
- Optional resume auto-fill onboarding
- Dark/light theme toggle
- Keyboard shortcuts
- Job comparison view (side-by-side)
- Export to Google Sheets
- Localization / multi-language
- Improve broad-search resilience and retry behavior
- Improve scan pause/cancel behavior
- Tighten progress reporting consistency
- Better Windows-local developer setup for the Python scraper
