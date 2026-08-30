# Job Matrix — Roadmap

This roadmap describes the current product direction. The detailed historical
phase ledger remains in [`TASKS.md`](TASKS.md), and architectural decisions are
recorded in [`DECISIONS.md`](DECISIONS.md).

Last updated: 2026-08-29.

## Where the project is

The published beta proves the core experience: people can describe the work
they want, collect listings from several source types, narrow those listings
with rules or an optional AI provider, and carry promising roles through a
guided application workflow. Its React interface includes semantic hooks so a
person's chosen browser agent can use the same surfaces they do.

The downloadable project remains a local, single-user application. Its public
subdomain is a static interactive showroom: the same React interface and
workflows run against deterministic fictional browser-side state, with no live
scraping, AI, uploads, accounts, email, payments, or submission side effects.
The previous hosted implementation is preserved as a restorable future option,
not the current public operating model. See D-030.

## Product center

Job Matrix should make the practical work of a job search easier without taking
control away from the person doing it:

- gather jobs from sources that permit the product's mode of access;
- make filtering and scoring understandable, with AI assistance optional;
- keep search criteria, saved jobs, application answers, and pipeline history
  on the person's own installation;
- let a person's chosen agent navigate and help through the same accessible
  interface;
- keep the final employer submission as a human approval boundary.

The source code remains visible under PolyForm Noncommercial 1.0.0. People who
want to use Job Matrix leave the showroom for the GitHub repository and run the
application on their own computer. README and release-packaging cleanup will be
specified separately.

## Current sequence

### 1. Functional public showroom

Keep the real routes, components, visual hierarchy, and Agentic Accessibility
hooks. Substitute only the tRPC transport with deterministic fictional
browser-side state. Every important public workflow must be clickable and must
reset cleanly on reload.

### 2. Hard external-side-effect boundary

The static host blocks network connections with CSP. Showroom actions do not
scrape, invoke AI providers, store uploads, connect Gmail or Slack, create
accounts, send notifications, charge money, or submit applications. The UI must
label fictional data and simulated actions without replacing the real product
surface.

### 3. Repository handoff

Every showroom route ends with a clear GitHub link where a visitor can inspect
or download the source, plus a return to the portfolio. Installation and release
presentation will be refined only after the paused README decision resumes.

### 4. Preserve the hosted option without operating it

Archive the current production database, environment, service unit, and deployed
tree before the subdomain cutover. Keep the hosted account, encryption,
admission, and owner-control code in Git. Restoring a hosted product later is a
new product and security decision, not a hidden part of the showroom.

### 5. Local application quality

Continue testing the actual local application and the static showroom from the
same source. A showroom-only adapter must not fork the visual product or create
an alternate mock interface.

## Explicitly retired

- NotebookLM session-cookie authentication and unofficial bridge code.
- Audio-overview podcasts, generated infographics/slides, and the briefing inbox.
- Automatic daily or weekly briefing generation.
- The assumption that the public subdomain must operate the hosted product.

Existing local briefing rows and files are legacy user data. Conversion work
must not silently delete them; they can be archived or removed only through an
explicit user-controlled migration later.
