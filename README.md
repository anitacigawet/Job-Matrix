# Job Matrix

**A job-search workspace that finds openings across selected public job
sources, filters them against what actually fits your life, and helps you carry
promising roles from discovery through application.**

You tell Job Matrix what kind of work fits your circumstances. It searches,
removes clear mismatches, ranks the remaining jobs, and keeps your applications
organized in one place. When you want help, a browser assistant can
work through the same interface you see while leaving final decisions with you.

![A populated Job Matrix dashboard showing its scan, filter, and scoring workflow beside ranked job matches](docs/screenshots/dashboard.png)

_The dashboard turns a pile of listings into a visible workflow: search, filter,
score, review, and apply._

> **Beta:** The repository remains runnable locally while the account-based
> hosted edition is prepared. Job sources and AI providers can change
> independently of the app, so the interface reports source health instead of
> promising permanent coverage.

---

## Who this is for

You might be:

- **Someone whose job search has become a second job** and wants one place to
  search, remove obvious mismatches, and remember what happened next.
- **A job seeker with real constraints**—location, pay, education, experience,
  schedule, or work style—who is tired of boards treating relevance as an
  afterthought.
- **Someone who wants AI assistance without surrendering the application.** A
  browser assistant can prepare forms, but it stops before the employer's final
  Submit button and waits for you.
- **A developer or accessibility-minded designer** interested in software that
  a person and their trusted agent can operate through the same interface.

If any of that sounds familiar, keep reading.

---

## What it actually does

1. **You describe the work that fits.** Add target roles, locations, pay needs,
   education, experience, and any deal-breakers that matter to you.
2. **You choose where to look.** Search selected public job feeds and
   JobSpy-backed sources.
3. **Job Matrix gathers and deduplicates listings.** The same opening appearing
   on multiple sources is grouped instead of becoming more noise.
4. **Rules remove clear mismatches.** Optional AI filtering can evaluate the
   listing against your saved profile and flag scams, MLM language, education
   conflicts, experience conflicts, location restrictions, and pay problems.
5. **The remaining jobs are ranked.** Fit scoring gives you a starting point for
   review; it does not make the decision for you.
6. **You carry promising jobs forward.** Save them to an application queue,
   track interviews and offers, keep a timeline, and export your records.
7. **A browser assistant can help with repetitive forms.** Job Matrix prepares
   a packet from answers you chose to save. The assistant may navigate and fill,
   but you review the result and personally approve the final submission.
8. **Optional response monitoring closes the loop.** A read-only Gmail
   connection in the local edition can recognize likely employer responses and
   Google Voice email notifications; Slack alerts are optional.

![Job Matrix welcome screen explaining search, fit, human approval, and local data before setup](docs/screenshots/welcome.png)

_The front door explains the bargain before asking for anything: Job Matrix does
the repetitive work, and the consequential choices stay with you._

---

## Why this is different from another job board

Job Matrix does not own a marketplace of listings and has no incentive to keep
you scrolling. It is a workspace centered on your search rather than a job
board's feed.

- **Your working record stays separate.** Hosted accounts are tenant-isolated;
  the local edition stores its record on the machine running it.
- **You choose the sources.** Public feeds and optional best-effort JobSpy
  sources are available without an experimental company-catalog layer.
- **Your circumstances drive the filter.** Relevance means more than matching a
  title. Job Matrix can account for the constraints you decide to save.
- **Assistance remains reviewable.** The browser assistant sees the same
  interface and application packet you see. There is no hidden AI-only workflow.
- **Failure is visible.** Source errors and partial scans are reported as errors
  or partial results rather than being converted into reassuring empty success.

### Agentic Accessibility

Job Matrix was built around a simple idea: software should not need a separate,
hidden interface before a trusted assistant can help operate it. Interactive
surfaces carry stable semantic hooks, keyboard navigation, and accessible state
that benefit browser agents and assistive technology at the same time.

That does not mean the agent owns the workflow. It means the interface is
legible enough for the person to delegate repetitive steps without losing the
ability to inspect, interrupt, or decide. The longer argument lives in
[`VISION.md`](VISION.md).

![The guided application dialog showing saved answers, a final-submit guardrail, and explicit review instructions](docs/screenshots/guided-application.png)

_The guided application packet is the clearest expression of the idea: saved
answers are visible, missing answers remain questions, and final submission is a
human approval boundary._

---

## Try it yourself

> **Heads up:** today this is a self-hosted developer tool. You will clone a Git
> repository and install Node.js and Python dependencies. Some searches work
> without credentials; AI filtering requires a key from a supported provider.

### What you will need

