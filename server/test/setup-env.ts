import fs from "node:fs";
import { afterAll, afterEach } from "vitest";
import { guardTestFetch, isolateTestEnvironment } from "./isolation";

// Vitest runs setup before each test file's application imports. Random, fresh
// directories prevent PID reuse and previous suites from exposing saved state.
const directory = isolateTestEnvironment(process.env);
const guardedFetch = guardTestFetch(globalThis.fetch);
globalThis.fetch = guardedFetch;

afterEach(() => {
  globalThis.fetch = guardedFetch;
});

afterAll(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});
