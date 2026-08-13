# Contributing to Job Matrix

Job Matrix is source-available for noncommercial use and maintained by a single operator working with AI tooling. Contributions are welcome, with a couple of ground rules that keep the project coherent.

**Two things to know up front:**

- **Code contributions** are welcome — please **open an issue first** to discuss the change before sending a PR (see below).
- **The companies catalog is maintainer-curated.** It is *not* community-PR-contributable. If you want a company added, **open an issue** to suggest it — don't send a catalog PR (it won't be merged). Details below.

---

## Contributing code

Because the project is maintained by one operator using AI tooling, the bar for code-level changes is intentionally high — but good contributions are genuinely wanted.

1. **Open an issue first.** Describe the change and why. Most code contributions are best landed after agreeing on the approach. If your proposed change conflicts with one of the project's invariants (see [`docs/internal/DECISIONS.md`](./docs/internal/DECISIONS.md)), flag it in the issue.
2. **Keep changes small and focused.** One PR per concern.
3. **Run the checks** before submitting: `pnpm check` and `pnpm test` should both be clean.

The architecture notes in [`docs/internal/`](./docs/internal/) — especially `DECISIONS.md` (the append-only decision log) and `TASKS.md` (the active workstreams) — describe the project's invariants and current direction. A quick read there will tell you whether an idea fits.

A few hard invariants worth knowing before you propose anything large:

- **Local-first, single-user, bring-your-own-API-key.** No hosted backend, no central scraping service, no auth/accounts. This is deliberate (see `DECISIONS.md` D-002) — please don't propose changes that break it.
- **Direct vendor SDKs only** for LLM access (Gemini / OpenAI / DeepSeek). No third-party gateways.

---

## Suggesting a company for the catalog

Job Matrix can pull listings directly from a company's job board if that company uses one of the supported applicant tracking systems (ATS): **Greenhouse**, **Lever**, **Ashby**, or **Workday**. The catalog at [`companies-catalog.yaml`](./companies-catalog.yaml) is **maintained by the project operator** — entries are verified against the live ATS API before they land.

To suggest a company, **open an issue** with the details below. (Please don't open a catalog PR — the catalog is curated, not community-merged.) The more of this you include, the faster it can be verified and added:

### Find which ATS the company uses

Visit the company's **Careers** page and look at the URL when you click an actual job. The host tells you the ATS:

| What you see in the URL | The ATS is | The board id is |
| --- | --- | --- |
| `boards.greenhouse.io/anthropic/jobs/12345` | `greenhouse` | `anthropic` |
| `jobs.lever.co/netlify/abcd-ef` | `lever` | `netlify` |
| `jobs.ashbyhq.com/posthog/abcd-ef` | `ashby` | `posthog` |
| `acme.wd5.myworkdayjobs.com/careers/job/...` | `workday` | tenant `acme`, host `acme.wd5.myworkdayjobs.com`, site `careers` |

Some companies use vanity domains like `careers.acmecorp.com`. In that case, open DevTools → **Network**, refresh the careers page, and look for a request to one of the ATS hosts above — the slug is in the path.

If you can't find any of those hosts, the company is probably on an ATS Job Matrix doesn't support yet (Workable, BambooHR, iCIMS, SmartRecruiters, etc.) — mention that in the issue so it can be tracked for future ATS support.

### Verify it returns jobs (optional but appreciated)

```bash
# Greenhouse
curl "https://boards-api.greenhouse.io/v1/boards/SLUG/jobs"
# Lever
curl "https://api.lever.co/v0/postings/SLUG?mode=json"
# Ashby
curl "https://api.ashbyhq.com/posting-api/job-board/SLUG"
# Workday (POST)
curl -X POST "https://HOST/wday/cxs/TENANT/SITE/jobs" \
  -H "Content-Type: application/json" \
  -d '{"appliedFacets":{},"limit":1,"offset":0,"searchText":""}'
```

A JSON response with at least one job means the board is live. An empty array means the company isn't actively hiring there — those entries aren't added (they'd be inert).

---

## Reporting bugs

Open a GitHub issue with:
- Job Matrix version (check `package.json`).
- Steps to reproduce.
- Expected vs. actual behavior.
- Any console errors (`F12` → Console) or server-log output.

## Security disclosures

Please report security issues **privately**, not in a public issue. See [`SECURITY.md`](./SECURITY.md) for the disclosure channel. (Job Matrix is local-first with no backend, so the threat surface is small — but responsible disclosure is always appreciated.)
