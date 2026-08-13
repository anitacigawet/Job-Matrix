# Scraper Triage — per-platform reliability

Captured during Phase 10 D10.1 by running one minimal query per platform through the existing `server/job_scraper.py` → JobSpy → scrape_jobs path. **Triage only** — no fixes applied yet.

Last run: 2026-05-17.

> **2026-05-19 framing update.** This doc captures Tier-2 (JobSpy scraper) status only. The three "not operable" platforms below remain so; the response is not to fix them inside JobSpy but to layer a **Tier 1** (real API) data source on top. See [`DECISIONS.md` D-019](DECISIONS.md) for the tier model and Phase 13 chunks D13.1 → D13.7 in [`TASKS.md`](TASKS.md). Adzuna is the first Tier-1 source shipped.

## Test parameters

Identical across all platforms — controlled variables.

```python
scrape_jobs(
    site_name=[<platform>],
    search_term="software engineer",
    location="remote",
    results_wanted=5,
    hours_old=72,
)
```

## Results

| Platform | Status | Rows | Wall time | Detail |
| --- | --- | ---: | ---: | --- |
| **Indeed** | ✅ Working | (validated separately) | — | Production baseline. Not re-tested in this run; tracked-jobs table has live Indeed data. |
| **LinkedIn** | ✅ Working | 5 | 1.4s | Returned real job rows (titles + companies, e.g. "Software Engineer, New Grad" at Notion). JobSpy's `linkedin` site uses a no-auth public endpoint that doesn't appear to challenge our requests. May be brittle — LinkedIn is historically aggressive about scrapers; expect this to break in the future. |
| **Glassdoor** | ⚠️ Broken | 0 | 1.1s | JobSpy logs `ERROR JobSpy:Glassdoor - Glassdoor: Error encountered in API response`. Library swallows the error and returns an empty DataFrame (no exception). Root cause: Glassdoor's API path is failing — likely a schema or auth shape change on their side, or our requests are being silently rejected. |
| **ZipRecruiter** | ❌ Blocked | 0 | 0.5s | HTTP 403 from Cloudflare: `{"error_code":"forbidden aa", "error_message":"forbidden aa", "request_id":"CFRAY:9fd11d4e2f3929ab-IAD", "status_code":403}`. Standard Cloudflare bot challenge — our IPs are flagged. Unfixable from our side without rotating residential proxies or reverse-engineering the challenge. |
| **Google Jobs** | ❓ Empty | 0 | 1.0s | No error, no rows. Could be: (a) genuinely no results for our test query (unlikely for "software engineer remote"), (b) JobSpy's Google scraper silently degraded, (c) Google's scraping surface changed. Worth a follow-up test with a different query before classifying. |

## Implications

**Honest scoreboard going into Phase 10:**

- 2 working platforms (Indeed, LinkedIn) — promote LinkedIn from "experimental" if it stays working over multiple test runs.
- 2 broken platforms (Glassdoor, ZipRecruiter) — keep flagged as not working; ZipRecruiter especially is a hard block we cannot fix.
- 1 ambiguous (Google Jobs) — needs a second test with a different search term before classification.

**For honesty in user-facing docs** (the project is open source per D-023, superseding the earlier D-007 commercial framing): we should not present platforms that don't work as if they do. The README's "Beta scope: Indeed is the only platform validated" is more accurate than I'd thought at the time but may be too pessimistic about LinkedIn. Updates likely:
- Promote LinkedIn from "wired up, expect inconsistent results" to "validated, expect occasional breakage."
- Demote Glassdoor + ZipRecruiter from "wired up, expect inconsistent" to "wired up but currently blocked — exists for opt-in tinkering only."
- Re-test Google after a query-variation test.

## Open questions

1. **How stable is LinkedIn?** A single 5-row return doesn't prove much. Re-run weekly or after JobSpy updates.
2. **Can we make ZipRecruiter work behind a paid proxy?** Out of scope for the local-first / BYO-key architecture (D-002), but worth knowing.

## 2026-05-17 Deep-dive update (Phase 10 follow-up)

Re-tested all three problem platforms with corrected JobSpy params (used `is_remote=True` for remote searches, `google_search_term` for Google, real city for Glassdoor location lookup). Also read JobSpy's source for each scraper. Findings sharpen the picture:

### Glassdoor — broken at library / API drift layer

`jobspy/glassdoor/__init__.py` calls `findPopularLocationAjax.htm?term=<location>` to look up a location ID before searching. That endpoint now returns **HTTP 400** for plausible-looking queries (e.g. "New York, NY") with no parseable error body. The library logs `"Glassdoor: location not parsed"` and returns 0 rows.

With `is_remote=True` (which short-circuits the location lookup and uses hard-coded location `11047, STATE`), the request reaches the job-search endpoint but still gets `"Error encountered in API response"`. So **two layers are broken**: location AJAX endpoint and the main search endpoint.

JobSpy is on the latest released version (`1.1.82`). This is API drift between Glassdoor's current shape and the library's expectations. **Unfixable from inside Job Matrix** — needs an upstream JobSpy update or we'd have to fork and reverse-engineer Glassdoor's current API. Both out of scope.

### Google Jobs — broken at library / page-shape drift layer

`jobspy/google/__init__.py:_get_initial_cursor_and_jobs` extracts a pagination cursor from Google's HTML response. The cursor is no longer where the library expects it. Verbose log: `"initial cursor not found, try changing your query or there was at most 10 results"`. Verified across multiple query shapes (plain `search_term` + location, full `google_search_term` phrase) — same warning every time, regardless of query.

**Unfixable from inside Job Matrix** — same upstream-drift issue as Glassdoor. JobSpy's PyPI summary doesn't even list Google as a supported platform; it's there but unmaintained.

### ZipRecruiter — Cloudflare-level block

Re-verified. Still HTTP 403 from Cloudflare with the `forbidden aa` signature. This is **not even at the JobSpy layer** — ZipRecruiter's CDN is rejecting the connection before any application code sees it. The only known workarounds are residential-proxy rotation or solving the Cloudflare challenge, both of which violate the local-first / BYO-key model (D-002) and our architectural commitment to not host scraping infrastructure.

**Verdict — three of five JobSpy platforms are not realistically operable from Job Matrix right now:**
- Glassdoor — upstream library drift; revisit if JobSpy ships a fix.
- Google Jobs — upstream library drift; same.
- ZipRecruiter — hardwall; not coming back without architectural compromises we won't make.

**Two working:** Indeed (production-validated), LinkedIn (returning real results in 2026-05-17 testing).

See `DECISIONS.md` D-014 for the formal call.

## What to build next (D10.2 → D10.7)

The data above is a snapshot; Phase 10's real value is making this status **continuously visible** in the UI:

- D10.2: a `scraper_health` table + tRPC endpoint that gets updated every time a scrape attempt happens.
- D10.3: a per-platform health card on Settings (or dashboard) reading from D10.2.
- D10.4-6: partial-success handling, retries, snappy cancel — so the data feeding D10.2 is reliable.
- D10.7: a user-facing distillation of this triage doc.
