#!/usr/bin/env node
/**
 * scripts/setup.mjs
 *
 * One-command setup for Job Matrix.
 *
 *   pnpm run setup
 *
 * Currently does just one thing: install Node dependencies if missing.
 * Python setup is deliberately omitted — it used to create a per-project
 * `./venv` and `pip install -r requirements.txt`, but that path went stale:
 *
 *   - D-012 (2026-05-16) moved Python venv management into the runtime
 *     (`server/python_manager.ts`), which uses a shared per-user venv at
 *     `~/.job-matrix/venv_jobspy_shared/` and does per-package import
 *     checks on demand — installing only what's actually missing.
 *   - The old `./venv` path was unused at runtime, so first-time setup
 *     was building a venv nobody loaded.
 *   - And it broke on machines where `py -3` resolved to a Python version
 *     too new for prebuilt numpy wheels (Python 3.15 hit this in 2026-05).
 *
 * So: Node deps here, Python deps on first scraper / briefing use. The
 * runtime self-heals.
 *
 * Idempotent: re-running on an already-set-up tree is a no-op.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const log = (msg) => console.log(`[setup] ${msg}`);
const fail = (msg) => {
  console.error(`[setup] ERROR: ${msg}`);
  process.exit(1);
};

const run = (cmd, opts = {}) => {
  log(`$ ${cmd}`);
  const result = spawnSync(cmd, { stdio: "inherit", shell: true, ...opts });
  return result.status === 0;
};

// ── 1. Node dependencies ───────────────────────────────────────────
if (!existsSync("node_modules")) {
  log("Installing Node dependencies (pnpm install)...");
  if (!run("pnpm install")) {
    fail(
      "pnpm install failed. Make sure pnpm is installed globally " +
        "(https://pnpm.io/installation), then try again.",
    );
  }
} else {
  log("Node dependencies already installed (node_modules/ present).");
}

console.log("");
log("Setup complete.");
log('Next: run "pnpm run dev" to start the dev server (defaults to http://localhost:3000).');
log("");
log("Python: nothing to do here. The first time you run a scraper or generate");
log("a briefing, server/python_manager.ts creates / self-heals the shared venv");
log("at ~/.job-matrix/venv_jobspy_shared/ and pip-installs only what's missing.");
log("");
log("NotebookLM: optional one-time auth, only needed if you plan to use");
log("briefing features. The Settings page has a 'Sign in to NotebookLM' button");
log("that spawns the login flow — no manual venv activation needed.");
