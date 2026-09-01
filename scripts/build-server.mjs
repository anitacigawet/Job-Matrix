#!/usr/bin/env node

import { builtinModules } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(projectRoot, "dist");

await mkdir(distRoot, { recursive: true });

const result = await build({
  entryPoints: [path.join(projectRoot, "server", "_core", "index.ts")],
  outfile: path.join(distRoot, "index.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  metafile: true,
  sourcemap: false,
  legalComments: "eof",
  external: [
    // Development-only and never loaded by the production entry path.
    "vite",
    // Kept as a tiny external package because it loads sql-wasm.wasm beside
    // its JavaScript entry point at runtime.
    "sql.js",
  ],
  banner: {
    js: 'import { createRequire as __jobMatrixCreateRequire } from "node:module"; const require = __jobMatrixCreateRequire(import.meta.url);',
  },
});

const builtins = new Set(
  builtinModules.flatMap(name => [name, name.replace(/^node:/, "")])
);
const optionalRuntimeImports = new Set([
  // Optional accelerators/debug helpers. Their upstream packages explicitly
  // fall back when these modules are absent.
  "bufferutil",
  "supports-color",
  "utf-8-validate",
  // Development-only branch retained for source-tree `pnpm dev`.
  "vite",
  // Deliberately packaged as the sole runtime dependency.
  "sql.js",
]);

for (const [outputPath, output] of Object.entries(result.metafile.outputs)) {
  for (const imported of output.imports) {
    if (!imported.external) continue;
    const normalized = imported.path.replace(/^node:/, "");
    if (!builtins.has(normalized) && !optionalRuntimeImports.has(imported.path)) {
      throw new Error(
        `Unexpected external import in ${outputPath}: ${imported.path}`
      );
    }
  }
}

await writeFile(
  path.join(distRoot, "server-meta.json"),
  `${JSON.stringify(result.metafile, null, 2)}\n`,
  "utf8"
);

console.log("[build] Bundled production server; sql.js is the only required external package.");
