# Job Matrix — Roadmap

This roadmap describes the current product direction. The detailed historical
phase ledger remains in [`TASKS.md`](TASKS.md), and architectural decisions are
recorded in [`DECISIONS.md`](DECISIONS.md).

Last updated: 2026-08-16.

## Where the project is

The published beta proves the core experience: people can describe the work
they want, collect listings from several source types, narrow those listings
with rules or an optional AI provider, and carry promising roles through a
guided application workflow. Its React interface includes semantic hooks so a
person's chosen browser agent can use the same surfaces they do.

The current runtime is still a loopback-only, single-user development build.
D-028 changes the destination to a hosted, account-based product. The previous
NotebookLM audio, infographic, slide, and text-generation experiment has been
retired; its final form is preserved in Git at `742ed69`.

## Product center

Job Matrix should make the practical work of a job search easier without taking
control away from the person doing it:

- gather jobs from sources that permit the product's mode of access;
- make filtering and scoring understandable, with AI assistance optional;
- keep search criteria, saved jobs, application answers, and pipeline history
  inside a clear personal account boundary;
- let a person's chosen agent navigate and help through the same accessible
  interface;
- keep the final employer submission as a human approval boundary.

The source code remains visible under PolyForm Noncommercial 1.0.0 as a
transparency and noncommercial modification surface. The hosted service, not a
local installation guide, is intended to become the normal way people use the
product.

## Hosted architecture sequence

### 1. Identity and ownership

Add account authentication and session management, replace the constant local
user, and prove that every user-owned row and object is scoped by account. This
is the first public-hosting prerequisite; the current server stays loopback-only
until it is complete.

### 2. Hosted data and private files

Move relational state from the sql.js file to a managed database designed for
concurrent users. Move résumé assets to private object storage with short-lived,
authorized access. Define backup, export, deletion, and migration behavior at
the same boundary.

### 3. Bring-your-own AI key vault

Keep Gemini, OpenAI, and DeepSeek behind the existing provider-neutral layer.
AI stays optional. A user's key is encrypted before storage, belongs only to
that account, is never rendered or logged in full, and can be tested, replaced,
or deleted. Job Matrix can enforce request ceilings and explain provider quota
errors; actual billing limits are configured with the provider.

### 4. Background work

Replace in-process timers with durable per-user jobs. Scans and AI passes need
idempotency, cancellation, progress, bounded retries, concurrency controls, and
source/provider rate limits so one account cannot degrade another.

### 5. Hosted source policy

Review every source before it is enabled from central infrastructure. Official
APIs and public ATS endpoints remain candidates when their current terms permit
the use. Best-effort JobSpy scraping of large job sites is not carried into the
hosted service without explicit permission or a licensed data path. The public
repository may preserve historical adapter code only when doing so is legally
and operationally honest.

### 6. Integration redesign

The local Gmail callback, local filesystem secrets, desktop notifications,
factory reset, and configuration-debug surfaces cannot simply be exposed on the
web. Each is either rebuilt around account-scoped hosted security or retired.
Email-response monitoring should prefer a narrowly scoped forwarding or
provider-approved design rather than asking every user for broad mailbox access.

### 7. Agent surface and launch gate

Preserve and test the semantic browser-agent hooks while accounts are added.
After the human product boundary is stable, expose a small authenticated API or
MCP surface only where it improves reliability without creating a second hidden
product. Before launch, complete the hosted threat model, abuse controls,
privacy/export/delete flows, monitoring, incident procedures, and domain/deploy
review.

## Explicitly retired

- NotebookLM session-cookie authentication and unofficial bridge code.
- Audio-overview podcasts, generated infographics/slides, and the briefing inbox.
- Automatic daily or weekly briefing generation.
- The assumption that local-only distribution is the product's permanent legal
  or operational boundary.

Existing local briefing rows and files are legacy user data. Conversion work
must not silently delete them; they can be archived or removed only through an
explicit user-controlled migration later.
