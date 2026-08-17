# HANDOFF

Use this prompt to resume Job Matrix in a fresh coding-agent session after a
local-folder reset or system change.

```
This is a continuation of Job Matrix, a source-available job-search product
licensed under PolyForm Noncommercial 1.0.0. JobSpy remains a separate
MIT-licensed dependency. The product is moving from a loopback-only,
single-user beta to a hosted, account-based service where AI is optional and
each person may connect their own supported provider key.

Read these sources before responding:
  1. CLAUDE.md
  2. VISION.md
  3. docs/internal/ROADMAP.md
  4. docs/internal/TASKS.md
  5. docs/internal/DECISIONS.md, especially D-024 through D-028
  6. docs/internal/AGENT_HOOKS_REFERENCE.md
  7. git log --oneline -15

Current boundary:
  - D-028 retires the NotebookLM experiment and supersedes the permanent
    local-only direction. The final experimental edition is recoverable at
    commit 742ed69.
  - Do not restore NotebookLM routes, prompts, scheduler, media serving, or UI.
  - Existing local briefing tables, rows, or files are legacy user data; do not
    destructively remove them as part of ordinary conversion work.
  - The development server remains bound to 127.0.0.1 until authentication,
    tenant isolation, encrypted secret storage, hosted persistence, and the
    hosted threat model land together.
  - AI features remain optional. Provider keys belong to individual accounts,
    must be encrypted at rest, masked on read, excluded from logs, and
    replaceable or deletable by their owner.
  - Keep the final employer Submit action as a human approval boundary.
  - Preserve Agentic Accessibility: people and browser agents use the same UI,
    and data-agent hooks stay synchronized with AGENT_HOOKS_REFERENCE.md.

The next implementation sequence is H2 through H8 in TASKS.md: accounts and
tenant isolation, hosted data/files, secret vault, durable background work,
hosted source approval, integration redesign, and the public launch gate.

Verify the working tree and current code before adopting any remembered claim.
Do not deploy, attach a domain, call live paid providers, or change project
ownership/licensing without the operator's explicit direction.
```

Clone the repository, open the coding agent in that directory, and paste the
block above as the first message. The repository and its Git history are the
source of truth.
