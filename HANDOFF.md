# HANDOFF

*Bootstrap prompt for resuming Job Matrix work in a fresh coding-agent session
after a local-folder reset or system change. Clone this repository, open the
agent in the cloned directory, and paste the contents of the code block below as
the first message.*

---

## Copy-paste this into a fresh coding-agent chat

```
This is a continuation of long-running work on Job Matrix — a local-first,
single-user, bring-your-own-API-key job-search dashboard (React + tRPC +
Express + sql.js SQLite + a Python JobSpy subprocess + an optional NotebookLM
bridge). The code is published under PolyForm Noncommercial 1.0.0; commercial
use is not permitted. JobSpy remains a separate MIT-licensed dependency.
Project root: this cloned repository directory.

Ingest the docs in this exact order before responding:
  1. CLAUDE.md (operating manual + hard rules + reading-order contract)
  2. VISION.md (Agentic Accessibility — the project's identity)
  3. docs/internal/ROADMAP.md (strategic direction and current state)
  4. docs/internal/TASKS.md (atomic-chunk ledger)
  5. docs/internal/DECISIONS.md — especially D-022 through D-024
  6. docs/internal/AGENT_HOOKS_REFERENCE.md (the data-agent-* hook inventory)
  7. docs/internal/gemini-skills-analysis.md (original analysis of excluded
     third-party prompt references)
  8. `git log --oneline -15` — what shipped recently

== State as of 2026-08-03 ==
The stabilization pass is complete and should be preserved as one checkpoint:
  - onboarding state is read from SQLite on every request; factory reset and a
    fresh database therefore return to onboarding correctly;
  - the unauthenticated local server binds only to 127.0.0.1;
  - manual and scheduled scans call the same full personalized-search pipeline,
    honor active titles and enabled sources, preserve ATS source IDs, and report
    real failures instead of synthetic successes;
  - database persistence uses atomic replacement and batched job writes;
  - OpenAI, DeepSeek, and Gemini integrations use their supported SDKs;
  - route-level code splitting and responsive navigation are in place;
  - behavioral tests use isolated temporary databases and contain no skipped or
    self-validating assertions;
  - privacy wording states exactly what stays local and what is sent to job,
    AI, and NotebookLM providers;
  - the private operator archive and verbatim third-party prompt files are
    excluded from Git. Their durable, original analysis remains in
    docs/internal/gemini-skills-analysis.md.

== Open product work ==
  - The publicize_project pass is complete: outside-in README, reproducible
    screenshots, CI, dependency monitoring, and GitHub metadata are prepared.
  - Job Matrix is contributor-owned and source-available under PolyForm
    Noncommercial 1.0.0. Commercial use is prohibited. It explicitly credits
    JobSpy as its central, separately MIT-licensed upstream dependency.
  - The operator authorized the v0.2.0-beta release and public visibility
    change as part of the publicize pass.
  - D16.6: populate ~175 more Workday companies (each needs live cxs
    verification — the naive tenant=subdomain derivation only works ~60%).
  - Phase 9 briefings validation + grafting the Gemini-skill patterns
    (docs/internal/gemini-skills-analysis.md) into the 13 NotebookLM prompt
    files.
  - Operator-gated exit reviews still open: D13.7, D14.9, D15.6 (real-scan smoke
    tests on the running app).

== What the operator should do next ==
Ask what feature or validation the operator wants next. Before editing, verify
the current working tree and rerun the relevant checks; do not infer that a
release, deployment, public-visibility change, or live provider call is wanted.

Confirm you've ingested the docs and then ask the operator what they want to
work on first.
```

---

## How to resume

1. Clone the repo: `git clone https://github.com/anitacigawet/Job-Matrix.git`
2. `cd Job-Matrix`
3. Open the coding agent in that directory.
4. Open this `HANDOFF.md`, copy the code block above (everything between the
   triple-backticks), and paste it as your first message in the new chat.
5. The new session ingests the project's docs in the right order and is ready to
   continue.

You don't need anything else preserved locally. The repo is the source of truth.

## How this file came to exist

The operator paused this project for long-term storage and wanted a fresh clone
to contain everything another session needs. Private cross-project memory and
verbatim third-party prompt references are intentionally not part of that source
of truth. Their repository-facing conclusions were reconciled into the internal
documentation before exclusion.
