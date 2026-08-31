#!/usr/bin/env node

import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 22)) {
  throw new Error(`Job Matrix requires Node.js 22.22.0 or newer; this is ${process.versions.node}.`);
}
process.chdir(projectRoot);
process.env.NODE_ENV = "production";
await import("dotenv/config");
process.env.DATABASE_PATH ??= path.join(projectRoot, "data", "app.db");
process.env.SETTINGS_PATH ??= path.join(projectRoot, "data", "settings.json");

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

if (!process.env.PORT) {
  for (let port = 3000; port <= 3050; port += 1) {
    if (await portIsAvailable(port)) {
      process.env.PORT = String(port);
      break;
    }
  }
}

if (!process.env.PORT) {
  console.error("No free local port was found between 3000 and 3050.");
  process.exit(1);
}

await import(pathToFileURL(path.join(projectRoot, "dist", "index.js")).href);
