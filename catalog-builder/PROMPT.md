# Catalog Builder — Orchestrator Prompt

> **HOW TO USE:** Open a fresh Claude Code session at the Job Matrix repo root. Paste everything below the `--- BEGIN PROMPT ---` line as your first message. Use Sonnet (don't waste Opus on this). The orchestrator will dispatch one sub-agent per category and merge results into `catalog-builder/final-catalog.yaml`. Review the output, then promote the reviewed entries into `companies-catalog.yaml` (`node catalog-builder/promote-to-live.mjs`).

---

## --- BEGIN PROMPT ---

You are the **catalog-builder orchestrator** for the Job Matrix project. Your one job: extend the maintainer-curated Companies Catalog at `companies-catalog.yaml` with as many high-quality verified entries as possible, by dispatching one sub-agent per category in parallel.

### Read these files FIRST, in this order

1. `catalog-builder/ats-reference.md` — how to identify and verify each ATS.
2. `catalog-builder/categories.yaml` — the list of categories you will dispatch.
3. `companies-catalog.yaml` (repo root) — entries already in the catalog. **Sub-agents must skip these.**
4. `shared/companies-catalog-schema.ts` — the live Zod schema. Your output must validate against it.

Confirm in one short line that you have read all four before continuing.

### Setup

Create these directories if they don't exist (they're in `.gitignore`):

```bash
mkdir -p catalog-builder/staging catalog-builder/unsupported
```

### Dispatch

For each category in `catalog-builder/categories.yaml`, dispatch ONE sub-agent using the Agent tool with `subagent_type: "general-purpose"`. Send all dispatches in a **single message** so they run in parallel — the tool supports multiple Agent tool-uses in one response.

Each sub-agent gets the prompt below, with two variables substituted:
- `{CATEGORY_ID}` — the category's `id` (e.g. `ai-labs`)
- `{CATEGORY_LABEL}` — the category's `label`
- `{CATEGORY_EXAMPLES}` — comma-separated list from `examples`
- `{ALREADY_IN_CATALOG}` — comma-separated list of slugs already in `companies-catalog.yaml`

The sub-agent prompt to use, verbatim (substitute the variables):

---

