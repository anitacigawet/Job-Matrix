import { spawn, execSync, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.dirname(__dirname);

const IS_WINDOWS = process.platform === "win32";
const VENV_DIR =
  process.env.JOB_MATRIX_VENV_DIR ||
  (IS_WINDOWS
    ? path.join(os.homedir(), ".job-matrix", "venv_jobspy_shared")
    : "/home/ubuntu/venv_jobspy_shared");
const VENV_PYTHON = path.join(
  VENV_DIR,
  IS_WINDOWS ? "Scripts" : "bin",
  IS_WINDOWS ? "python.exe" : "python3"
);
const VENV_PIP = path.join(
  VENV_DIR,
  IS_WINDOWS ? "Scripts" : "bin",
  IS_WINDOWS ? "pip.exe" : "pip3"
);
// IMPORTANT: the PyPI package is `python-jobspy` (Bunsly/JobSpy). A different,
// unrelated package called `jobspy` exists (it's Josiah Carlson's Redis job
// coordinator) — installing that one will succeed but `import jobspy` will
// still fail because it installs as the `jobs` module. Do not change the
// first entry without reading the README's "Optional: enable scraping" note.
// Map of PyPI package name → Python import name. Used for per-package
// health checks so we can install only the packages that are missing
// instead of nuking the entire venv every time we add a new dep.
const REQUIRED_PACKAGES: { pkg: string; importName: string }[] = [
  { pkg: "python-jobspy", importName: "jobspy" },
  { pkg: "fastapi", importName: "fastapi" },
  { pkg: "uvicorn", importName: "uvicorn" },
  { pkg: "requests", importName: "requests" },
  // NotebookLM Studio outputs (audio overviews, infographics, etc.)
  // for the briefings feature. Requires a one-time `notebooklm login`
  // browser-based auth step (handled by the Settings page); the venv
  // install pulls the library and Playwright + Chromium binary below.
  { pkg: "notebooklm-py", importName: "notebooklm" },
  // Playwright drives the Chromium window during `notebooklm login`.
  // The pip install pulls the Python bindings; the actual Chromium
  // browser binary is downloaded separately via `playwright install
  // chromium`, handled after the per-package loop below.
  { pkg: "playwright", importName: "playwright" },
];

/**
 * Pick a Python interpreter to create the venv with.
 *
 * Precedence:
 *   1. `PYTHON_BIN` env var (explicit override)
 *   2. On Windows: try `py -3.12`, `py -3.11`, then `python` from PATH.
 *      We prefer 3.12 because some scraper dependencies (notably numpy) ship
 *      Windows ARM64 wheels for 3.12 but not earlier; on a 3.11-ARM64 venv
 *      pip will try to build numpy from source and fail.
 *   3. On macOS/Linux: `/usr/bin/python3`.
 */
function getSystemPythonCommand(): string {
  if (process.env.PYTHON_BIN?.trim()) {
    return process.env.PYTHON_BIN.trim();
  }

  if (IS_WINDOWS) {
    // The `py` launcher is shipped with the official Python installer and
    // is the recommended way to pick a specific version on Windows.
    for (const version of ["-3.12", "-3.11"]) {
      try {
        execSync(`py ${version} --version`, { stdio: ["pipe", "pipe", "pipe"], timeout: 5000 });
        return `py ${version}`;
      } catch {
        // try next version
      }
    }
    return "python";
  }

  return "/usr/bin/python3";
}

/**
 * Build a clean environment for Python subprocesses.
 * Removes PYTHONPATH, PYTHONHOME, and strips any uv/cpython paths from PATH
 * to prevent the cpython-3.13 installation from contaminating the venv.
 */
function cleanPythonEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, val] of Object.entries(process.env)) {
    if (val === undefined) continue;
    // Skip Python-specific env vars that could contaminate the venv
    if (key === 'PYTHONPATH' || key === 'PYTHONHOME') continue;
    env[key] = val;
  }
  // Clean PATH: remove any uv/cpython entries
  if (env.PATH) {
    env.PATH = env.PATH.split(path.delimiter)
      .filter(p => !p.includes('cpython-3.13') && !p.includes('.local/share/uv/python'))
      .join(path.delimiter);
  }
  return env;
}

