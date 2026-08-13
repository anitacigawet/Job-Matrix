# Catalog Builder

Scaffolding for using sub-agents to bootstrap (or extend) the maintainer-curated Companies Catalog at `../companies-catalog.yaml`. Designed so one orchestrator dispatches many parallel sub-agents — each researches a different category, writes to its own file, never collides with another agent's work. This is **maintainer tooling**: the catalog is curated, not community-PR-contributable (see `../docs/internal/DECISIONS.md` D-022).

## Why this exists

The catalog mechanic in Phase 14 (see `../docs/internal/DECISIONS.md` D-020; the catalog is maintainer-curated per D-022) shipped with a 5-entry seed. This tool lets the maintainer do one big sweep across ~25 industry categories to produce ~50–150 new verified entries in an afternoon, all backed by real `curl`-against-the-live-API verification.

Run it once now to bulk up the catalog. Run it again in 6 months when companies churn and ATSes shift.

## What's in this directory

| File | Purpose |
| ---- | ------- |
| `PROMPT.md` | The orchestrator prompt. Paste it into a fresh Claude Code Sonnet session. Self-contained — the orchestrator handles everything from dispatch through merge. |
| `categories.yaml` | The 25 categories the orchestrator dispatches. Edit if you want to add, drop, or reshape the categories before running. |
| `ats-reference.md` | The detection/verification cheat-sheet sub-agents read first. Stable reference — only update when we add a new ATS adapter. |
| `README.md` | This file. |

Runtime artifacts (all in `.gitignore` so they don't pollute the repo):

| Path | What |
| ---- | ---- |
| `staging/{category-id}.yaml` | One per sub-agent. Validated entries this agent found. |
| `unsupported/{category-id}.md` | One per sub-agent. Companies the agent identified as being on unsupported ATSes (BambooHR, iCIMS, SmartRecruiters, etc.) — evidence base for which ATS to add support for next. |
| `final-catalog.yaml` | The merged, deduped, sorted output. Review this before merging into `../companies-catalog.yaml`. |
| `final-catalog.summary.md` | Human-readable run summary: counts, per-category breakdown, unsupported-ATS consolidation, any entries dropped during merge. |

## How to run it

1. Open a **fresh** Claude Code session at the repo root (`cd Job-Matrix; claude`). Use **Sonnet** — this is bulk-research work, not load-bearing reasoning. Opus would be wasteful.
2. Open `catalog-builder/PROMPT.md`, copy everything between the `--- BEGIN PROMPT ---` and `--- END PROMPT ---` markers, and paste it as your first message.
3. Wait. The orchestrator will:
   - Read context (~30 seconds).
   - Dispatch 25 sub-agents in parallel via the Agent tool.
   - Each sub-agent runs ~5–15 minutes (WebSearches, WebFetches, curl verifications).
   - Merge + dedupe + validate after all agents return.
4. Review `final-catalog.yaml` and `final-catalog.summary.md`. The summary tells you:
   - How many entries per ATS (Greenhouse / Lever / Ashby).
   - Which categories had the highest hit rate.
   - Which other ATSes (Workday, SmartRecruiters, etc.) host the most popular companies you couldn't add — useful signal for what to support next.
   - Any entries that got dropped (slug-validation failures, within-batch duplicates).

## After the run

Land the new entries with the promote step:

Run `node catalog-builder/promote-to-live.mjs` — it combines the existing catalog with `final-catalog.yaml`, dedupes by slug, sorts by ATS then name, and rewrites `../companies-catalog.yaml` with the maintainer header. (Or copy validated entries across by hand, slotted into the correct ATS section.) The catalog is **maintainer-curated** — there is no PR path; you review `final-catalog.yaml`, then promote.

**Don't ship entries without spot-checking a sample.** Agents are good but not infallible — a 5-entry random audit before promote catches most issues.

## Customising

Most useful adjustments before re-running:

- **Edit `categories.yaml`** to add new industry verticals or drop ones you don't care about. Each category becomes one parallel sub-agent.
- **Update `ats-reference.md`** if Job Matrix adds a new ATS adapter (e.g. Workable, SmartRecruiters). Move it from "unsupported" to "supported" and add the verification curl pattern.
- **Edit the per-agent prompt inside `PROMPT.md`** if you want to bias the agents (e.g. "prefer remote-first companies", "skip companies with <100 employees"). The substitution variables are clearly marked.

## Costs (rough)

Sonnet at current pricing, 25 parallel sub-agents each doing ~20 WebSearch/WebFetch calls + ~30 curl-line evaluations: expect **single-digit dollars per full run**. Cheap to re-run.

## Cleanup between runs

```bash
rm -rf catalog-builder/staging catalog-builder/unsupported
rm -f catalog-builder/final-catalog.yaml catalog-builder/final-catalog.summary.md
```

All gitignored — no risk of accidentally committing stale runs. The orchestrator re-creates the directories.

## What this tool will NOT do

- **Edit `companies-catalog.yaml`** directly. Final-catalog is staged separately so you can review.
- **Run installs, tests, or migrations.** Pure research.
- **Add support for new ATSes** to Job Matrix itself. That's a code change in `server/sources/ats/` — out of scope here.
- **Scrape job listings.** Verification curls hit documented public ATS APIs, nothing else. Same posture as the rest of Phase 14 — no scraping, no ToS exposure.