```
You are a catalog-builder sub-agent for the Job Matrix project. Your scope is ONE category: **{CATEGORY_LABEL}** (id: `{CATEGORY_ID}`).

Your goal: find ~15-25 well-known companies in this category whose job boards are hosted on Greenhouse, Lever, or Ashby, verify each one against the live API, and write valid entries to `catalog-builder/staging/{CATEGORY_ID}.yaml`.

### Read these files first
1. `catalog-builder/ats-reference.md` — ATS detection and verification cheat-sheet. MANDATORY.
2. `shared/companies-catalog-schema.ts` — the entry shape and slug-validation regex.

### Trust hierarchy (read this BEFORE you start)

When researching a company, treat sources in this priority order. Never identify a company's ATS slug from a lower-tier source.

1. **Tier A — sources of truth:**
   - The company's own primary website (e.g., `acme.com`) — confirms the company exists, owns the domain, and where its careers page lives.
   - The careers page hosted on either (a) the company's own domain (`acme.com/careers`, `careers.acme.com`) OR (b) a known ATS subdomain (`boards.greenhouse.io/acme`, `jobs.lever.co/acme`, `jobs.ashbyhq.com/acme`).
   - The ATS API endpoint itself (`boards-api.greenhouse.io/v1/boards/{slug}/jobs`, etc.) — proves the slug is real and the board is active.

2. **Tier B — useful for orientation, never for ATS identification:**
   - Wikipedia (confirms the company exists and lists its primary domain).
   - The company's verified social accounts (links to their careers page).

3. **Tier C — DISTRUST. Do not use as the primary source of an ATS identification:**
   - Job aggregator sites: Indeed, LinkedIn, Glassdoor, ZipRecruiter, Monster, SimplyHired, Adzuna, etc. They list jobs, but they are NOT sources of truth for which ATS a given company uses — a job appearing on LinkedIn does not tell you the underlying ATS.
   - Recruiter or recruiter-agency LinkedIn pages.
   - "Best places to work" / "top companies hiring" listicles.
   - Third-party "we know who's hiring" sites with no obvious affiliation to the company.
   - Press releases or news articles on unrelated domains.

If you can't find Tier A sources within 2-3 search/fetch attempts, **skip the company** and log it to `unsupported/{CATEGORY_ID}.md` with reason "unclear — manual review needed". Don't push through with weak signals.

### MANDATORY PRE-STEP — build your skip list

Before doing ANY research, internalise this skip list:

**SKIP LIST (do not add to staging under ANY circumstance):** {ALREADY_IN_CATALOG}

These slugs (and the companies they correspond to) are already in the catalog. If you find yourself about to add a candidate whose slug OR whose company name matches one of these entries, STOP IMMEDIATELY and move to the next candidate. This is non-negotiable. The orchestrator's merge step would drop duplicates anyway, but including them in your staging file is wasted work AND a signal you didn't follow this rule — which is the single most important rule in this prompt. Before every single `Write` to the staging file, do a one-line check against this list. If the slug or name appears in the skip list, the answer is always: skip, move on, do not write.

### Process for each candidate company

1. **Seed list:** Start with these examples: {CATEGORY_EXAMPLES}. Expand to ~20 well-known companies in {CATEGORY_LABEL} via `WebSearch` (e.g. "top {CATEGORY_LABEL} companies", "popular {CATEGORY_LABEL} brands"). Aim for variety — prefer companies an actual job-seeker would recognise.

2. **Skip duplicates:** Re-check against the SKIP LIST above. If the company matches anything there, do not investigate — move to the next candidate.

3. **Establish the company's official domain (Tier A):**
   - `WebSearch` for `"{Company Name}"` with the quotes so the phrase is exact-matched. Scan the first 3-5 results. Skip aggregator domains (linkedin.com/company/..., indeed.com/cmp/..., glassdoor.com/Overview/..., etc.). The official `.com` (or country equivalent) is usually the company's own homepage; Wikipedia is a useful anchor to cross-check.
   - If the official domain isn't obvious, search again as `"{Company Name}" official website`.
   - If you still can't identify a clear official domain after two searches, skip the company and log to `unsupported/{CATEGORY_ID}.md` as "unclear — manual review needed".

4. **Find the careers page from the official domain:**
   - `WebFetch` the official site's homepage. Look in the navigation, footer, or "About" page for a "Careers" / "Jobs" / "Join us" / "Work with us" link.
   - Follow the link. The page you land on MUST satisfy one of these conditions, otherwise stop:
     - It's hosted on the company's own domain (`careers.acme.com`, `acme.com/careers`, `acme.com/jobs`).
     - It redirects to a known ATS subdomain in `ats-reference.md` (greenhouse / lever / ashby).
     - It embeds an iframe/JSON-fetch from one of those ATS hosts (check the rendered HTML).
   - If the careers page is on a third-party domain that ISN'T a known ATS (random recruiter site, "JoinUsAtAcme.io" not linked from the company's homepage, etc.), STOP — log to `unsupported/{CATEGORY_ID}.md` as "third-party careers page, unclear" and move on. **Never trust a careers page reached only through search results — the chain has to start from the company's own domain.**

5. **Identify the ATS:** Once you're on a verified careers page from step 4, check its URL. If it's on a known ATS host, the slug is in the path. If the careers page is the company's own domain, `WebFetch` it and grep the rendered HTML for any of these host patterns:
   - `boards.greenhouse.io/{slug}` · `boards.eu.greenhouse.io/{slug}` · `job-boards.greenhouse.io/{slug}`
   - `jobs.lever.co/{slug}`
   - `jobs.ashbyhq.com/{slug}`

   If none of those patterns appear in the HTML, the company is on an unsupported ATS or a custom system — log to `unsupported/{CATEGORY_ID}.md` with whichever ATS host you DID find (workable, bamboohr, myworkdayjobs, smartrecruiters, etc.) and move on.

6. **Sanity-check the slug.** The extracted slug should bear a clear relationship to the company name (e.g., `anthropic` for Anthropic, `stripe` or `stripeinc` for Stripe, `linearapp` or `linear` for Linear). If the slug looks completely unrelated to the company name, you've probably been led to a different company that happens to use the same ATS — skip and log to `unsupported/{CATEGORY_ID}.md` for manual review.

7. **Verify with curl:** Run the exact command in `ats-reference.md` for that ATS. Pass = JSON response with ≥1 job. Fail = HTTP 404, empty array, `{"ok":false}`, or HTML.

   Capture the **first 120 chars** of the verification response — you'll include it as a comment per entry.

8. **Spot-check one job's URL.** From the verification response, look at the first job's `absolute_url` (Greenhouse) / `hostedUrl` (Lever) / `jobUrl` (Ashby). It should point to the same ATS host with the same slug you've been working with. If it points somewhere unexpected (different company name in the URL path, different slug, redirects off-ATS), the slug is wrong — skip and log.

9. **Normalise the slug:** lowercase, alphanumeric + `-` only. Must match `/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/`. If you have to mangle the original string, you probably have the wrong value — go back and re-check the URL.

10. **Add the entry** to `catalog-builder/staging/{CATEGORY_ID}.yaml` (create the file if it doesn't exist; only YOU write to this file). Format exactly like the existing `companies-catalog.yaml`:

   ```yaml
   - name: "Anthropic"
     slug: "anthropic"
     ats: "greenhouse"
     boardId: "anthropic"
     website: "https://www.anthropic.com"
     tags: ["ai-research", "ai"]
     # verified: HTTP 200 — {"jobs":[{"absolute_url":"https://boards.greenhouse.io/an...
   ```

   The trailing `# verified:` comment is REQUIRED and is the proof of verification. Include the first ~80 chars of the actual curl response.

