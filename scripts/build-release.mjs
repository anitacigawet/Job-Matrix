#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
const runtimePackageJson = JSON.parse(
  await readFile(path.join(projectRoot, "packaging", "runtime", "package.json"), "utf8")
);
const version = packageJson.version;
const minimumNodeVersion = "22.22.0";
const bundledNodeVersion = "24.20.0";
const distRoot = path.join(projectRoot, "dist");
const stagingRoot = path.join(distRoot, "release-staging");
const releasesRoot = path.join(distRoot, "releases");
const runtimeDependencyRoot = path.join(projectRoot, "packaging", "runtime");

if (version !== "1.0.0" || runtimePackageJson.version !== version) {
  throw new Error("Root and runtime package versions must both be 1.0.0.");
}

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === "--") continue;
  if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
  const [rawName, inlineValue] = argument.slice(2).split("=", 2);
  const value = inlineValue ?? process.argv[++index];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for --${rawName}`);
  args.set(rawName, value);
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${commandArgs.join(" ")} failed with exit code ${result.status}.` +
        (result.stderr ? `\n${result.stderr}` : "")
    );
  }
  return result.stdout?.trim() ?? "";
}

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
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Release tree contains a symbolic link: ${path.relative(root, absolute)}`);
      }
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  await visit(root);
  return files;
}

async function sha256File(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, value) => {
  let result = value;
  for (let bit = 0; bit < 8; bit += 1) {
    result = (result & 1) !== 0 ? 0xedb88320 ^ (result >>> 1) : result >>> 1;
  }
  return result >>> 0;
});

async function writeDeterministicZip(sourceRoot, archivePath) {
  const sourceFolderName = path.basename(sourceRoot);
  const files = await collectFiles(sourceRoot);
  const handle = await open(archivePath, "w");
  const centralRecords = [];
  let offset = 0;
  const dosTime = 0;
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;

  try {
    for (const file of files) {
      const relative = path.relative(sourceRoot, file).split(path.sep).join("/");
      const entryName = `${sourceFolderName}/${relative}`;
      const name = Buffer.from(entryName, "utf8");
      const raw = await readFile(file);
      const compressed = deflateRawSync(raw, { level: 9 });
      const checksum = crc32(raw);
      if (raw.length > 0xffffffff || compressed.length > 0xffffffff || offset > 0xffffffff) {
        throw new Error("Release exceeds ZIP32 limits.");
      }

      const localHeader = Buffer.alloc(30);
      localHeader.writeUInt32LE(0x04034b50, 0);
      localHeader.writeUInt16LE(20, 4);
      localHeader.writeUInt16LE(0x0800, 6);
      localHeader.writeUInt16LE(8, 8);
      localHeader.writeUInt16LE(dosTime, 10);
      localHeader.writeUInt16LE(dosDate, 12);
      localHeader.writeUInt32LE(checksum, 14);
      localHeader.writeUInt32LE(compressed.length, 18);
      localHeader.writeUInt32LE(raw.length, 22);
      localHeader.writeUInt16LE(name.length, 26);
      localHeader.writeUInt16LE(0, 28);

      await handle.write(localHeader, 0, localHeader.length, offset);
      await handle.write(name, 0, name.length, offset + localHeader.length);
      await handle.write(
        compressed,
        0,
        compressed.length,
        offset + localHeader.length + name.length
      );

      const executable = relative === "start.sh";
      centralRecords.push({
        name,
        checksum,
        compressedSize: compressed.length,
        rawSize: raw.length,
        localOffset: offset,
        unixMode: executable ? 0o100755 : 0o100644,
      });
      offset += localHeader.length + name.length + compressed.length;
    }

    const centralStart = offset;
    for (const record of centralRecords) {
      const header = Buffer.alloc(46);
      header.writeUInt32LE(0x02014b50, 0);
      header.writeUInt16LE(0x0314, 4);
      header.writeUInt16LE(20, 6);
      header.writeUInt16LE(0x0800, 8);
      header.writeUInt16LE(8, 10);
      header.writeUInt16LE(dosTime, 12);
      header.writeUInt16LE(dosDate, 14);
      header.writeUInt32LE(record.checksum, 16);
      header.writeUInt32LE(record.compressedSize, 20);
      header.writeUInt32LE(record.rawSize, 24);
      header.writeUInt16LE(record.name.length, 28);
      header.writeUInt16LE(0, 30);
      header.writeUInt16LE(0, 32);
      header.writeUInt16LE(0, 34);
      header.writeUInt16LE(0, 36);
      header.writeUInt32LE((record.unixMode << 16) >>> 0, 38);
      header.writeUInt32LE(record.localOffset, 42);
      await handle.write(header, 0, header.length, offset);
      await handle.write(record.name, 0, record.name.length, offset + header.length);
      offset += header.length + record.name.length;
    }

    const centralSize = offset - centralStart;
    if (centralRecords.length > 0xffff || centralStart > 0xffffffff || centralSize > 0xffffffff) {
      throw new Error("Release exceeds ZIP32 directory limits.");
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(centralRecords.length, 8);
    end.writeUInt16LE(centralRecords.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(centralStart, 16);
    end.writeUInt16LE(0, 20);
    await handle.write(end, 0, end.length, offset);
  } finally {
    await handle.close();
  }
}

function resolveNodeDirectory(value) {
  const absolute = path.resolve(projectRoot, value);
  return path.basename(absolute).toLowerCase() === "node.exe" ? path.dirname(absolute) : absolute;
}

async function verifyWindowsNode(nodeDirectory, architecture) {
  const executable = path.join(nodeDirectory, "node.exe");
  const license = path.join(nodeDirectory, "LICENSE");
  if (!(await pathExists(executable)) || !(await pathExists(license))) {
    throw new Error(`${nodeDirectory} must contain node.exe and LICENSE.`);
  }
  const data = await readFile(executable);
  if (data.readUInt16LE(0) !== 0x5a4d) throw new Error(`${executable} is not a PE executable.`);
  const peOffset = data.readUInt32LE(0x3c);
  if (data.readUInt32LE(peOffset) !== 0x00004550) throw new Error(`${executable} has no PE header.`);
  const machine = data.readUInt16LE(peOffset + 4);
  const expectedMachine = architecture === "x64" ? 0x8664 : 0xaa64;
  if (machine !== expectedMachine) {
    throw new Error(
      `${executable} is PE machine 0x${machine.toString(16)}, expected ${architecture}.`
    );
  }
  const probe = spawnSync(executable, ["--version"], { encoding: "utf8" });
  if (probe.status === 0 && probe.stdout.trim() !== `v${bundledNodeVersion}`) {
    throw new Error(`Expected Node v${bundledNodeVersion}, got ${probe.stdout.trim()}.`);
  }
  if (probe.status === 0) {
    console.log(`[release] Executed and verified ${architecture} Node ${probe.stdout.trim()}.`);
  } else {
    console.log(`[release] PE architecture verified for ${architecture}; executable probe unavailable on this host.`);
  }
  return { executable, license };
}

async function prepareRuntimeDependencies() {
  const dependencyTree = path.join(runtimeDependencyRoot, "node_modules");
  // A clean install prevents packages removed from the frozen runtime manifest
  // from surviving in the portable payload through a stale node_modules tree.
  await rm(dependencyTree, { recursive: true, force: true });
  const installArgs = [
    "--dir",
    runtimeDependencyRoot,
    "install",
    "--prod",
    "--frozen-lockfile",
    "--ignore-scripts",
    "--config.node-linker=hoisted",
    "--config.package-import-method=copy",
  ];
  const pnpmCandidates = [];
  if (process.env.PNPM_HOME) pnpmCandidates.push(path.join(process.env.PNPM_HOME, "pnpm.cjs"));
  if (process.env.APPDATA) {
    pnpmCandidates.push(
      path.join(process.env.APPDATA, "npm", "node_modules", "pnpm", "bin", "pnpm.cjs")
    );
  }
  if (process.platform === "win32") {
    const located = spawnSync("where.exe", ["pnpm.cmd"], { encoding: "utf8" });
    if (located.status === 0) {
      for (const shim of located.stdout.split(/\r?\n/).filter(Boolean)) {
        pnpmCandidates.push(
          path.join(path.dirname(shim), "node_modules", "pnpm", "bin", "pnpm.cjs")
        );
      }
    }
  }
  let pnpmCli = null;
  for (const candidate of pnpmCandidates) {
    if (await pathExists(candidate)) {
      pnpmCli = candidate;
      break;
    }
  }
  if (pnpmCli) {
    run(process.execPath, [pnpmCli, ...installArgs]);
  } else {
    const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    run(pnpmCommand, installArgs, { shell: process.platform === "win32" });
  }
  if (!(await pathExists(dependencyTree))) throw new Error("Runtime dependencies were not installed.");
  const sqlJsRoot = path.join(dependencyTree, "sql.js");
  for (const relative of [
    "package.json",
    "LICENSE",
    "AUTHORS",
    "dist/sql-wasm.js",
    "dist/sql-wasm.wasm",
  ]) {
    if (!(await pathExists(path.join(sqlJsRoot, ...relative.split("/"))))) {
      throw new Error(`Frozen sql.js install is missing ${relative}.`);
    }
  }
  const installedPackage = JSON.parse(
    await readFile(path.join(sqlJsRoot, "package.json"), "utf8")
  );
  if (installedPackage.version !== runtimePackageJson.dependencies["sql.js"]) {
    throw new Error(
      `Expected sql.js ${runtimePackageJson.dependencies["sql.js"]}, got ${installedPackage.version}.`
    );
  }
  return sqlJsRoot;
}

async function copyRequired(source, target) {
  if (!(await pathExists(source))) throw new Error(`Required release input is missing: ${source}`);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { recursive: true, dereference: true });
}

function packageRootFromMetafileInput(inputPath) {
  if (inputPath.includes("\0")) return null;
  const normalized = inputPath.replaceAll("\\", "/");
  const marker = "node_modules/";
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex < 0) return null;
  const packageStart = markerIndex + marker.length;
  const segments = normalized.slice(packageStart).split("/");
  const packageSegmentCount = segments[0].startsWith("@") ? 2 : 1;
  const relativeRoot =
    normalized.slice(0, packageStart) +
    segments.slice(0, packageSegmentCount).join("/");
  const absoluteRoot = /^[a-zA-Z]:\//.test(relativeRoot)
    ? path.resolve(relativeRoot)
    : path.resolve(projectRoot, ...relativeRoot.split("/"));
  const relativeToProject = path.relative(projectRoot, absoluteRoot);
  if (
    relativeToProject.startsWith("..") ||
    path.isAbsolute(relativeToProject) ||
    !relativeToProject.split(path.sep).includes("node_modules")
  ) {
    throw new Error(`Invalid package root in esbuild metadata: ${inputPath}`);
  }
  return absoluteRoot;
}

async function collectBundledPackages(sqlJsRoot) {
  const metaPath = path.join(distRoot, "server-meta.json");
  if (!(await pathExists(metaPath))) {
    throw new Error("dist/server-meta.json is missing. Run pnpm build first.");
  }
  const metafile = JSON.parse(await readFile(metaPath, "utf8"));
  const clientMetaPath = path.join(distRoot, "client-meta.json");
  if (!(await pathExists(clientMetaPath))) {
    throw new Error("dist/client-meta.json is missing. Run pnpm build first.");
  }
  const clientMetafile = JSON.parse(await readFile(clientMetaPath, "utf8"));
  const packageRoots = new Set([sqlJsRoot]);
  const embeddedInputs = [
    ...Object.keys(metafile.inputs ?? {}),
    ...(clientMetafile.inputs ?? []),
  ];
  for (const inputPath of embeddedInputs) {
    const packageRoot = packageRootFromMetafileInput(inputPath);
    if (packageRoot) packageRoots.add(packageRoot);
  }

  const packages = new Map();
  for (const packageRoot of [...packageRoots].sort()) {
    const manifestPath = path.join(packageRoot, "package.json");
    if (!(await pathExists(manifestPath))) {
      throw new Error(`Bundled package has no package.json: ${packageRoot}`);
    }
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const key = `${manifest.name}@${manifest.version}`;
    const entries = await readdir(packageRoot, { withFileTypes: true });
    const licenseFiles = entries
      .filter(
        entry =>
          entry.isFile() && /^(licen[cs]e|copying|notice)(\.|$)/i.test(entry.name)
      )
      .map(entry => entry.name)
      .sort((left, right) => left.localeCompare(right, "en"));
    const readme = entries
      .filter(entry => entry.isFile() && /^readme(?:\.|$)/i.test(entry.name))
      .map(entry => entry.name)
      .sort((left, right) => left.localeCompare(right, "en"))[0];
    if (!packages.has(key)) {
      packages.set(key, { key, packageRoot, manifest, licenseFiles, readme });
    }
  }
  return [...packages.values()].sort((left, right) =>
    left.key.localeCompare(right.key, "en")
  );
}

async function writeBundledLicenses(releaseRoot, sqlJsRoot) {
  const packages = await collectBundledPackages(sqlJsRoot);
  const licensesRoot = path.join(releaseRoot, "licenses");
  await mkdir(licensesRoot, { recursive: true });

  const licenseFallbacks = new Map();
  for (const record of packages) {
    if (record.licenseFiles.length > 0 && record.manifest.license) {
      if (!licenseFallbacks.has(record.manifest.license)) {
        licenseFallbacks.set(record.manifest.license, record);
      }
    }
  }

  const manifestEntries = [];
  for (const record of packages) {
    const safeName = record.manifest.name.replaceAll("/", "__");
    const packageLicenseRoot = path.join(
      licensesRoot,
      `${safeName}@${record.manifest.version}`
    );
    await mkdir(packageLicenseRoot, { recursive: true });
    const includedLicenseFiles = [];

    for (const licenseFile of record.licenseFiles) {
      await copyRequired(
        path.join(record.packageRoot, licenseFile),
        path.join(packageLicenseRoot, licenseFile)
      );
      includedLicenseFiles.push(licenseFile);
    }

    if (includedLicenseFiles.length === 0 && record.readme) {
      const readmeText = await readFile(
        path.join(record.packageRoot, record.readme),
        "utf8"
      );
      const licenseHeading = /^(?:#{1,6}\s+licen[cs]e\b.*|licen[cs]e\s*\r?\n[-=]{3,})$/im.exec(
        readmeText
      );
      if (licenseHeading) {
        const outputName = "LICENSE-FROM-README.txt";
        await writeFile(
          path.join(packageLicenseRoot, outputName),
          `${readmeText.slice(licenseHeading.index).trim()}\n`,
          "utf8"
        );
        includedLicenseFiles.push(outputName);
      }
    }

    if (includedLicenseFiles.length === 0) {
      const repositoryUrl =
        typeof record.manifest.repository === "string"
          ? record.manifest.repository
          : record.manifest.repository?.url ?? "";
      const upstreamFallbacks = [
        {
          match: "github.com/radix-ui/primitives",
          source: path.join(
            projectRoot,
            "packaging",
            "licenses",
            "radix-ui-primitives-MIT.txt"
          ),
        },
        {
          match: "github.com/molefrog/wouter",
          source: path.join(
            projectRoot,
            "packaging",
            "licenses",
            "wouter-UNLICENSE.txt"
          ),
        },
      ];
      const fallback = upstreamFallbacks.find(candidate =>
        repositoryUrl.includes(candidate.match)
      );
      if (fallback) {
        const outputName = "LICENSE-UPSTREAM.txt";
        await copyRequired(
          fallback.source,
          path.join(packageLicenseRoot, outputName)
        );
        includedLicenseFiles.push(outputName);
      }
    }

    if (includedLicenseFiles.length === 0 && record.manifest.license === "Apache-2.0") {
      const fallback = licenseFallbacks.get("Apache-2.0");
      if (fallback) {
        const outputName = "LICENSE-SPDX-Apache-2.0.txt";
        await copyRequired(
          path.join(fallback.packageRoot, fallback.licenseFiles[0]),
          path.join(packageLicenseRoot, outputName)
        );
        includedLicenseFiles.push(outputName);
      }
    }

    if (includedLicenseFiles.length === 0) {
      throw new Error(
        `No distributable license text found for ${record.key} (${record.manifest.license ?? "undeclared"}).`
      );
    }

    const metadata = {
      name: record.manifest.name,
      version: record.manifest.version,
      license: record.manifest.license ?? null,
      author: record.manifest.author ?? null,
      homepage: record.manifest.homepage ?? null,
      repository: record.manifest.repository ?? null,
      includedLicenseFiles,
    };
    await writeFile(
      path.join(packageLicenseRoot, "PACKAGE.json"),
      `${JSON.stringify(metadata, null, 2)}\n`,
      "utf8"
    );
    manifestEntries.push(metadata);
  }

  await writeFile(
    path.join(licensesRoot, "THIRD_PARTY_PACKAGES.json"),
    `${JSON.stringify(manifestEntries, null, 2)}\n`,
    "utf8"
  );
  console.log(`[release] Included license records for ${packages.length} bundled packages.`);
}

async function copyMinimalSqlJs(sqlJsRoot, releaseRoot) {
  for (const relative of [
    "package.json",
    "LICENSE",
    "AUTHORS",
    "dist/sql-wasm.js",
    "dist/sql-wasm.wasm",
  ]) {
    await copyRequired(
      path.join(sqlJsRoot, ...relative.split("/")),
      path.join(releaseRoot, "node_modules", "sql.js", ...relative.split("/"))
    );
  }
}

async function gitBuildIdentity() {
  const revision = run("git", ["rev-parse", "HEAD"], { capture: true });
  const statusOutput = run("git", ["status", "--porcelain", "--untracked-files=all"], {
    capture: true,
  });
  return { revision, dirty: statusOutput.length > 0 };
}

async function assembleRelease(name, kind, sqlJsRoot, nodeRuntime = null) {
  const releaseRoot = path.join(stagingRoot, name);
  await mkdir(releaseRoot, { recursive: true });

  const copyMap = [
    [path.join(projectRoot, "packaging", "README.txt"), path.join(releaseRoot, "README.txt")],
    [path.join(projectRoot, "packaging", "Start Job Matrix.cmd"), path.join(releaseRoot, "Start Job Matrix.cmd")],
    [path.join(projectRoot, "packaging", "start.mjs"), path.join(releaseRoot, "start.mjs")],
    [path.join(projectRoot, "LICENSE"), path.join(releaseRoot, "LICENSE")],
    [path.join(projectRoot, "SECURITY.md"), path.join(releaseRoot, "SECURITY.md")],
    [path.join(projectRoot, "THIRD_PARTY_NOTICES.md"), path.join(releaseRoot, "THIRD_PARTY_NOTICES.md")],
    [path.join(projectRoot, ".env.example"), path.join(releaseRoot, ".env.example")],
    [path.join(projectRoot, "docs", "CONCIERGE_PROMPT.md"), path.join(releaseRoot, "docs", "CONCIERGE_PROMPT.md")],
    [path.join(distRoot, "index.js"), path.join(releaseRoot, "dist", "index.js")],
    [path.join(distRoot, "public"), path.join(releaseRoot, "dist", "public")],
    [path.join(distRoot, "job_scraper.py"), path.join(releaseRoot, "dist", "job_scraper.py")],
    [path.join(distRoot, "requirements.txt"), path.join(releaseRoot, "requirements.txt")],
    [path.join(distRoot, "drizzle", "migrations"), path.join(releaseRoot, "drizzle", "migrations")],
  ];
  for (const [source, target] of copyMap) await copyRequired(source, target);
  await copyMinimalSqlJs(sqlJsRoot, releaseRoot);
  await writeBundledLicenses(releaseRoot, sqlJsRoot);
  const releaseEnvPath = path.join(releaseRoot, ".env.example");
  const releaseEnvTemplate = (await readFile(releaseEnvPath, "utf8"))
    .replace(
      /^DATABASE_PATH=.*$/m,
      "# Portable releases always use ./data/app.db (not configurable)."
    )
    .replace(
      /^SETTINGS_PATH=.*$/m,
      "# Portable releases always use ./data/settings.json (not configurable)."
    );
  await writeFile(releaseEnvPath, releaseEnvTemplate, "utf8");

  const releasePackageJson = {
    name: "job-matrix",
    version,
    private: true,
    type: "module",
    license: packageJson.license,
    engines: { node: `>=${minimumNodeVersion}` },
    dependencies: runtimePackageJson.dependencies,
  };
  await writeFile(
    path.join(releaseRoot, "package.json"),
    `${JSON.stringify(releasePackageJson, null, 2)}\n`,
    "utf8"
  );

  let bundledNode = null;
  if (nodeRuntime) {
    await copyRequired(nodeRuntime.executable, path.join(releaseRoot, "runtime", "node.exe"));
    await copyRequired(
      nodeRuntime.license,
      path.join(releaseRoot, "runtime", "LICENSE")
    );
    bundledNode = {
      version: bundledNodeVersion,
      platform: "win32",
      architecture: kind.endsWith("x64") ? "x64" : "arm64",
    };
  }

  const identity = await gitBuildIdentity();
  await writeFile(
    path.join(releaseRoot, "BUILD-INFO.json"),
    `${JSON.stringify(
      {
        product: "Job Matrix",
        version,
        artifact: kind,
        minimumNodeVersion,
        bundledNode,
        sourceRevision: identity.revision,
        sourceTreeDirty: identity.dirty,
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const forbiddenTopLevel = ["client", "server", "shared", "scripts", ".github", "test", "tests"];
  for (const entry of forbiddenTopLevel) {
    if (await pathExists(path.join(releaseRoot, entry))) {
      throw new Error(`Forbidden source/development path entered the release: ${entry}`);
    }
  }
  const releaseFilesBeforeManifest = await collectFiles(releaseRoot);
  const nativeAddons = releaseFilesBeforeManifest.filter(file => file.endsWith(".node"));
  if (nativeAddons.length > 0) throw new Error(`Release contains native Node addons: ${nativeAddons}`);

  const manifestLines = [];
  for (const file of releaseFilesBeforeManifest) {
    const relative = path.relative(releaseRoot, file).split(path.sep).join("/");
    manifestLines.push(`${await sha256File(file)}  ${relative}`);
  }
  await writeFile(path.join(releaseRoot, "MANIFEST.sha256"), `${manifestLines.join("\n")}\n`, "utf8");

  const archivePath = path.join(releasesRoot, `${name}.zip`);
  await writeDeterministicZip(releaseRoot, archivePath);
  console.log(`[release] Created ${archivePath}`);
  return { archivePath, stagingPath: releaseRoot };
}

if (!(await pathExists(path.join(distRoot, "index.js")))) {
  throw new Error("dist/index.js is missing. Run pnpm build first.");
}
if (!(await pathExists(path.join(runtimeDependencyRoot, "pnpm-lock.yaml")))) {
  throw new Error("packaging/runtime/pnpm-lock.yaml is missing.");
}

await rm(stagingRoot, { recursive: true, force: true });
await rm(releasesRoot, { recursive: true, force: true });
await mkdir(stagingRoot, { recursive: true });
await mkdir(releasesRoot, { recursive: true });

const sqlJsRoot = await prepareRuntimeDependencies();
const assembled = [];
assembled.push(
  await assembleRelease(`Job-Matrix-v${version}-runtime`, "node-runtime", sqlJsRoot)
);

for (const architecture of ["x64", "arm64"]) {
  const suppliedPath = args.get(`node-${architecture}`);
  if (!suppliedPath) continue;
  const nodeDirectory = resolveNodeDirectory(suppliedPath);
  const nodeRuntime = await verifyWindowsNode(nodeDirectory, architecture);
  assembled.push(
    await assembleRelease(
      `Job-Matrix-v${version}-windows-${architecture}-portable`,
      `windows-${architecture}`,
      sqlJsRoot,
      nodeRuntime
    )
  );
}

const outerChecksums = [];
for (const item of assembled.sort((left, right) => left.archivePath.localeCompare(right.archivePath))) {
  outerChecksums.push(`${await sha256File(item.archivePath)}  ${path.basename(item.archivePath)}`);
}
await writeFile(path.join(releasesRoot, "SHA256SUMS.txt"), `${outerChecksums.join("\n")}\n`, "utf8");

console.log(`[release] ${assembled.length} artifact(s) assembled with deterministic ZIP metadata.`);
for (const item of assembled) console.log(`[release] Staging tree: ${item.stagingPath}`);
