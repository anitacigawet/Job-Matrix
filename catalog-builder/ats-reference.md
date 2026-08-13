# ATS Reference — what each agent needs to know

This file is the canonical cheat-sheet for identifying which Applicant Tracking System a company uses and how to verify their public API endpoint. Sub-agents are expected to read this file before starting work.

---

## Supported ATSes (Job Matrix has adapters)

Job Matrix can pull listings from companies using these four systems. **Only entries on these ATSes belong in `companies-catalog.yaml`.**

### 1. Greenhouse

**How to identify a company uses Greenhouse:**
- Their careers page URL has the host `boards.greenhouse.io/{slug}` (most common)
- Or `boards.eu.greenhouse.io/{slug}` (EU variant — still uses the same global API host below)
- Or `job-boards.greenhouse.io/{slug}` (newer URL pattern)
- Or their custom careers domain (e.g. `careers.acme.com`) loads an iframe or fetches JSON from one of the above hosts — view DOM / network tab to confirm.

**Verification curl:**

```bash
curl -s "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs" | head -c 200
```

**Pass:** JSON response containing a `"jobs":[...]` array with at least one entry.
**Fail:** HTTP 404 / `"Document not found"` / empty `jobs` array / HTML response.

**Example seed entries already in catalog:** anthropic, cloudflare, gitlab.

### 2. Lever

**How to identify:**
- Careers page URL has the host `jobs.lever.co/{slug}`
- Or a custom domain that loads `https://jobs.lever.co/{slug}` in an iframe.

**Verification curl:**

```bash
curl -s "https://api.lever.co/v0/postings/{slug}?mode=json" | head -c 200
```

**Pass:** JSON **array** of postings (each entry has `text`, `hostedUrl`, `categories`, etc.).
**Fail:** `{"ok":false,"error":"Document not found"}` (the slug is wrong) or empty array.

**Example seed entry:** netlify.

### 3. Ashby

**How to identify:**
- Careers page URL has `jobs.ashbyhq.com/{slug}` or `app.ashbyhq.com/posting-mgmt/{slug}`.

**Verification curl:**

```bash
curl -s "https://api.ashbyhq.com/posting-api/job-board/{slug}" | head -c 200
```

**Pass:** JSON response containing a `"jobs":[...]` array.
**Fail:** HTTP 404 or empty `jobs` array.

**Example seed entry:** posthog.

### 4. Workday

**How to identify:**
- Careers page URL has the host `{tenant}.wdN.myworkdayjobs.com/{site}` — e.g. `target.wd5.myworkdayjobs.com/targetcareers`. The `wdN` data-center number (wd1, wd3, wd5, wd501, …) varies per tenant and is **not derivable** — capture the full host.
- Or a custom careers domain that loads / redirects to a `*.myworkdayjobs.com` host.

**Workday entries need three fields, not just a slug:** `boardId` = the tenant; `host` = the full `{tenant}.wdN.myworkdayjobs.com`; `site` = the (case-sensitive) site path.

**Verification curl (POST):**

```bash
curl -s -X POST "https://{host}/wday/cxs/{tenant}/{site}/jobs" \
  -H "Content-Type: application/json" \
  -d '{"appliedFacets":{},"limit":1,"offset":0,"searchText":""}' | head -c 200
```

**Pass:** JSON with a `"total"` count and a `"jobPostings":[...]` array with at least one entry.
**Fail:** HTTP 404 / 422 (tenant or site wrong) / `"total":0`. **~40% of Workday boards 422 on the naive `tenant = first subdomain label` guess** — the cxs tenant or the site path differs. Verify live; never bulk-derive.

**Example seed entries:** target (`host: target.wd5.myworkdayjobs.com`, `site: targetcareers`), home-depot, moderna.

---

## Unsupported ATSes (don't add to catalog — log to `unsupported/{category}.md`)

Companies using these are NOT eligible for the catalog yet. Job Matrix doesn't have adapters for them. Note them so we can prioritise which ATS to support next, but **do not** include them in any `staging/*.yaml`.

| ATS | Identifying URL pattern | Notes |
| --- | ----------------------- | ----- |
| Workable | `apply.workable.com/{slug}` | Public API is fragmented per-company. Deferred per D-022. |
| BambooHR | `{company}.bamboohr.com/jobs` | No clean public-API surface. |
| SmartRecruiters | `careers.smartrecruiters.com/{slug}` or `jobs.smartrecruiters.com/{slug}` | Has a public API; the strongest next-ATS target after Workday (see the unsupported-ATS signal). |
| Jobvite | `jobs.jobvite.com/{slug}` | Partner-restricted API. |
| iCIMS | Custom subdomain per company (`careers-{company}.icims.com`) | No public bulk-jobs API. |
| Taleo | `taleo.net` subdomains | Legacy Oracle product, no clean API. |
| ADP / SAP SuccessFactors | Various | Enterprise HR suites, no public job-feed. |
| Custom (in-house) | `careers.{company}.com` with bespoke HTML | Scraping required; not in scope. |

When you find a company on one of these, write a line to `unsupported/{category-id}.md` like:

```
- Company Name — Workday — careers.acmecorp.com/wd1/...
- Another Co — SmartRecruiters — careers.smartrecruiters.com/AnotherCo
```

This builds the "evidence base" for deciding which ATS to add support for next.

---

## How to find a company's careers page when you don't already know

In rough order of effort:

1. **Search the company name + "careers" or "jobs"** via the `WebSearch` tool. The first hit is almost always their careers page.
2. **Visit the careers page** via `WebFetch`. Look at the rendered URL (it may redirect from `careers.acme.com` to `boards.greenhouse.io/acme`).
3. **If the careers page is a custom domain that doesn't redirect**, fetch its HTML and grep for any of the ATS host patterns above:
   - `boards.greenhouse.io/`
   - `boards.eu.greenhouse.io/`
   - `job-boards.greenhouse.io/`
   - `jobs.lever.co/`
   - `jobs.ashbyhq.com/`
   - `myworkdayjobs.com` (Workday — **supported**; capture host + tenant + site per §4)
   - `apply.workable.com/` (unsupported — note in unsupported.md)
   - `bamboohr.com/jobs` (unsupported)
   - `smartrecruiters.com/` (unsupported)
4. **If no ATS host appears in the HTML, assume custom/in-house** and log to unsupported.md.

## Slug normalisation

Once you have a slug, normalise it before writing:
- Lowercase only.
- Replace any non-alphanumeric character except `-` with nothing.
- Strip leading/trailing `-`.
- Reject if it doesn't match `/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/`.

The same regex is enforced by `shared/companies-catalog-schema.ts` in the live app, so a slug that fails this check would be silently dropped by the parser.

## When in doubt — skip

It is **far** better to skip a company you're unsure about than to commit a bad entry. A bad entry breaks scans for the user who watches that company. Verification curl output is mandatory; don't trust your training data alone — companies change ATSes, slugs get renamed, boards get private-mode toggled. Always verify with a live request.
