# Snapshot fixture

This directory holds the frozen demo dataset that ships with the GitHub Pages
static build (Phase 8 of the cleanup plan — see
[`docs/internal/github-pages-plan.md`](../../../docs/internal/github-pages-plan.md)).

## Files

- `snapshot.db` — sanitized SQLite database. Generated from the maintainer's
  real `./data/app.db` by `scripts/sanitize-snapshot.ts`. The real job
  listings, fit scores, and scan history are preserved; every personally
  identifying field has been overwritten with a generic demo persona.

## Regenerate

```bash
pnpm tsx scripts/sanitize-snapshot.ts
```

The script is idempotent — re-run it any time you want the demo to reflect
fresher data.

## What gets sanitized

| Table | Treatment |
| ----- | --------- |
| `users` | `openId`, `name`, `email`, `loginMethod` replaced with `demo-local-user` / `Demo User` / `demo@example.com` / `local` |
| `user_profiles` | `city`/`state` → `Austin` / `TX`; `skills_raw` replaced with a generic placeholder; `min_salary` → 80000; `salary_filter_enabled` → 0; `skills_parsed` cleared |
| `job_preferences` | `location` → `Austin, TX`; `min_salary`/`max_salary` cleared |
| `job_scan_history` | `location` normalized to `Austin, TX` |
| `search_presets` | `location` normalized to `Austin, TX` |
| `user_settings` | `auto_scan_last_run` / `auto_scan_next_run` cleared |
| `platform_credentials` | **Wiped** — session cookies and auth tokens never leave the maintainer's machine |
| `application_notes` | **Wiped** — free-text application commentary |
| `applied_jobs.notes` | Cleared |
| `debug_logs` | **Wiped** — may have contained arbitrary metadata |
| `invite_codes` | **Wiped** — unused in single-user mode anyway |

## What is preserved as-is

- `tracked_jobs` — real scraped public job listings (titles, companies,
  descriptions, salaries, AI analysis payloads, fit scores)
- `applied_jobs` — pipeline rows minus the `notes` column
- `job_scan_history` row counts and timing (location field only is rewritten)
- `user_job_titles` — saved title list

## Why a separate fixture (and not just the dev DB)?

The main app's `./data/app.db` is gitignored on purpose: it's runtime state,
not source. This snapshot is a frozen, source-controlled artifact that
exists solely for the static demo build. The exception lives in
[`.gitignore`](../../../../.gitignore) and only covers this exact path.
