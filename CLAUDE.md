# Job Matrix — Agent Notes

This file is the operating manual for coding agents maintaining this project. It
is _not_ user-facing documentation — see `README.md` for that.

## Session-open reading order

Job Matrix follows an operator-directed working model. Every fresh session reads
these sources before touching anything:

1. **This file** (`CLAUDE.md`) — role, conventions, rules.
2. **[`VISION.md`](VISION.md)** — the project's identity statement (Agentic Accessibility).
3. **[`docs/internal/ROADMAP.md`](docs/internal/ROADMAP.md)** — current strategic direction, phase-by-phase plan.
4. **[`docs/internal/TASKS.md`](docs/internal/TASKS.md)** — atomic-chunk ledger. Verify that an open item is not explicitly operator-gated before acting.
5. **[`docs/internal/DECISIONS.md`](docs/internal/DECISIONS.md)** — recent entries surface architectural calls already made; do not relitigate them.
6. **`git log --oneline -10`** — what shipped recently; catches drift between docs and the codebase.

The operator's "continue" cue applies only when `TASKS.md` contains a true
implementation item under `ACTIVE`; live credential checks, release actions,
and subjective exit reviews remain operator-gated.

## What this app is

Job-search dashboard in transition from a local, single-user prototype to a
hosted, account-based product. It combines approved job APIs and per-company ATS
feeds, optionally filters and scores listings through an LLM key the user
supplies, and tracks applications through the pipeline. Until the hosted
security boundary lands, the development server remains loopback-only.

## Architecture (current)

- **Frontend:** React 19 + Vite + Tailwind 4 + shadcn/ui + Wouter + tRPC client (`client/`)
- **Backend:** Express + tRPC (`server/_core/`, `server/routers*.ts`)
- **DB:** sql.js (WASM SQLite) + Drizzle ORM, single file at `./data/app.db` (`server/db.ts`)
- **LLM:** see "AI provider stack" below
- **Scraper:** Python subprocess (`server/job_scraper.py`, `server/python_manager.ts`) using JobSpy
- **Shared types:** `shared/`

## AI provider stack (canonical)

Three providers, user-selectable in Settings, behind ONE provider-agnostic router:

1. **Google Gemini** — DEFAULT (preselected on first run)
2. **OpenAI**
3. **DeepSeek**

The app must NOT have three forked code paths through filtering/scoring/etc. Build one router/abstraction; each provider is a thin adapter using its **direct vendor SDK** (Google `@google/genai`, `openai`, DeepSeek's OpenAI-compatible client). **No OpenRouter or other gateway** — user is strongly opposed (OpenRouter charges fees on bring-your-own-key). Settings UI exposes a provider dropdown and one API key field per provider (only the active provider's key is required to run). Env vars override settings.json.

## Hard rules

- **Agentic Accessibility is core, not optional.** Job Matrix is the first concrete implementation of a paradigm articulated in [`VISION.md`](VISION.md): every interactive UI surface is dual-purpose for humans AND for AI agents driving the app on the user's behalf. The agent's user-facing prompt lives in [`docs/CONCIERGE_PROMPT.md`](docs/CONCIERGE_PROMPT.md) (this is the **only** thing an agent should be given); the internal developer reference for the hook inventory lives at [`docs/internal/AGENT_HOOKS_REFERENCE.md`](docs/internal/AGENT_HOOKS_REFERENCE.md). Specifically:
  - Never remove or rename a `data-agent-action`, `data-agent-status`, or `data-agent-input` hook without updating `docs/internal/AGENT_HOOKS_REFERENCE.md` in the _same_ commit. The reference is the canonical inventory — drift means new contributors learn from a lie.
  - Every new interactive button, form field, async progress node, or empty state must receive an appropriate hook. Naming convention: `[verb]-[noun]` for actions (e.g. `save-profile`), `[context]` for status/input (e.g. `empty-jobs`, `user-city`). Lowercase, hyphen-separated.
  - Parameterized hooks (e.g. `toggle-title-{id}`) are expected — document them in the reference with the `{param}` placeholder.
  - Do not add "AI-only" routes or pages. The whole point is that the human UI and the agent surface are the same. If you find yourself building a parallel API just for agents, you've broken the model.
  - Do not ship a longer or alternative agent prompt without the user's explicit go-ahead. The concierge prompt has been tested end-to-end with a live agent; the framing is deliberate.
- **No Manus.** Every reference to Manus, Manus platform, manus.im, BUILT*IN_FORGE*\*, vite-plugin-manus-runtime, .manus/, Manus OAuth, or Manus analytics must be removed. Do not reintroduce.
- **No OpenRouter.** Every reference to openrouter.ai, `openrouter/...` model slugs, OPENROUTER\_\* env vars, or any OpenRouter SDK/client must be removed. Use direct provider SDKs only.
- **No behavior changes during cleanup.** When stripping Manus or refactoring the LLM layer, preserve user-visible behavior. Bugfixes and feature work are separate passes.
- **No secrets in repo.** All API keys come from `.env` (gitignored) or runtime via Settings → `./data/settings.json`.
- **No unauthenticated hosting.** The current Express server remains bound to
  `127.0.0.1` until account authentication, per-user data isolation, encrypted
  secret storage, and a hosted threat model have landed together.
- **NotebookLM is retired.** Do not restore its routes, scheduler, prompts, or
  generated-media surfaces. The final pre-removal implementation is preserved
  at Git commit `742ed69`.

## File hygiene

The canonical set of repo-root markdown files is:

- `README.md` — public-facing pitch + install + config
- `VISION.md` — the philosophical pitch ("Agentic Accessibility as a Humanitarian Bridge")
- `CHANGELOG.md` — release notes
- `CLAUDE.md` — this file (PM playbook)
- `LICENSE`
- `.env.example`

User-facing docs in `docs/`:

- `CONCIERGE_PROMPT.md` — the tested copy-paste prompt users give to their AI agent

Internal-only material lives under `docs/internal/`:

- `ROADMAP.md` — strategic direction; phase-by-phase plan from now to "complete"
- `TASKS.md` — atomic-chunk ledger for the active phase, plus NEXT UP preview + COMPLETED ARCHIVE
- `DECISIONS.md` — append-only architectural decision log
- `AGENT_HOOKS_REFERENCE.md` — developer reference enumerating every `data-agent-*` hook
- `AGENTIFY_SKILL.md` — methodology blueprint for replicating Agentic Accessibility on other projects
- `github-pages-plan.md` — deferred plan for the static-snapshot demo

The legacy `TODO.md` was retired on 2026-05-16 — its content is now distributed across `ROADMAP.md` (forward-looking phases) and `TASKS.md` `COMPLETED ARCHIVE` (historical record).

**Do not delete VISION.md.** Earlier in this project I deleted it assuming it was scratch; it is not. It is the project's identity statement. If a doc looks like scratch, check it against the above lists before removing it.

## Smoke test

```
pnpm install
pnpm check
pnpm test
pnpm dev   # opens on http://127.0.0.1:3000
```

Python venv setup is only needed to actually run a scrape — the rest of the app boots without it.
