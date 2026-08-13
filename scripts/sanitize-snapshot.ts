/**
 * scripts/sanitize-snapshot.ts
 *
 * One-time fixture builder for the Phase 8 GitHub Pages demo.
 *
 * Reads the live `./data/app.db`, scrubs every personally-identifying field,
 * wipes session-bearing tables (platform cookies, debug logs, user-written
 * notes), and writes a sanitized SQLite file to `client/src/snapshot/snapshot.db`.
 *
 * Job listings themselves (tracked_jobs, applied_jobs sans notes, AI analysis
 * payloads) are public information and are preserved as-is so the demo shows
 * a realistic dataset.
 *
 * Run:
 *   pnpm tsx scripts/sanitize-snapshot.ts
 *
 * Idempotent — safe to re-run whenever you want to refresh the demo fixture
 * from the current database state.
 */
import fs from "node:fs";
import path from "node:path";
import initSqlJs from "sql.js";

const SOURCE_DB = path.resolve("data/app.db");
const TARGET_DB = path.resolve("client/src/snapshot/snapshot.db");

// Generic demo persona. Public-safe placeholders; tuned to be plausible enough
// that fit-score charts still render meaningfully.
const DEMO = {
  openId: "demo-local-user",
  name: "Demo User",
  email: "demo@example.com",
  loginMethod: "local",
  city: "Austin",
  state: "TX",
  location: "Austin, TX",
  skillsRaw:
    "JavaScript, TypeScript, React, Node.js, SQL, REST APIs, Git — generic placeholder profile for the public demo snapshot.",
  minSalary: 80000,
};

function log(msg: string): void {
  process.stdout.write(`[sanitize-snapshot] ${msg}\n`);
}

async function main(): Promise<void> {
  if (!fs.existsSync(SOURCE_DB)) {
    throw new Error(`Source database not found at ${SOURCE_DB}`);
  }

  fs.mkdirSync(path.dirname(TARGET_DB), { recursive: true });

  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(SOURCE_DB);
  const db = new SQL.Database(new Uint8Array(buffer));

  const tablesBefore = db
    .exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")[0]
    ?.values.map((r) => String(r[0])) ?? [];
  log(`source tables: ${tablesBefore.join(", ")}`);

  const countRows = (table: string): number => {
    try {
      const res = db.exec(`SELECT COUNT(*) FROM ${table}`)[0];
      return res ? Number(res.values[0][0]) : 0;
    } catch {
      return -1;
    }
  };

  log(`tracked_jobs rows preserved: ${countRows("tracked_jobs")}`);
  log(`applied_jobs rows preserved: ${countRows("applied_jobs")}`);
  log(`job_scan_history rows preserved: ${countRows("job_scan_history")}`);

  // ── users: replace identity ────────────────────────────────────────
  db.run(
    `UPDATE users SET openId = ?, name = ?, email = ?, loginMethod = ?, role = 'admin'`,
    [DEMO.openId, DEMO.name, DEMO.email, DEMO.loginMethod],
  );
  log(`users sanitized (rows: ${countRows("users")})`);

  // ── user_profiles: replace location, education stays generic, scrub skills
  db.run(
    `UPDATE user_profiles SET
       state = ?,
       city = ?,
       search_radius_miles = 50,
       willing_to_relocate = 0,
       remote_preference = 'any',
       min_salary = ?,
       salary_filter_enabled = 0,
       skills_raw = ?,
       skills_parsed = NULL`,
    [DEMO.state, DEMO.city, DEMO.minSalary, DEMO.skillsRaw],
  );
  log(`user_profiles sanitized (rows: ${countRows("user_profiles")})`);

  // ── job_preferences: align with demo profile ───────────────────────
  if (tablesBefore.includes("job_preferences")) {
    db.run(
      `UPDATE job_preferences SET
         location = ?,
         radius_miles = 50,
         min_salary = NULL,
         max_salary = NULL`,
      [DEMO.location],
    );
    log(`job_preferences sanitized (rows: ${countRows("job_preferences")})`);
  }

  // ── platform_credentials: WIPE (session cookies / auth tokens) ─────
  const credCount = countRows("platform_credentials");
  db.run(`DELETE FROM platform_credentials`);
  log(`platform_credentials wiped (${credCount} rows removed)`);

  // ── applied_jobs.notes: clear user-written commentary ──────────────
  db.run(`UPDATE applied_jobs SET notes = NULL`);
  log(`applied_jobs.notes cleared`);

  // ── application_notes: WIPE (free-text notes about applications) ──
  const noteCount = countRows("application_notes");
  db.run(`DELETE FROM application_notes`);
  log(`application_notes wiped (${noteCount} rows removed)`);

  // ── debug_logs: WIPE (may contain arbitrary metadata) ─────────────
  const debugCount = countRows("debug_logs");
  db.run(`DELETE FROM debug_logs`);
  log(`debug_logs wiped (${debugCount} rows removed)`);

  // ── job_scan_history: normalize location to demo persona ──────────
  db.run(`UPDATE job_scan_history SET location = ?`, [DEMO.location]);
  log(`job_scan_history.location normalized`);

  // ── search_presets: normalize location ────────────────────────────
  if (tablesBefore.includes("search_presets")) {
    db.run(`UPDATE search_presets SET location = ?`, [DEMO.location]);
    log(`search_presets.location normalized`);
  }

  // ── user_settings: clear scheduler timestamps ─────────────────────
  if (tablesBefore.includes("user_settings")) {
    db.run(
      `UPDATE user_settings SET auto_scan_last_run = NULL, auto_scan_next_run = NULL`,
    );
    log(`user_settings scheduler timestamps cleared`);
  }

  // ── invite_codes: WIPE (unused in single-user, defensive) ─────────
  if (tablesBefore.includes("invite_codes")) {
    db.run(`DELETE FROM invite_codes`);
    log(`invite_codes wiped`);
  }

  // ── Reclaim space ─────────────────────────────────────────────────
  db.run(`VACUUM`);

  const out = db.export();
  fs.writeFileSync(TARGET_DB, Buffer.from(out));
  db.close();

  const sourceSize = fs.statSync(SOURCE_DB).size;
  const targetSize = fs.statSync(TARGET_DB).size;
  log(
    `wrote ${TARGET_DB} (${(targetSize / 1024).toFixed(1)} KB; source was ${(sourceSize / 1024).toFixed(1)} KB)`,
  );
}

main().catch((err) => {
  console.error("[sanitize-snapshot] FAILED:", err);
  process.exit(1);
});
