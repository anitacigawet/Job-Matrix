# Security

Job Matrix is a local application. It listens on `127.0.0.1`, stores its
database and saved settings on the computer running it, and has no Job Matrix
account or hosted application backend. The HTTP server accepts only its exact
loopback Host and port; browser API requests must also be same-origin JSON.

The public showroom is separate from the local application. It uses
deterministic fictional data in the browser and does not search job sites,
contact AI providers, upload files, or save personal information.

## What leaves your computer

Job Matrix makes outbound requests only for features you choose to use:

- Searches contact the selected job sources.
- JobSpy-backed searches use those sites' public web surfaces and can stop
  working when a site changes.
- Optional AI filtering sends the job listing and the relevant profile criteria
  to the AI provider you select.
- Resume auto-fill sends the supplied resume text to the selected AI provider.
  AI job-title suggestions send the desired job type to that provider.
- Saving a profile with skills entered sends that skills text to the selected
  AI provider to organize it, including when you fill in the profile manually.
- Optional response monitoring contacts Gmail or Slack only after you configure
  that connection.
- When local rules cannot classify a job-related email, response monitoring
  sends its subject, sender, and up to 6,000 characters of its body to the
  selected AI provider. Application status changes require your review and
  manual action.

Keys and connection tokens saved through Settings are written in plain text to
`data/settings.json`; Job Matrix does not encrypt that local file. Keep the
computer account and the `data/` directory private. Do not publish your `.env`
file, settings file, database, resume, or exported application records.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use
[GitHub private vulnerability reporting](https://github.com/anitacigawet/Job-Matrix/security/advisories/new)
and include the affected version, operating system, reproduction steps, and the
impact you observed.

Useful reports include command injection, path traversal, unintended file
access, disclosure of a saved API key, unsafe rendering of listing content, or
an external origin being able to reach the local service unexpectedly.

Only the latest release is supported with security fixes. Behavior that
requires someone to already control the local computer is generally outside the
project's threat model.
