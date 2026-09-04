# Start here

This is the handoff entry point for an AI or maintainer working on Job Matrix.
The repository itself is the source of truth. Verify current behavior from the
code and Git state instead of relying on old chats, screenshots, or deployments.

## Read first

1. [`README.md`](README.md) — purpose, Windows installation, repository map,
   source-build instructions, and license summary.
2. [`SECURITY.md`](SECURITY.md) — local security boundary, outbound
   connections, private data, and vulnerability reporting.
3. [`package.json`](package.json) and [`pnpm-lock.yaml`](pnpm-lock.yaml) —
   supported runtime versions, dependencies, and canonical commands.
4. [`CHANGELOG.md`](CHANGELOG.md) — released behavior.
5. [`docs/CONCIERGE_PROMPT.md`](docs/CONCIERGE_PROMPT.md) — only when changing
   browser-agent workflows; it is an end-user prompt, not a maintenance guide.

## Product boundary

Job Matrix is a Windows-only, single-user local application. It has no Job
Matrix account or hosted application backend. The server must remain bound to
`127.0.0.1`; its database and settings remain under `data/`.

The public showroom is a separate browser-only build of the real interface
using deterministic fictional data. It must not contact job sources, AI
providers, Gmail, Slack, upload services, or a hosted Job Matrix backend. At
this handoff, the showroom deployment is under maintenance; verify its live
state before changing or publishing it.

`v1.0.0` is the released baseline. Do not create or move tags, publish a
release, deploy the showroom, restore a hosted service, add macOS or Linux
release artifacts, or rewrite Git history without explicit operator direction.

## Work from source

Use Node.js 22.22.0 or newer and pnpm 10.4.1:

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm start
```

Use `pnpm dev` for development. Run `pnpm check`, `pnpm test`, and
`pnpm build` before handing back code changes.

## Code map

- `client/` — React interface.
- `client/src/showroom/` — deterministic browser-side adapter and fixtures.
- `server/` — Express/tRPC service, job sources, filtering, scoring, and
  application workflows.
- `shared/` — definitions shared by the client and server.
- `drizzle/` — SQLite schema and ordered migrations.
- `scripts/` and `packaging/` — build, launch, screenshot QA, and Windows
  release assembly.
- `.github/workflows/` — source verification and Windows release automation.

## Guardrails

Never commit or publish `.env`, `data/`, databases, settings, resumes,
application exports, `dist/`, or dependency directories. Local ignored files
may contain user state; do not inspect, replace, or delete them unless
specifically asked.

Preserve the loopback and same-origin request protections, deterministic
showroom isolation, released migrations, and the rule that an AI-assisted
application stops before final employer submission. Preserve unrelated work,
review the complete diff, and confirm the branch and remote state before
reporting completion.
