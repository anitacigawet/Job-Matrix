![Job Matrix title rendered as red balloon letters rising from an open box against warm Christmas lights](docs/images/job-matrix-banner.png)

## What is this?

Job Matrix consolidates job listings from Adzuna, USAJobs, Jooble, The Muse,
Remotive, RemoteOK, Indeed, and LinkedIn in an organized and easy-to-read manner
for both humans and AI agents.

You can tell Job Matrix what work would best fit your specific circumstances,
and it will automatically search and rank jobs on your behalf while keeping all
of your applications organized in one consolidated place. This can be completed
automatically by an AI with “personal intelligence” (context) about your
specific career aspirations and situation, or by hand.

![A populated Job Matrix dashboard showing its scan, filter, and scoring workflow beside ranked job matches](docs/screenshots/dashboard.png)

_Search, filter, score, and track jobs from one dashboard._

---

## Who is this for?

- **Individuals wanting to speed up their job search.** Search from one
  consolidated place while removing obvious mismatches and reducing stale
  listings (where applicable).
- **Those constantly struggling with “filters” on job-search websites.**
  Whether it is location, pay, education, or experience, you should not have to
  repeat the specific parameters of the job you are looking for over and over.
- **Someone who wants AI to prepare forms for them.** The website is built to
  be easily read and operated by in-browser AI agents such as OpenAI and Claude
  (and others). If an agent has your personal context, it can prepare forms and
  set everything up for you autonomously (with supervision recommended). If it
  does not have that context, simply say, “Hey, set this up for me and walk me
  through it.”

![Job Matrix welcome screen explaining search, fit, human approval, and local data before setup](docs/screenshots/welcome.png)

_The setup screen explains the workflow before you enter any information._

---

## What it actually does

1. **Add preset filters that actually stick.** Job Matrix saves your target
   roles, locations, expected salary/pay, education, and experience. Presets
   keep repeatable combinations of roles, location, radius, work arrangement,
   pay, and sources. The app does not erase them between searches or make you
   enter them again for each platform.
2. **Utilize multiple sources.** Job Matrix can search Adzuna, USAJobs, Jooble,
   The Muse, Remotive, RemoteOK, Indeed, and LinkedIn. It also keeps toggleable
   JobSpy connectors for Glassdoor, ZipRecruiter, and Google Jobs so they can be
   re-tested after upstream fixes, but those three are not currently reliable.
3. **Reduce stale and duplicate listings.** Job Matrix applies posting-age
   limits where a source supports them, but it does not claim to identify ghost
   jobs. Exact cross-source duplicates are dropped during collection. Other
   likely duplicates are grouped and hidden by default, not deleted from the
   local database, so the same opening does not become unnecessary visual
   harassment. You can still reveal every listing when you want to compare
   sources.
4. **Remove obvious mismatches.** Optional filtering checks listings against
   your location and work arrangement, education, experience, and expected
   salary/pay. Filtered jobs remain reviewable instead of disappearing without
   an explanation.
5. **Rank job searches based on personalization factors.** When AI scoring is
   enabled, Job Matrix generates a fit score from the information you provide.
   It is an estimate and starting point for judging your potential readiness for
   each job, not a decision made for you.
6. **Long-term tracking.** Save jobs to an application queue,
   track interviews and offers, keep a timeline, and export your records.

---

## Works with in-browser AI agents

Job Matrix labels its buttons, inputs, progress states, and empty states so a
browser agent can operate the same interface you use. There is no separate
AI-only page. An agent can help configure a search, review results, and prepare
a guided application packet. It must stop before the employer's final Submit
button so you can review and approve the application.

![The guided application dialog showing saved answers, a final-submit guardrail, and explicit review instructions](docs/screenshots/guided-application.png)

_Saved answers stay visible, missing answers remain questions, and final
submission stays under your control._

---

## Try it yourself

The [public Job Matrix showroom](https://jobmatrix.scootsolute.org/) uses the
real interface and workflows with deterministic fictional data. You can click
through the search, filtering, scoring, application, preference, source,
analytics, and settings flows. It resets when the page reloads and does not
scrape job sites, call an AI provider, send email, upload files, or submit an
application.

To use Job Matrix with your own searches and records, run it locally.

### What you will need

- [Node.js](https://nodejs.org/) 22 or newer.
- [pnpm](https://pnpm.io/installation) 10 or newer.
- [Python](https://www.python.org/downloads/) 3.9 or newer if you want to use
  JobSpy-backed sources. The app creates and repairs its Python environment on
  the first scraper run.
- Credentials only for the job sources or optional AI provider you choose.

### Run it locally

```bash
git clone https://github.com/anitacigawet/Job-Matrix.git
cd Job-Matrix
pnpm setup
pnpm dev
```

Open <http://127.0.0.1:3000>. First-run setup creates a local SQLite database
and asks which roles and locations matter to you. There is no login.

For a production build:

```bash
pnpm build
pnpm start
```

Job Matrix supports Google Gemini, OpenAI, and DeepSeek directly. AI is
optional; search, organization, and application tracking still work without an
AI provider.

---

## Data and privacy

The public showroom uses fictional information stored only in the current
browser session. Its network policy blocks outgoing connections, and reloading
the page resets it.

The local application stores your profile, listings, and application record in
`data/app.db` on your computer and listens only on `127.0.0.1`. When you run a
search, your search terms and locations go to the sources you enabled. When you
request AI filtering or scoring, the relevant listing and profile information
goes directly to the provider you selected. Optional Gmail and Slack features
connect only when you configure and enable them. Preparing an application
packet does not submit it to an employer.

---

## ⚙️ Extreme technicals below

### How the repository is organized

- **`client/`** — the React interface, including the deterministic showroom
  adapter.
- **`server/`** — the Express/tRPC service, source adapters, filtering, scoring,
  application workflow, and optional integrations.
- **`shared/`** — types and platform definitions shared by the client and
  server.
- **`drizzle/`** — the SQLite schema and migrations.
- **`docs/CONCIERGE_PROMPT.md`** — the tested prompt for an in-browser AI agent.
- **`docs/internal/`** — the roadmap, task ledger, architectural decisions, and
  semantic-hook reference.

### Contributing and maintenance

Open an issue before sending a code pull request so the proposed change can be
checked against the current architecture. Run `pnpm check` and `pnpm test`
before submitting. Bug reports are welcome; security reports should follow
[`SECURITY.md`](SECURITY.md). The full contribution process is in
[`CONTRIBUTING.md`](CONTRIBUTING.md).

### Credits

Job Matrix is directed and maintained by James with assistance from generative
AI development tools. It uses
[`python-jobspy`](https://github.com/speedyapply/JobSpy) for its optional
JobSpy-backed sources. JobSpy is a separate MIT-licensed project and is not
owned by Job Matrix or its contributors. Other dependency notices are in
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

### License

Job Matrix is available under the
[PolyForm Noncommercial License 1.0.0](LICENSE). Noncommercial use,
modification, and redistribution are permitted under that license; commercial
use is not.
