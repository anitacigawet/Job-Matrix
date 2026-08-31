#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

const positional = process.argv.slice(2).filter(argument => !argument.startsWith("--"));
const structuralOnly = process.argv.includes("--structural-only");
if (positional.length !== 1) {
  console.error("Usage: node scripts/smoke-release.mjs <extracted-release-folder> [--structural-only]");
  process.exit(2);
}
const releaseRoot = path.resolve(positional[0]);

async function pathExists(candidate) {
  try {
    await stat(candidate);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function collectFiles(root) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symbolic link in release: ${absolute}`);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  await visit(root);
  return files.sort();
}

async function sha256File(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

const required = [
  "README.txt",
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  ".env.example",
  "Start Job Matrix.cmd",
  "start.mjs",
  "start.sh",
  "package.json",
  "BUILD-INFO.json",
  "MANIFEST.sha256",
  "dist/index.js",
  "dist/public/index.html",
  "dist/job_scraper.py",
  "requirements.txt",
  "drizzle/migrations/0000_init.sql",
  "docs/CONCIERGE_PROMPT.md",
  "docs/images/job-matrix-banner.png",
  "docs/screenshots/dashboard.png",
  "node_modules/sql.js/dist/sql-wasm.wasm",
  "licenses/THIRD_PARTY_PACKAGES.json",
];
for (const relative of required) {
  if (!(await pathExists(path.join(releaseRoot, ...relative.split("/"))))) {
    throw new Error(`Required release file is missing: ${relative}`);
  }
}
for (const forbidden of ["client", "server", "shared", "scripts", ".github", "pnpm-lock.yaml", "tsconfig.json", "vite.config.ts"]) {
  if (await pathExists(path.join(releaseRoot, forbidden))) {
    throw new Error(`Development/source path must not be in a release: ${forbidden}`);
  }
}
for (const packageManagerPath of [".bin", ".pnpm", ".modules.yaml", ".pnpm-workspace-state.json"]) {
  if (await pathExists(path.join(releaseRoot, "node_modules", packageManagerPath))) {
    throw new Error(`Package-manager installation metadata entered the release: ${packageManagerPath}`);
  }
}

const sqlJsRuntimeFiles = new Set([
  "AUTHORS",
  "LICENSE",
  "package.json",
  "dist/sql-wasm.js",
  "dist/sql-wasm.wasm",
]);
const runtimeDependencyFiles = (await collectFiles(path.join(releaseRoot, "node_modules"))).map(file =>
  path.relative(path.join(releaseRoot, "node_modules"), file).split(path.sep).join("/")
);
for (const relative of runtimeDependencyFiles) {
  if (!relative.startsWith("sql.js/") || !sqlJsRuntimeFiles.has(relative.slice("sql.js/".length))) {
    throw new Error(`Unexpected dependency payload file: node_modules/${relative}`);
  }
}
if (runtimeDependencyFiles.length !== sqlJsRuntimeFiles.size) {
  throw new Error(
    `Expected ${sqlJsRuntimeFiles.size} minimal sql.js files, found ${runtimeDependencyFiles.length}.`
  );
}

const manifestText = await readFile(path.join(releaseRoot, "MANIFEST.sha256"), "utf8");
const manifestPaths = new Set();
for (const line of manifestText.trim().split(/\r?\n/)) {
  const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
  if (!match) throw new Error(`Invalid manifest line: ${line}`);
  if (manifestPaths.has(match[2])) throw new Error(`Duplicate manifest path: ${match[2]}`);
  manifestPaths.add(match[2]);
  const file = path.join(releaseRoot, ...match[2].split("/"));
  if (!(await pathExists(file))) throw new Error(`Manifest path is missing: ${match[2]}`);
  const actual = await sha256File(file);
  if (actual !== match[1]) throw new Error(`Checksum mismatch: ${match[2]}`);
}

const payloadPaths = (await collectFiles(releaseRoot))
  .map(file => path.relative(releaseRoot, file).split(path.sep).join("/"))
  .filter(relative => relative !== "MANIFEST.sha256");
for (const relative of payloadPaths) {
  if (!manifestPaths.has(relative)) throw new Error(`Payload file is not checksummed: ${relative}`);
}
if (payloadPaths.length !== manifestPaths.size) {
  throw new Error(
    `Manifest has ${manifestPaths.size} entries for ${payloadPaths.length} payload files.`
  );
}
if (payloadPaths.length >= 1000) {
  throw new Error(`Release payload unexpectedly contains ${payloadPaths.length} files.`);
}
for (const relative of payloadPaths) {
  if (/\.(?:d\.(?:ts|cts|mts)|map)$/i.test(relative)) {
    throw new Error(`Development-only type declaration or source map entered release: ${relative}`);
  }
  if (
    relative.startsWith("node_modules/") &&
    /(?:^|\/)(?:src|test|tests|skills|\.github)(?:\/|$)/i.test(relative)
  ) {
    throw new Error(`Dependency source/test path entered release: ${relative}`);
  }
}

const thirdPartyPackages = JSON.parse(
  await readFile(path.join(releaseRoot, "licenses", "THIRD_PARTY_PACKAGES.json"), "utf8")
);
if (!Array.isArray(thirdPartyPackages) || thirdPartyPackages.length < 2) {
  throw new Error("Third-party package license manifest is missing or incomplete.");
}
const licensedPackages = new Set();
for (const dependency of thirdPartyPackages) {
  const key = `${dependency.name}@${dependency.version}`;
  if (licensedPackages.has(key)) throw new Error(`Duplicate third-party license record: ${key}`);
  licensedPackages.add(key);
  if (!dependency.license || !Array.isArray(dependency.includedLicenseFiles)) {
    throw new Error(`Incomplete third-party license metadata: ${key}`);
  }
  const safeName = dependency.name.replaceAll("/", "__");
  for (const licenseFile of dependency.includedLicenseFiles) {
    const licensedPath = path.join(
      releaseRoot,
      "licenses",
      `${safeName}@${dependency.version}`,
      licenseFile
    );
    if (!(await pathExists(licensedPath))) {
      throw new Error(`Third-party license text is missing: ${key}/${licenseFile}`);
    }
  }
}

const nativeAddons = (await collectFiles(path.join(releaseRoot, "node_modules"))).filter(file =>
  file.endsWith(".node")
);
if (nativeAddons.length > 0) throw new Error(`Release contains native addons: ${nativeAddons.join(", ")}`);
if (await pathExists(path.join(releaseRoot, "runtime", "node.exe"))) {
  if (!(await pathExists(path.join(releaseRoot, "runtime", "LICENSE")))) {
    throw new Error("Portable Node runtime is missing runtime/LICENSE.");
  }
}
console.log(`[smoke] Structure and manifest verified: ${releaseRoot}`);

if (structuralOnly) process.exit(0);

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(error => (error ? reject(error) : resolve(port)));
    });
  });
}

const embeddedNode = path.join(releaseRoot, "runtime", process.platform === "win32" ? "node.exe" : "node");
const nodeExecutable = (await pathExists(embeddedNode)) ? embeddedNode : process.execPath;
const port = await getFreePort();
const smokeDataRoot = path.join(releaseRoot, "data");
await rm(smokeDataRoot, { recursive: true, force: true });

let stdout = "";
let stderr = "";
const child = spawn(nodeExecutable, [path.join(releaseRoot, "start.mjs")], {
  cwd: releaseRoot,
  env: {
    ...process.env,
    JOB_MATRIX_NO_BROWSER: "1",
    PORT: String(port),
    // These deliberately wrong inherited paths must be ignored by the portable
    // launcher, which keeps mutable data inside the extracted folder.
    DATABASE_PATH: path.join(releaseRoot, "outside-data-must-not-be-used.db"),
    SETTINGS_PATH: path.join(releaseRoot, "outside-settings-must-not-be-used.json"),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", chunk => {
  stdout += chunk.toString();
});
child.stderr.on("data", chunk => {
  stderr += chunk.toString();
});

try {
  let healthy = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (response.ok && (await response.json()).ok === true) {
        healthy = true;
        break;
      }
    } catch {
      // Still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!healthy) {
    throw new Error(`Release did not become healthy.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  }
  const page = await fetch(`http://127.0.0.1:${port}/`);
  const html = await page.text();
  if (!page.ok || !html.toLowerCase().includes("<!doctype html")) {
    throw new Error(`Release root returned ${page.status} or invalid HTML.`);
  }
  const databasePath = path.join(smokeDataRoot, "app.db");
  if (await pathExists(path.join(releaseRoot, "outside-data-must-not-be-used.db"))) {
    throw new Error("Portable launcher honored an external DATABASE_PATH override.");
  }
  if (await pathExists(path.join(releaseRoot, "outside-settings-must-not-be-used.json"))) {
    throw new Error("Portable launcher honored an external SETTINGS_PATH override.");
  }
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const migrationCount = Number(
      database.prepare("SELECT COUNT(*) AS count FROM __drizzle_migrations").get().count
    );
    const userCount = Number(database.prepare("SELECT COUNT(*) AS count FROM users").get().count);
    if (migrationCount < 1 || userCount < 1) {
      throw new Error(`Unexpected initialized database state: migrations=${migrationCount}, users=${userCount}`);
    }
  } finally {
    database.close();
  }
  console.log(`[smoke] Health, HTML, database migrations, and seed user verified on port ${port}.`);
} finally {
  if (child.exitCode === null) child.kill();
  await new Promise(resolve => setTimeout(resolve, 250));
  await rm(smokeDataRoot, { recursive: true, force: true });
}
