# Security Policy

Job Matrix supports two deliberately separate environments:

- The hosted service uses invite-only accounts, Cloudflare Access identity,
  tenant-scoped records, encrypted per-account provider keys, and centrally
  enforced search allowances.
- The source-available local build binds to `127.0.0.1` and keeps its data on
  the person’s own computer.

The hosted service runs on dedicated infrastructure for ScootSolute projects.
It does not share a server, tunnel, credentials, or data with the Personal
Dashboard or any unrelated private system.

Searches contact the selected job sites, and optional AI features contact the
provider whose key the account holder supplies. Job Matrix does not provide a
shared AI key to hosted accounts.

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue.

- Preferred: use GitHub private vulnerability reporting from this repository’s
  **Security** tab.
- Alternatively, contact the maintainer through their GitHub profile.

Please include the affected version, the environment (hosted or local), and
clear reproduction steps. Reports are reviewed as soon as practical.

## Useful reports

Examples include:

- Access to another account’s jobs, résumé details, application history, or
  provider settings.
- A way to bypass account approval, daily search allowances, the whole-site
  search ceiling, or the owner’s stop control.
- A route that lets one account consume unbounded shared compute, storage,
  subprocess, or outbound network capacity.
- Disclosure or unintended continued use of a saved API key.
- Script execution from a job listing or API response, including a DOMPurify
  bypass.
- Path traversal, arbitrary file access, command injection, or an origin that
  can be reached without its intended Cloudflare Access policy.

For the local build, behavior that requires the person to already control their
own machine is generally outside the threat model. The documented requests to
job sites and user-selected AI providers are also expected behavior.
