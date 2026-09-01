#!/usr/bin/env node

import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(projectRoot, "dist");
const migrationsSource = path.join(projectRoot, "drizzle", "migrations");
const migrationsTarget = path.join(distRoot, "drizzle", "migrations");

await mkdir(distRoot, { recursive: true });
await cp(
  path.join(projectRoot, "server", "job_scraper.py"),
  path.join(distRoot, "job_scraper.py")
);
await cp(
  path.join(projectRoot, "requirements.txt"),
  path.join(distRoot, "requirements.txt")
);

await rm(migrationsTarget, { recursive: true, force: true });
await mkdir(migrationsTarget, { recursive: true });
const migrationFiles = (await readdir(migrationsSource))
  .filter(name => name.endsWith(".sql"))
  .sort();
for (const name of migrationFiles) {
  await cp(path.join(migrationsSource, name), path.join(migrationsTarget, name));
}

console.log(
  `[build] Copied job_scraper.py, requirements.txt, and ${migrationFiles.length} migration(s).`
);
