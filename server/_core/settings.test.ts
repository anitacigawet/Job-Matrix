import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

let tempDir: string | undefined;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("stored settings reset", () => {
  it("deletes the settings file and clears the in-process cache", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-matrix-settings-"));
    const settingsPath = path.join(tempDir, "settings.json");
    vi.stubEnv("SETTINGS_PATH", settingsPath);
    vi.resetModules();

    const { clearStoredSettings, readSettings, writeSettings } = await import("./settings");
    writeSettings({ openaiKey: "fictional-test-key" });
    expect(fs.existsSync(settingsPath)).toBe(true);
    expect(readSettings().openaiKey).toBe("fictional-test-key");

    clearStoredSettings();

    expect(fs.existsSync(settingsPath)).toBe(false);
    expect(readSettings()).toEqual({});
  });
});
