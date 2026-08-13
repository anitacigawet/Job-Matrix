---
output_type: infographic
target: NotebookLM Studio — Infographic (Daily Dashboard, BENTO_GRID, PORTRAIT)
last_edited: 2026-05-16
description: A single-page visual summary of today's job-search state. Stat tiles, top matches, pipeline funnel. Designed to be glanceable.

studio:
  orientation: PORTRAIT
  detail_level: STANDARD
  style: BENTO_GRID
  language: en
---

# Daily Dashboard Infographic — design notes

A one-page visual that the user can save, screenshot, share with a coach or partner, or just glance at. Bento-grid layout puts the high-signal tiles up top with the deeper-dive content below.

## Instructions (sent to Studio)

Design a single-page infographic in **portrait orientation** that summarises the listener's current job-search state as of the briefing date. The layout should follow a **bento-grid** pattern — several distinctly-sized tiles, the most important information in the largest tile, the supporting details in smaller surrounding tiles.

**Required tiles (in approximate priority order).**

1. **Headline tile (largest).** Today's date, plus the single most important number — typically the count of new high-fit matches in the last 24h, or the count of stale applications that need follow-up. Pick the number that the listener should *act on today*.
2. **Top matches.** Three to five highest-fit new listings, each as a compact card: role title, company, fit score, salary range if available.
3. **Pipeline funnel.** A small visual showing: total tracked → eligible → applied → in-interview → offer. Real numbers from the source data, never invented.
4. **Stale applications.** Any applications waiting more than seven days for a response, named explicitly.
5. **Scan activity.** A small tile showing the last 24h of scanning — number of jobs surfaced, number new, platform breakdown if relevant.
6. **One-line takeaway.** A short prose summary at the bottom — what should the listener prioritise today?

**Style constraints.**

- **BENTO_GRID** — distinct, well-spaced tiles. No edge-to-edge bleed. Tile borders subtle but visible.
- Use the listener's actual data — never invent numbers, job titles, or companies. If a tile would be empty, say so honestly ("No new matches in the last 24h") rather than fabricate.
- Numbers should be readable at a glance — large, high-contrast typography for the headline numbers, smaller supporting text below.
- Cohesive colour palette. One accent colour for the headline tile, neutral tones for supporting tiles, one alert colour (only) for things that need action.
- No clipart or stock illustrations. Iconography only — clean, geometric, restrained.

**Forbidden.**

- Inventing data points to make the visual look fuller. Empty is honest.
- Using emoji as primary visual elements (a small accent occasionally is fine; emoji-as-design-system is not).
- Inspirational quotes or hustle-culture vocabulary in the takeaway line.
- Listing more than five top matches — pick the best, don't dump everything.
- Multi-page output. This must be a single page.

**Title.** Use the format "Job Matrix — Daily Dashboard, [date]". No subtitle.
