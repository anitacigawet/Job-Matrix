#!/usr/bin/env node

import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const releaseRoot = path.dirname(fileURLToPath(import.meta.url));
const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 22)) {
  throw new Error(
    `Job Matrix requires Node.js 22.22.0 or newer; this is ${process.versions.node}. ` +
      "Install the current Node.js 24 LTS release from https://nodejs.org/."
  );
}
process.chdir(releaseRoot);
process.env.NODE_ENV = "production";
await import("dotenv/config");
// Portable releases keep all mutable state beside the extracted program,
// independent of the directory or shell from which the launcher was invoked.
process.env.DATABASE_PATH = path.join(releaseRoot, "data", "app.db");
process.env.SETTINGS_PATH = path.join(releaseRoot, "data", "settings.json");
process.env.JOB_MATRIX_VENV_DIR = path.join(releaseRoot, "data", "python", "jobspy-venv");

async function portIsAvailable(port) {
  return new Promise(resolve => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", () => resolve(false));
    probe.listen({ host: "127.0.0.1", port }, () => {
      probe.close(() => resolve(true));
    });
  });
}

async function choosePort() {
  if (process.env.PORT) return Number(process.env.PORT);
  for (let port = 3000; port <= 3050; port += 1) {
    if (await portIsAvailable(port)) return port;
  }
  throw new Error("No free local port was found between 3000 and 3050.");
}

function openBrowser(url) {
  if (process.env.JOB_MATRIX_NO_BROWSER === "1") return;
  const command =
    process.platform === "win32"
      ? ["cmd.exe", ["/d", "/s", "/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  const child = spawn(command[0], command[1], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

async function openWhenReady(port) {
  const healthUrl = `http://127.0.0.1:${port}/healthz`;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) {
        openBrowser(`http://127.0.0.1:${port}/`);
        return;
      }
    } catch {
      // The local server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  console.warn(`Job Matrix started, but ${healthUrl} did not become ready in 30 seconds.`);
}

const port = await choosePort();
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`Invalid PORT value: ${process.env.PORT}`);
}
process.env.PORT = String(port);
void openWhenReady(port);

await import(pathToFileURL(path.join(releaseRoot, "dist", "index.js")).href);
