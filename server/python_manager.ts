import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(__dirname);
const IS_WINDOWS = process.platform === "win32";
const VENV_DIR = process.env.JOB_MATRIX_VENV_DIR
  || path.resolve(process.cwd(), "data", "python", "jobspy-venv");
const VENV_PYTHON = path.join(
  VENV_DIR,
  IS_WINDOWS ? "Scripts" : "bin",
  IS_WINDOWS ? "python.exe" : "python",
);

type PythonCommand = { command: string; args: string[] };

function cleanPythonEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || key === "PYTHONPATH" || key === "PYTHONHOME") continue;
    env[key] = value;
  }
  if (env.PATH) {
    env.PATH = env.PATH
      .split(path.delimiter)
      .filter(entry => !entry.includes(".local/share/uv/python"))
      .join(path.delimiter);
  }
  return env;
}

function canRun(command: string, args: string[], env: Record<string, string>): boolean {
  try {
    execFileSync(command, args, {
      env,
      stdio: ["ignore", "ignore", "ignore"],
      timeout: 15_000,
    });
    return true;
  } catch {
    return false;
  }
}

function isSupportedPython(
  candidate: PythonCommand,
  env: Record<string, string>,
): boolean {
  return canRun(
    candidate.command,
    [
      ...candidate.args,
      "-c",
      "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)",
    ],
    env,
  );
}

export function resolveSystemPython(env: Record<string, string>): PythonCommand {
  const override = process.env.PYTHON_BIN?.trim();
  if (override) {
    const candidate = { command: override, args: [] };
    if (!isSupportedPython(candidate, env)) {
      throw new Error(`PYTHON_BIN must point to Python 3.10 or newer: ${override}`);
    }
    return candidate;
  }

  const candidates: PythonCommand[] = IS_WINDOWS
    ? [
        { command: "py", args: ["-3"] },
        { command: "py", args: ["-3.12"] },
        { command: "py", args: ["-3.11"] },
        { command: "py", args: ["-3.10"] },
        { command: "python", args: [] },
        { command: "python3", args: [] },
      ]
    : [
        { command: "python3.14", args: [] },
        { command: "python3.13", args: [] },
        { command: "python3.12", args: [] },
        { command: "python3.11", args: [] },
        { command: "python3.10", args: [] },
        { command: "python3", args: [] },
        { command: "python", args: [] },
      ];

  const selected = candidates.find(candidate => isSupportedPython(candidate, env));
  if (!selected) {
    throw new Error("Python 3.10 or newer was not found on PATH. Set PYTHON_BIN to its executable path.");
  }
  return selected;
}

function resolveRequirementsPath(): string {
  const candidates = [
    process.env.JOB_MATRIX_REQUIREMENTS_PATH,
    path.resolve(process.cwd(), "requirements.txt"),
    path.resolve(projectRoot, "requirements.txt"),
    path.resolve(__dirname, "requirements.txt"),
  ].filter((candidate): candidate is string => Boolean(candidate));
  const resolved = candidates.find(candidate => fs.existsSync(candidate));
  if (resolved) return resolved;
  throw new Error(`requirements.txt was not found. Checked: ${candidates.join(", ")}`);
}

function expectedJobSpyVersion(requirementsPath: string): string {
  const contents = fs.readFileSync(requirementsPath, "utf8");
  const match = contents.match(/^python-jobspy==([^\s#]+)\s*(?:#.*)?$/m);
  if (!match) throw new Error("requirements.txt must pin python-jobspy with ==.");
  return match[1];
}

function venvHasExpectedJobSpy(
  expectedVersion: string,
  env: Record<string, string>,
): boolean {
  const script = [
    "import importlib.metadata as metadata",
    "import jobspy",
    `assert metadata.version('python-jobspy') == ${JSON.stringify(expectedVersion)}`,
  ].join("; ");
  return canRun(VENV_PYTHON, ["-c", script], env);
}

/**
 * Lazily create the JobSpy virtual environment and align it with the pinned
 * root requirements file. No global Python packages are installed.
 */
export async function ensurePythonVenv(): Promise<string> {
  const env = cleanPythonEnv();

  if (fs.existsSync(VENV_PYTHON) && !canRun(VENV_PYTHON, ["-c", "print('ok')"], env)) {
    throw new Error(
      `The JobSpy virtual environment is not usable: ${VENV_DIR}. `
      + "Remove that folder manually or set JOB_MATRIX_VENV_DIR to a new empty location.",
    );
  }

  try {
    if (!fs.existsSync(VENV_PYTHON)) {
      fs.mkdirSync(path.dirname(VENV_DIR), { recursive: true });
      const python = resolveSystemPython(env);
      execFileSync(python.command, [...python.args, "-m", "venv", VENV_DIR], {
        env,
        stdio: "inherit",
        timeout: 60_000,
      });
      console.log(`[Python Venv] Created virtual environment at ${VENV_DIR}`);
    }

    const requirementsPath = resolveRequirementsPath();
    const expectedVersion = expectedJobSpyVersion(requirementsPath);
    if (!venvHasExpectedJobSpy(expectedVersion, env)) {
      console.log(`[Python Venv] Installing pinned dependencies from ${requirementsPath}`);
      execFileSync(
        VENV_PYTHON,
        ["-m", "pip", "install", "--disable-pip-version-check", "-r", requirementsPath],
        { env, stdio: "inherit", timeout: 300_000 },
      );
    }

    if (!venvHasExpectedJobSpy(expectedVersion, env)) {
      throw new Error(`python-jobspy ${expectedVersion} could not be imported after installation.`);
    }
    return VENV_PYTHON;
  } catch (error) {
    console.error("[Python Venv] Setup failed:", error);
    throw new Error("Python venv setup failed. Global Search requires Python with JobSpy.");
  }
}

export function getCleanPythonEnv(): Record<string, string> {
  return cleanPythonEnv();
}
