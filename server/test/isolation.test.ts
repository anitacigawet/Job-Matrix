import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ENV } from "../_core/env";
import { readSettings } from "../_core/settings";
import { guardTestFetch, isolateTestEnvironment } from "./isolation";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("test environment isolation", () => {
  it("replaces inherited credentials, storage, dotenv, and Python configuration", () => {
    const inherited = {
      GEMINI_API_KEY: "fictional-private-key", GOOGLE_API_KEY: "fictional-private-key",
      OPENAI_API_KEY: "fictional-private-key", DEEPSEEK_API_KEY: "fictional-private-key",
      ADZUNA_APP_ID: "fictional-id", ADZUNA_APP_KEY: "fictional-key",
      USAJOBS_EMAIL: "fictional@example.test", USAJOBS_API_KEY: "fictional-key",
      JOOBLE_API_KEY: "fictional-key", THEMUSE_API_KEY: "fictional-key",
      LLM_PROVIDER: "openai", OPENAI_BASE_URL: "https://provider.example.test",
      GOOGLE_APPLICATION_CREDENTIALS: "/private/google.json",
      DATABASE_PATH: "/private/app.db", SETTINGS_PATH: "/private/settings.json",
      PYTHON_BIN: "/private/python", PYTHONPATH: "/private/modules", PYTHONHOME: "/private/python-home",
      JOB_MATRIX_VENV_DIR: "/private/venv", JOB_MATRIX_REQUIREMENTS_PATH: "/private/requirements.txt",
      JOB_SCRAPER_PATH: "/private/scraper.py", DOTENV_CONFIG_PATH: "/private/.env",
    };
    const environment: NodeJS.ProcessEnv = { ...inherited };
    const directory = isolateTestEnvironment(environment);
    directories.push(directory);

    for (const key of Object.keys(inherited)) {
      expect(environment[key]).not.toBe(inherited[key as keyof typeof inherited]);
    }
    expect(environment.NODE_ENV).toBe("test");
    expect(environment.DATABASE_PATH).toBe(path.join(directory, "app.db"));
    expect(environment.SETTINGS_PATH).toBe(path.join(directory, "settings.json"));
    expect(environment.JOB_MATRIX_VENV_DIR).toBe(path.join(directory, "python", "jobspy-venv"));
    expect(fs.existsSync(environment.PYTHON_BIN!)).toBe(false);
    expect(fs.existsSync(environment.DOTENV_CONFIG_PATH!)).toBe(false);
  });

  it("allocates fresh directories even within the same process", () => {
    const first = isolateTestEnvironment({});
    const second = isolateTestEnvironment({});
    directories.push(first, second);
    expect(first).not.toBe(second);
    expect(fs.readdirSync(first)).toEqual([]);
    expect(fs.readdirSync(second)).toEqual([]);
  });

  it("loads application modules with no real credentials or saved settings", () => {
    expect([
      ENV.geminiKey, ENV.openaiKey, ENV.deepseekKey,
      ENV.adzunaAppId, ENV.adzunaAppKey, ENV.usajobsEmail,
      ENV.usajobsApiKey, ENV.joobleApiKey, ENV.themuseApiKey,
    ]).toEqual(Array(9).fill(""));
    expect(readSettings()).toEqual({});
    expect(ENV.databasePath).toBe(process.env.DATABASE_PATH);
    expect(ENV.settingsPath).toBe(process.env.SETTINGS_PATH);
  });
});

describe("test network boundary", () => {
  it.each([
    "https://api.openai.com/v1/chat/completions",
    "https://www.themuse.com/api/public/jobs",
    "http://localhost.attacker.example/",
    "http://192.168.1.10/",
  ])("blocks an unmocked external fetch to %s", async url => {
    const originalFetch = vi.fn<typeof fetch>();
    await expect(guardTestFetch(originalFetch)(url)).rejects.toThrow("External fetch is disabled in tests");
    expect(originalFetch).not.toHaveBeenCalled();
  });

  it("installs the guard before the test file loads", async () => {
    await expect(globalThis.fetch("https://example.test/")).rejects.toThrow("External fetch is disabled in tests");
  });

  it.each(["127.0.0.1", "localhost", "[::1]"])("allows local HTTP at %s but forbids following redirects", async host => {
    const response = new Response(null, { status: 204 });
    const originalFetch = vi.fn<typeof fetch>().mockResolvedValue(response);
    const url = new URL(`http://${host}:3042/healthz`);
    expect(await guardTestFetch(originalFetch)(url, { redirect: "follow" })).toBe(response);
    expect(originalFetch).toHaveBeenCalledWith(url, { redirect: "error" });
  });
});
