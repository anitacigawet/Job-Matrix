# GitHub Pages Static Snapshot — Plan

Purpose: give visitors of the GitHub repo a way to **see** Job Matrix in action without cloning, installing dependencies, or supplying an API key. The snapshot is a frozen, read-only demo of the dashboard with mock data. It is NOT a usable copy of the app.

## Approach

Job Matrix's frontend is a Vite single-page app talking to a tRPC backend. For the static snapshot we **replace the live tRPC client with a mock client that resolves every query against a fixture JSON file**, then build the SPA as static HTML+JS+CSS and publish to GitHub Pages.

This means everything in `client/` ships as-is. The only swap is `client/src/lib/trpc.ts` (in snapshot mode) and a new `client/src/snapshot/fixture.ts` that holds the demo data.

## Files to add

```
client/src/snapshot/
  fixture.ts         # All mock data (jobs, profile, settings, scans)
  trpcMockClient.ts  # Implements the tRPC client interface against fixture
  README.md          # How to regenerate the fixture
.github/workflows/
  gh-pages.yml       # Build + deploy on push to main
```

## Build flag

Add a Vite env flag — `VITE_SNAPSHOT_MODE=true` — read in `main.tsx`:

```ts
const trpcClient = import.meta.env.VITE_SNAPSHOT_MODE
  ? createSnapshotClient()      // serves fixture.ts data
  : createRealTrpcClient();     // current behavior
```

When the flag is on:
- Settings page is read-only (no mutations execute, just toast "demo mode").
- Scan/filter buttons show a banner "This is a static snapshot — clone the repo to use the real app".
- The header shows a permanent "Demo data" badge.

## Mock data shape

Use a "demo profile" — a fictional senior frontend engineer in Austin, TX, looking for remote roles. Generate ~30 fake job listings spanning all 5 platforms with varied fit scores (50–95%), a few in each pipeline state (eligible, applied, interview, offer), and a 30-day scan history graph. Keep it realistic enough that the analytics charts look populated.

The fixture file should be deterministic — no `Math.random()` at runtime — so the snapshot looks identical every visit.

## CI workflow

```yaml
# .github/workflows/gh-pages.yml
name: Deploy snapshot to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: VITE_SNAPSHOT_MODE=true pnpm vite build --base=/<REPO_NAME>/ --outDir dist-snapshot
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist-snapshot }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

The `--base=/<REPO_NAME>/` flag is required because GitHub Pages serves project sites under a subpath.

## One-time GitHub setup

After pushing to the public repo:
1. Repo → Settings → Pages → Source: **GitHub Actions** (not the legacy "deploy from branch" option).
2. The workflow above runs automatically; the URL appears as `https://<owner>.github.io/<REPO_NAME>/`.
3. Add that URL as the repo's homepage (Settings → General → Website).

This step needs the user's authenticated GitHub session. Two options to wire it up:
- **User does it** — easiest. Two clicks in the Pages settings.
- **Claude does it via Chrome MCP** — Claude controls the browser while the user is logged in. Useful if the user wants the README link added at the same time.

## Out of scope for Phase 8

- Real backend functionality. Anyone wanting to actually run the app clones the repo.
- Hiding the snapshot mode in the production app. The flag is build-time, so the published `pnpm build` (no flag) is unaffected.
- Live data refresh. The snapshot is intentionally frozen; updates require a new commit + workflow run.

## Open questions for the user when we get here

1. What should the "demo profile" actually be? (default suggestion above is a placeholder.)
2. Should the snapshot be deployed from `main`, from a `release` branch, or from a tag like `v0.1.0-beta`?
3. Should the README's "Live demo" link point to the Pages URL, or wait until later?
