import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PRIVATE_ENVIRONMENT_KEYS = [
  "LLM_PROVIDER", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GEMINI_MODEL",
  "OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_BASE_URL", "OPENAI_ORG_ID", "OPENAI_PROJECT_ID",
  "DEEPSEEK_API_KEY", "DEEPSEEK_MODEL",
  "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_GENAI_USE_VERTEXAI", "GOOGLE_CLOUD_PROJECT", "GOOGLE_CLOUD_LOCATION",
  "ADZUNA_APP_ID", "ADZUNA_APP_KEY", "ADZUNA_COUNTRY",
  "USAJOBS_EMAIL", "USAJOBS_API_KEY", "JOOBLE_API_KEY", "THEMUSE_API_KEY",
  "PYTHONPATH", "PYTHONHOME", "VIRTUAL_ENV", "CONDA_PREFIX",
  "JOB_MATRIX_REQUIREMENTS_PATH", "JOB_SCRAPER_PATH",
] as const;

/** Run before application imports; never read or preserve the operator's values. */
export function isolateTestEnvironment(environment: NodeJS.ProcessEnv): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "job-matrix-vitest-"));
  for (const key of PRIVATE_ENVIRONMENT_KEYS) environment[key] = "";
  environment.NODE_ENV = "test";
  environment.PORT = "3000";
  environment.DATABASE_PATH = path.join(directory, "app.db");
  environment.SETTINGS_PATH = path.join(directory, "settings.json");
  environment.JOB_MATRIX_VENV_DIR = path.join(directory, "python", "jobspy-venv");
  // Unmocked Python setup must fail before it can launch a real scraper or pip.
  environment.PYTHON_BIN = path.join(directory, "mock-python-required");
  environment.DOTENV_CONFIG_PATH = path.join(directory, "absent.env");
  environment.DOTENV_CONFIG_OVERRIDE = "false";
  return directory;
}

/** Tests must mock providers/sources; real HTTP is limited to local test servers. */
export function guardTestFetch(originalFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
      throw new Error("External fetch is disabled in tests. Mock the provider or source request.");
    }
    // A loopback redirect must not turn into an external request.
    return originalFetch(input, { ...init, redirect: "error" });
  };
}