- [Node.js](https://nodejs.org/) 22 or newer.
- [pnpm](https://pnpm.io/installation) 10 or newer.
- [Python](https://www.python.org/downloads/) 3.9 or newer for optional JobSpy
  sources.
- Optional credentials for the job sources and AI provider you choose. The app
  explains each one under Settings.

### Steps

```bash
git clone https://github.com/anitacigawet/Job-Matrix.git
cd Job-Matrix
pnpm setup
pnpm dev
```

Open <http://127.0.0.1:3000>. First-run setup creates a local SQLite database
and asks which roles and locations matter to you. There is no login flow.

`pnpm setup` is safe to run again after a partial installation. For a production
build:

```bash
pnpm build
pnpm start
```

### AI providers

Job Matrix can call Google Gemini, OpenAI, or DeepSeek directly. You need only
one provider, and you can change it later under Settings. Provider names and
default models are configuration rather than promises; use a currently
available model your account supports.

### Job sources

The invite-only hosted edition begins with bounded Indeed and LinkedIn searches
only. The broader source layer below remains available to the local edition;
credentialed source tests and shared server keys are intentionally unavailable
to hosted accounts.

The source layer has two distinct shapes:

- **Public APIs and feeds:** Adzuna, USAJobs, Jooble, The Muse, Remotive, and
  RemoteOK. Some work without signup; others require free or partner credentials.
- **Best-effort scrapers:** optional JobSpy support for Indeed, LinkedIn,
  Glassdoor, ZipRecruiter, and Google Jobs. These are more fragile and may stop
  working when the underlying sites change or block automated requests.

Live results matter more than a README timestamp. Check **Platforms → Health &
telemetry** for what this installation has actually observed.

---

## Data and privacy

The repository is the transparent development version of the hosted product
and can still be run locally.

**Stored by the edition you use:** the local edition keeps its database on your
computer and listens only on `127.0.0.1`. The hosted edition separates every
account's profile, listings, and application record; provider keys are encrypted
before persistence and are never returned in full.

**Sent when you ask for it:**

- Search terms and locations go to the job sources you enable.
- Listing text and relevant profile criteria go to your selected AI provider
  when you request filtering or scoring.
- Résumé text is included when you explicitly prepare a guided application
  packet.
- A plausibly job-related email may go to the selected provider when local rules
  cannot classify it confidently. Unrelated mail is discarded before that step.
- Matched response details go to Slack only when you configure Slack alerts.

If you want the narrowest network footprint, leave AI, Gmail, Slack, and
credentialed sources disabled and use only sources you are comfortable
contacting.

---

## What works today

- Onboarding, profiles, role preferences, and search presets.
- Multi-source searches, deduplication, source health, cancellation, and scan
  history.
- Rule-based and optional AI-assisted filtering plus fit scoring.
- Application queue, guided browser-assistant packet, final-submit guardrail,
  pipeline tracking, timeline, analytics, and CSV export.
- Optional read-only Gmail response monitoring, Google Voice email recognition,
  and Slack alerts.
- Dark/light appearance controls, responsive navigation, keyboard shortcuts,
  and documented semantic hooks for browser agents.

## Known limits

- The hosted service is not publicly open yet; access begins invite-only.
- Job-source coverage changes over time, especially scraper-backed sources.
- AI judgments are suggestions. Read the listing and verify the employer before
  acting.
- Response monitoring is not a general email client and may require review when
  classification is uncertain.

---

## How this repository is organized

- **`client/`** — the React interface used by the person and browser assistant.
- **`server/`** — the local Express/tRPC service, source adapters, filtering,
  application workflow, and optional integrations.
- **`shared/`** — types, platform definitions, and shared catalog rules.
- **`drizzle/`** — the local SQLite schema and migrations.
- **`docs/CONCIERGE_PROMPT.md`** — a tested prompt for a browser assistant.
- **`docs/internal/`** — architecture, decisions, active work, and the semantic
  hook inventory for contributors.
- **`VISION.md`** — the Agentic Accessibility thesis behind the product.

---

## Contributing and maintenance

Bug reports and focused code contributions are welcome.
Please open an issue before a code pull request so the approach can be checked
against the project's tenant-isolation and human-approval boundaries.

Job Matrix is maintained on a best-effort basis. An issue is an invitation to
investigate, not a promise of a roadmap or response date. See
[`CONTRIBUTING.md`](CONTRIBUTING.md) and [`SECURITY.md`](SECURITY.md).

---

## Credits

Job Matrix is directed and maintained by James with extensive assistance from
generative-AI development tools. That collaboration is part of the project, not
a hidden disclaimer: the application is itself an experiment in building one
legible interface for a person and the trusted agents working at their direction.

Job Matrix began as a way to make
[JobSpy](https://github.com/speedyapply/JobSpy)'s job-board aggregation useful
from one local, human-readable workspace. JobSpy remains the foundation of the
optional scraper tier; Job Matrix adds the dashboard, local tracking, source
adapters, application workflow, and human-approval boundaries around it.

JobSpy and the project's other open-source dependencies remain the work of
their respective contributors. Their licenses and notices are preserved in
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) and in the dependencies
themselves.

---

## A note on intent

Job hunting asks people to repeat the same facts, scan the same noise, and spend
attention proving themselves to systems that forget them immediately. Job Matrix
does not make the important decisions for you. It gives the repetitive parts a
place to live so your attention can stay on whether the work is real, whether it
fits, and whether you want it.

---

## License

Job Matrix is source-available under the
[PolyForm Noncommercial License 1.0.0](LICENSE). You may inspect, use, modify,
and share it for noncommercial purposes. Commercial use is not permitted.

JobSpy remains a separate MIT-licensed dependency. Third-party job data,
employer names and marks, provider services, and other dependencies remain
governed by their respective owners and terms.
