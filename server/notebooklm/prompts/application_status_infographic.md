---
output_type: infographic
target: NotebookLM Studio — Infographic (Application Status Board, BENTO_GRID, LANDSCAPE)
last_edited: 2026-05-16
description: Visual map of every active application — status, days-since-applied, next action. Designed to print or screenshot for at-a-glance ops.

studio:
  orientation: LANDSCAPE
  detail_level: DETAILED
  style: BENTO_GRID
  language: en
---

# Application Status Board — design notes

This is the at-a-glance ops dashboard for the listener's active applications. Print it, tape it to the wall, screenshot it on the phone — meant to make the whole pipeline visible without opening the app.

## Instructions (sent to Studio)

Design a **landscape** bento-grid infographic that shows every active application the listener has, organised by pipeline stage. Each application is a small tile within a column-of-status layout.

**Required structure.**

Four columns left-to-right:

1. **Applied** — applications that have been sent but not yet responded to.
2. **Interview** — applications in active interview pipeline.
3. **Offer** — applications at the offer / verbal stage.
4. **Resolved** — accepted, rejected, or ghosted. Compact; this column is for reference, not focus.

Each application tile contains:
- Company name (largest text).
- Role title (smaller).
- Days since the listener entered this stage.
- A single status-colour indicator (subtle dot or border).
- For applications stalled >7 days in "Applied" or >14 days in "Interview", a small "needs follow-up" cue.

**Header strip.**

A thin header across the top with the listener's high-level stats: total active applications, oldest application, applications added this week.

**Footer / sidebar callouts.**

- One panel highlighting the applications that need follow-up today (named explicitly).
- One panel showing the next interview on the calendar, if any.

**Style constraints.**

- BENTO_GRID — tiles distinct, gridded, evenly spaced. Some columns may have more tiles than others; that's the layout doing its job.
- Status colour palette: cool neutral for Applied, warm amber for Interview, green for Offer, muted grey for Resolved. Use sparingly — colour should mean something, not decorate.
- Tile typography sized so a coach standing two feet from a printed page can read the columns at a glance.
- No icons inside individual tiles unless they communicate status.

**Forbidden.**

- Inventing companies or roles. If "Applied" is empty, show an empty-state message in that column.
- Sortable / interactive cues. This is a static infographic.
- Vanity badges ("Top 1% applicant"). Keep it functional.

**Title.** "Job Matrix — Application Status Board, [date]". One-line subtitle counting active applications: "[N] active applications across the pipeline."
