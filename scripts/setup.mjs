#!/usr/bin/env node
/**
 * scripts/setup.mjs
 *
 * One-command setup for Job Matrix.
 *
 *   pnpm run setup
 *
 * Installs the exact Node dependency graph from pnpm-lock.yaml. Python is
 * intentionally deferred until the first optional JobSpy search: the runtime
 * validates Python 3.10+, creates data/python/jobspy-venv, and installs the
 * exact python-jobspy version pinned in requirements.txt. The rest of Job
 * Matrix does not require Python.
 */
import { spawnSync } from "node:child_process";

const log = msg => console.log(`[setup] ${msg}`);
const fail = msg => {
  console.error(`[setup] ERROR: ${msg}`);
  process.exit(1);
};

const run = (cmd, opts = {}) => {
  log(`$ ${cmd}`);
  const result = spawnSync(cmd, { stdio: "inherit", shell: true, ...opts });
  return result.status === 0;
};

log("Installing Node dependencies from pnpm-lock.yaml...");
if (!run("pnpm install --frozen-lockfile")) {
  fail(
    "pnpm install failed. Make sure pnpm is installed globally " +
      "(https://pnpm.io/installation), then try again."
  );
}

console.log("");
log("Setup complete.");
log(
  'Next: run "pnpm run dev" to start the dev server (defaults to http://localhost:3000).'
);
log("");
log("Python: optional JobSpy searches validate Python 3.10+ and create");
log("data/python/jobspy-venv on first use from the pinned requirements.txt.");
