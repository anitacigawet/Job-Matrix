#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(projectRoot, "dist");
const transformedModules = new Set();

const entryCss = await readFile(
  path.join(projectRoot, "client", "src", "index.css"),
  "utf8"
);
for (const match of entryCss.matchAll(/@import\s+["']([^"']+)["']/g)) {
  const specifier = match[1];
  if (specifier.startsWith(".") || specifier.startsWith("/")) continue;
  const packageManifest = path.join(
    projectRoot,
    "node_modules",
    ...specifier.split("/"),
    "package.json"
  );
  await readFile(packageManifest, "utf8");
  transformedModules.add(packageManifest);
}

await build({
  configFile: path.join(projectRoot, "vite.config.ts"),
  plugins: [
    {
      name: "job-matrix-release-module-inventory",
      apply: "build",
      transform(_code, id) {
        transformedModules.add(id.split("?", 1)[0]);
        return null;
      },
    },
  ],
});

await mkdir(distRoot, { recursive: true });
await writeFile(
  path.join(distRoot, "client-meta.json"),
  `${JSON.stringify(
    { inputs: [...transformedModules].sort((left, right) => left.localeCompare(right, "en")) },
    null,
    2
  )}\n`,
  "utf8"
);

console.log(`[build] Recorded ${transformedModules.size} client bundle input modules.`);
