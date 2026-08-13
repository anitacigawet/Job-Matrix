# Security Policy

Job Matrix is **local-first and single-user**. Its local Express server binds to
`127.0.0.1`, records are stored in a local SQLite file, and provider access uses
your own API keys. There is no server we operate, shared database, hosted Job
Matrix account, or telemetry collector. Searches and optional AI/NotebookLM
features still contact the third-party services you enable, as documented in
the README.

That said, responsible disclosure is always appreciated.

## Reporting a vulnerability

Please report security issues **privately** — do not open a public GitHub issue.

- **Preferred:** use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) on this repository (the **Security** tab → **Report a vulnerability**).
- Alternatively, contact the maintainer through their GitHub profile.

Please include steps to reproduce and the affected version (`package.json`). You'll get an acknowledgement as soon as the report is reviewed.

## Scope

Things genuinely worth reporting:
- A way for a malicious job listing or API response to execute code or script in the app (the app sanitizes job-description HTML via DOMPurify — a bypass would qualify).
- A path-traversal or file-write issue in the local server or the Python subprocess handling.
- Leakage of API keys or local data beyond the explicitly enabled provider
  requests described in the README.

Out of scope: anything that requires an attacker to already have local access to the user's machine (the threat model assumes the single local user is trusted), and the documented behavior that the JobSpy scrapers contact third-party job sites on the user's behalf.