/**
 * Probe whether a single Python module can be imported from the venv.
 * Returns true if `python -c "import <name>"` succeeds.
 */
function venvHasPackage(importName: string, cleanEnv: Record<string, string>): boolean {
  try {
    execSync(`${VENV_PYTHON} -c "import ${importName}"`, {
      timeout: 15000,
      stdio: ["pipe", "pipe", "pipe"],
      env: cleanEnv,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Install a single package into the existing venv (no wipe).
 */
function installPackageIntoVenv(pkg: string, cleanEnv: Record<string, string>): void {
  console.log(`[Python Venv] Installing ${pkg}...`);
  execSync(`"${VENV_PIP}" install ${pkg}`, {
    timeout: 180000,
    stdio: ["pipe", "pipe", "pipe"],
    env: cleanEnv,
  });
}

/**
 * Ensure the Python venv exists and has all required packages.
 *
 * Strategy:
 *   1. If the venv's python itself doesn't run, wipe + rebuild from scratch.
 *   2. Otherwise, check each REQUIRED_PACKAGE individually and install
 *      only the missing ones. New packages added to REQUIRED_PACKAGES
 *      after the venv was provisioned will be installed without nuking
 *      everything else.
 *
 * This is intentionally lazy — it runs at the first request that needs
 * Python, not at server boot. First scrape or first briefing generation
 * pays the cost.
 */
export async function ensurePythonVenv(): Promise<string> {
  const cleanEnv = cleanPythonEnv();

  // Step 1: Python-level health check. Does the venv's python even run?
  if (fs.existsSync(VENV_PYTHON)) {
    try {
      execSync(`${VENV_PYTHON} -c "print('ok')"`, {
        timeout: 15000,
        stdio: ["pipe", "pipe", "pipe"],
        env: cleanEnv,
      });
    } catch (err: any) {
      console.warn(
        "[Python Venv] venv python is broken:",
        err?.stderr?.toString?.() || err?.message || "unknown error",
      );
      console.warn("[Python Venv] Wiping and rebuilding venv from scratch...");
      try {
        fs.rmSync(VENV_DIR, { recursive: true, force: true });
      } catch (rmErr) {
        console.warn("[Python Venv] Could not remove broken venv:", rmErr);
      }
    }
  }

  // Step 2: Create the venv if it doesn't exist.
  try {
    if (!fs.existsSync(VENV_DIR)) {
      fs.mkdirSync(path.dirname(VENV_DIR), { recursive: true });
      const pythonCmd = getSystemPythonCommand();
      const quoted = pythonCmd.includes(" ") ? pythonCmd : `"${pythonCmd}"`;
      execSync(`${quoted} -m venv "${VENV_DIR}"`, { timeout: 30000, env: cleanEnv });
      console.log(`[Python Venv] Created virtual environment using ${pythonCmd}`);
    }

    // Step 3: For each required package, check + install if missing.
    // This is the fix for the "added a new package but the existing venv
    // doesn't know about it" problem. Idempotent.
    const justInstalled: string[] = [];
    for (const { pkg, importName } of REQUIRED_PACKAGES) {
      if (!venvHasPackage(importName, cleanEnv)) {
        installPackageIntoVenv(pkg, cleanEnv);
        justInstalled.push(pkg);
      }
    }
    if (justInstalled.length === 0) {
      console.log("[Python Venv] Existing venv is healthy (all packages present)");
    }

    // Step 4: If Playwright was freshly installed (or notebooklm-py was, which
    // needs the chromium binary), download Chromium. The `playwright install
    // chromium` command is idempotent and exits fast when the binary is
    // already on disk.
    if (justInstalled.includes("playwright") || justInstalled.includes("notebooklm-py")) {
      console.log("[Python Venv] Downloading Playwright Chromium browser (one-time, ~150MB)...");
      try {
        execSync(`${VENV_PYTHON} -m playwright install chromium`, {
          timeout: 600000, // 10 minutes — the download can be slow on first run
          stdio: ["pipe", "pipe", "pipe"],
          env: cleanEnv,
        });
        console.log("[Python Venv] Chromium browser ready");
      } catch (err: any) {
        console.warn(
          "[Python Venv] Chromium download failed (NotebookLM login will not work until this is resolved):",
          err?.stderr?.toString?.() || err?.message || "unknown error",
        );
      }
    }

    // Step 5: Final verification — the canonical "jobspy must import" check.
    execSync(`${VENV_PYTHON} -c "import jobspy; print('ok')"`, {
      timeout: 15000,
      stdio: ["pipe", "pipe", "pipe"],
      env: cleanEnv,
    });
    
    console.log("[Python Venv] Setup complete and verified");
    return VENV_PYTHON;
  } catch (error: any) {
    console.error("[Python Venv] Failed to set up venv:", error?.stderr?.toString?.() || error?.message || error);
    throw new Error("Python venv setup failed. Global Search requires Python with JobSpy.");
  }
}

/**
 * Get the path to the venv Python binary.
 * Returns the path without checking health (use ensurePythonVenv for that).
 */
export function getVenvPython(): string {
  return VENV_PYTHON;
}

/**
 * Get clean environment for spawning Python processes.
 * Use this when spawning Python child processes to avoid cpython contamination.
 */
export function getCleanPythonEnv(): Record<string, string> {
  return cleanPythonEnv();
}

export class PythonProcessManager {
  private searchProcess: ChildProcess | null = null;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log('[Python Manager] Initializing...');

    try {
      // Ensure venv is ready before starting any Python processes
      await ensurePythonVenv();
      
      this.isInitialized = true;
      console.log('[Python Manager] Python environment ready');
    } catch (error) {
      console.error('[Python Manager] Failed to initialize:', error);
      // Don't throw — let the app start without Python
      // Global Search will show a clear error if venv is missing
    }
  }

  async shutdown(): Promise<void> {
    console.log('[Python Manager] Shutting down...');

    if (this.searchProcess) {
      this.searchProcess.kill('SIGTERM');
      this.searchProcess = null;
    }

    this.isInitialized = false;
    console.log('[Python Manager] Shut down complete');
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Run the backup Playwright-based scraper (ARM64 compatible)
   */
  async runBackupSearch(params: {
    searchTerm: string;
    location: string;
  }): Promise<{ success: boolean; jobs?: any[]; count: number; error?: string }> {
    const pythonPath = getVenvPython();
    const scraperPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'backup_scraper.py');
    const cleanEnv = getCleanPythonEnv();

    return new Promise((resolve) => {
      console.log(`[Python Manager] Running backup scraper for "${params.searchTerm}" in ${params.location}...`);
      
      const child = spawn(pythonPath, [scraperPath, params.searchTerm, params.location], {
        env: cleanEnv,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => { stdout += data.toString(); });
      child.stderr?.on('data', (data) => { stderr += data.toString(); });

      child.on('close', (code) => {
        if (code === 0) {
          try {
            const jobs = JSON.parse(stdout);
            resolve({ success: true, jobs, count: jobs.length });
          } catch (err) {
            console.error('[Python Manager] Failed to parse backup scraper output:', err);
            resolve({ success: false, count: 0, error: 'Parse failure' });
          }
        } else {
          console.error('[Python Manager] Backup scraper failed with code:', code, stderr);
          resolve({ success: false, count: 0, error: stderr });
        }
      });
    });
  }
}

// Singleton instance
let pythonManager: PythonProcessManager | null = null;

export function getPythonManager(): PythonProcessManager {
  if (!pythonManager) {
    pythonManager = new PythonProcessManager();
  }
  return pythonManager;
}
