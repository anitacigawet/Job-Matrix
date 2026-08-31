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

1. **Add preset filters that actually stick.** Target roles, locations,
   expected salary/pay, education, and experience. The parameters you pick are
   actually saved and not randomly erased after each search or on different
   platforms.
2. **Utilizes multifaceted sources.** Utilizes sources from Indeed, LinkedIn,
   Adzuna, USAJobs, Jooble, The Muse, Remotive, and RemoteOK.
3. **Attempts to remove duplicate listings.** The same job opening appearing on
   multiple sources is grouped instead of becoming more unnecessary visual
   harassment.
4. **Rules remove clear mismatches.** Optional AI filtering can evaluate the
   listing against your saved profile and flag scams, MLM language, education
   conflicts, experience conflicts, location restrictions, and pay problems.
5. **Ranks job searches based on personalization factors.** Job Matrix
   generates a fit score depending on the data you put into it to give you a
   good estimate/starting point for each job in terms of your potential
   readiness for said job.
6. **Long-term tracking.** Saves jobs to an application queue where you are able
   to track interviews, offers, keep a timeline, or export your records.

### Works with in-browser AI agents

Job Matrix labels its buttons, inputs, progress states, and empty states so a
browser agent can operate the same interface you use. There is no separate
AI-only page. An agent can help configure a search, review results, and prepare
a guided application packet. It must stop before the employer's final Submit
button so you can review and approve the application.

![The guided application dialog showing saved answers, a final-submit guardrail, and explicit review instructions](docs/screenshots/guided-application.png)

_Saved answers stay visible, missing answers remain questions, and final
submission stays under your control._

### Try it yourself

The [public Job Matrix showroom](https://jobmatrix.scootsolute.org/) uses the
project's actual interface with fictional data for the backend, allowing you to
explore its search, filtering, scoring, and other functionality without entering
any unnecessary data.

---

## Running it locally

### Windows portable release

1. Open the [latest Job Matrix release](https://github.com/anitacigawet/Job-Matrix/releases/latest).
2. Download the Windows x64 portable ZIP for most Intel or AMD computers, or
   the Windows ARM64 portable ZIP for an ARM-based computer.
3. Extract the entire ZIP to a folder you can keep.
4. Double-click **Start Job Matrix.cmd**.

The launcher includes Node.js, chooses an available local port, waits for Job
Matrix to start, and opens it in your browser. You do not need Git, pnpm, npm,
or a development setup. Keep the server window open while using the program.

### macOS, Linux, or an existing Node installation

Download the runtime ZIP from the latest release and extract it. It requires
Node.js 22.22.0 or newer. Run `sh start.sh` on macOS or Linux, or use
**Start Job Matrix.cmd** on Windows.

Job Matrix stores its database and settings in the extracted folder under
`data/`, so moving or backing up that folder keeps the local workspace together.
There is no login. API keys are optional and are needed only for the sources or
AI provider you choose.

Python 3.10 or newer is needed only for JobSpy-backed sources such as Indeed and
LinkedIn. The first JobSpy search creates its own environment under `data/` and
installs the pinned scraper dependency. The rest of Job Matrix does not need
Python.

---

## ⚙️ Extreme technicals below

### How the repository is organized

- **`client/`** — the React interface and deterministic showroom adapter.
- **`server/`** — the local Express/tRPC service, source adapters, filtering,
  scoring, application workflow, and optional integrations.
- **`shared/`** — definitions shared by the client and server.
- **`drizzle/`** — the SQLite schema and runtime migrations.
- **`scripts/` and `packaging/`** — repeatable build, launch, screenshot, and
  release-assembly tools.
- **`docs/CONCIERGE_PROMPT.md`** — a prompt for operating the interface with an
  in-browser AI agent.

### Build from source

Install Node.js 22.22.0 or newer and pnpm 10, then run:

```bash
git clone https://github.com/anitacigawet/Job-Matrix.git
cd Job-Matrix
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm start
```

Open the local address printed in the terminal. Development mode is available
with `pnpm dev`; release packages are assembled with `pnpm release:assemble`.

### Security

The local service binds to `127.0.0.1`. Read [`SECURITY.md`](SECURITY.md) before
publishing a configuration file, database, resume, or application export. Send
security reports through GitHub's private vulnerability reporting instead of a
public issue.

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