### Tag conventions

Reuse tags from the existing catalog where possible. Common tags already in use: `ai`, `ai-research`, `devtools`, `open-source`, `infrastructure`, `frontend`, `analytics`, `saas`, `fintech`, `crypto`, `gaming`, `healthcare`, `biotech`, `hardware`, `remote`. Add at most one new tag per company if needed — don't proliferate.

### Companies on unsupported ATSes

If a company is on Workable, BambooHR, Workday, SmartRecruiters, Jobvite, iCIMS, Taleo, ADP, or a custom in-house system: do NOT add it to staging. Instead, append a line to `catalog-builder/unsupported/{CATEGORY_ID}.md`:

```
- Company Name — Workday — careers.acmecorp.com/wd2/...
```

This file builds the evidence base for which ATS to support next.

### File-write discipline

- You write to EXACTLY two files:
  - `catalog-builder/staging/{CATEGORY_ID}.yaml`
  - `catalog-builder/unsupported/{CATEGORY_ID}.md`
- You do NOT touch any other file. Other sub-agents are working in parallel on their own categories — your only contract is that the two files above are yours alone.
- If `catalog-builder/staging/{CATEGORY_ID}.yaml` doesn't exist yet, create it with this header:

  ```yaml
  # Staging output for category: {CATEGORY_ID}
  # Sub-agent run, do not hand-edit — these entries will be merged by
  # the orchestrator and reviewed before landing in companies-catalog.yaml.
  companies:
  ```

### Quality bar

- **Verification is mandatory.** No `# verified:` comment, no entry.
- **Skip when unsure.** A bad entry breaks scans for the user who watches that company. Empty staging file > confident-but-wrong entries.
- **Skip private/dormant boards.** If the API returns an empty `jobs` array, the company isn't actively hiring on that board — skip.
- **Prefer well-known companies.** "Popular companies users would actually recognise" — not obscure 5-person startups.
- **Stay in your category.** Don't include companies that don't really fit {CATEGORY_LABEL}; that's another agent's job.

### When you're done

Return a single short status line in this exact format (one line, no markdown):

`Category {CATEGORY_ID}: added N entries to staging, M companies on unsupported ATSes logged.`

That's it. Don't include the entries themselves in your reply — they're in the file. The orchestrator reads the files directly.
```

---

### After all sub-agents return

The merge step is automated — run:

```bash
node catalog-builder/merge.mjs
```

It reads every `staging/*.yaml`, validates entries with the same rules as `shared/companies-catalog-schema.ts`, dedupes by slug (first occurrence wins) against both the within-staging set and the live `companies-catalog.yaml` seed, sorts by ATS (greenhouse → lever → ashby) then alphabetically by name, and writes `catalog-builder/final-catalog.yaml` plus `final-catalog.summary.md` (per-category breakdown + Phase 14.5 prioritisation signal grouping the unsupported-ATS logs).

Then **report** to the user with a single short message naming the two files and the headline numbers.

### Out of scope

- **Don't** edit `companies-catalog.yaml` directly. The maintainer reviews `final-catalog.yaml` first, then promotes the reviewed entries into `companies-catalog.yaml` (`promote-to-live.mjs`). The catalog is maintainer-curated — there is no PR path.
- **Don't** invent companies. WebSearch first; cite real ones.
- **Don't** retry failed verifications with mutated slugs. If the first slug from the careers page URL fails, the company likely isn't on that ATS — note it in `unsupported/` and move on.
- **Don't** install dependencies, run tests, or touch source code outside `catalog-builder/`. This is a research run only.

## --- END PROMPT ---
