/**
 * SQLite database layer (sql.js + drizzle-orm/sqlite-proxy).
 *
 * sql.js is pure WASM — no native compilation, works on Windows ARM64,
 * macOS, Linux, and inside containers without build tools.
 *
 * Calls are async because sql.js is loaded via initSqlJs(); the file is
 * flushed to disk after every mutation.
 */
import fs from "node:fs";
import path from "node:path";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { drizzle as drizzleProxy } from "drizzle-orm/sqlite-proxy";
import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import {
  trackedJobs,
  jobScanHistory,
  InsertTrackedJob,
  InsertJobScanHistory,
  userProfiles,
  InsertUserProfile,
  UserProfile,
  userJobTitles,
  userSettings,
  searchPresets,
  InsertSearchPreset,
  SearchPreset,
  applicationNotes,
  InsertApplicationNote,
  ApplicationNote,
  scraperHealth,
} from "../drizzle/schema";
import * as schema from "../drizzle/schema";
import { ENV } from "./_core/env";
import { assertOperationActive } from "./operation-lifecycle";

export const LOCAL_USER_ID = 1;

let _sqliteDb: SqlJsDatabase | null = null;
let _drizzle: ReturnType<typeof drizzleProxy<typeof schema>> | null = null;

function ensureDataDir(): void {
  const dir = path.dirname(ENV.databasePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function flush(): void {
  if (!_sqliteDb) return;
  const data = _sqliteDb.export();
  const pendingPath = `${ENV.databasePath}.${process.pid}.pending`;
  const handle = fs.openSync(pendingPath, "w");
  try {
    fs.writeFileSync(handle, Buffer.from(data));
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  // Atomic replacement prevents an interrupted write from leaving app.db
  // half-written. A failed rename leaves the complete .pending file intact.
  fs.renameSync(pendingPath, ENV.databasePath);
}

function applyMigrations(db: SqlJsDatabase): void {
  db.run(
    `CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    )`
  );

  const applied = new Set<string>();
  const res = db.exec("SELECT hash FROM __drizzle_migrations");
  if (res.length > 0) {
    for (const row of res[0].values) {
      applied.add(String(row[0]));
    }
  }

  const migrationsDir = path.resolve(process.cwd(), "drizzle", "migrations");
  if (!fs.existsSync(migrationsDir)) {
    console.warn("[Database] No migrations directory at", migrationsDir);
    return;
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter(f => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sqlText = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    const statements = sqlText
      .split("--> statement-breakpoint")
      .map(s => s.trim())
      .filter(Boolean);

    for (const stmt of statements) {
      try {
        db.run(stmt);
      } catch (err) {
        console.error(
          `[Database] Failed migration ${file} on statement:\n${stmt}\n`,
          err
        );
        throw err;
      }
    }

    db.run(
      "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
      [file, Date.now()]
    );
    console.log(`[Database] Applied migration: ${file}`);
  }
}

/**
 * On every server boot, mark any "running" job scans as failed because the
 * in-memory process that was driving them is gone.
 */
function cleanupOrphanedJobs(db: SqlJsDatabase): void {
  const stale: {
    table: string;
    col: string;
    from: string;
    to: string;
    msg: string;
  }[] = [
    {
      table: "job_scan_history",
      col: "status",
      from: "running",
      to: "failed",
      msg: "Orphaned scan — server restarted while in-flight",
    },
  ];

  for (const s of stale) {
    try {
      const before = db.exec(
        `SELECT COUNT(*) FROM ${s.table} WHERE ${s.col} = '${s.from}'`
      );
      const count = before.length > 0 ? Number(before[0].values[0][0]) : 0;
      if (count === 0) continue;
      db.run(
        `UPDATE ${s.table}
           SET ${s.col} = '${s.to}',
               error_message = '${s.msg}',
               completed_at = unixepoch()
         WHERE ${s.col} = '${s.from}'`
      );
      console.log(
        `[Database] Cleaned up ${count} orphaned ${s.table} row(s) (status '${s.from}' → '${s.to}')`
      );
    } catch (err) {
      // Table may not exist yet on a fresh DB; just skip.
      console.warn(`[Database] Could not clean ${s.table}:`, err);
    }
  }
}

export async function initDb(): Promise<void> {
  if (_drizzle) return;

  ensureDataDir();
  const SQL = await initSqlJs();
  const buffer = fs.existsSync(ENV.databasePath)
    ? fs.readFileSync(ENV.databasePath)
    : null;
  const sqliteDb = buffer ? new SQL.Database(buffer) : new SQL.Database();
  sqliteDb.run("PRAGMA foreign_keys = ON");
  _sqliteDb = sqliteDb;

  applyMigrations(sqliteDb);
  cleanupOrphanedJobs(sqliteDb);
  flush();

  _drizzle = drizzleProxy(
    async (queryStr, params, method) => {
      // The check and SQL run share a synchronous boundary, so a reset cannot
      // slip between them and let a suspended operation restore cleared data.
      assertOperationActive();
      const p = (params ?? []) as any[];
      const upper = queryStr.trimStart().toUpperCase();
      const isMutation =
        upper.startsWith("INSERT") ||
        upper.startsWith("UPDATE") ||
        upper.startsWith("DELETE");

      if (method === "run") {
        sqliteDb.run(queryStr, p);
        if (isMutation) flush();
        return { rows: [] };
      }

      const stmt = sqliteDb.prepare(queryStr);
      try {
        stmt.bind(p);
        const rows: unknown[][] = [];
        while (stmt.step()) {
          rows.push(stmt.get() as unknown[]);
        }
        if (isMutation) flush();
        if (method === "get") {
          return { rows: rows[0] ?? [] };
        }
        return { rows };
      } finally {
        stmt.free();
      }
    },
    { schema, casing: "snake_case" }
  );

  console.log(`[Database] SQLite opened at ${ENV.databasePath}`);
}

export async function getDb() {
  if (!_drizzle) {
    throw new Error(
      "Database not initialised — call initDb() at server startup before queries."
    );
  }
  return _drizzle;
}

// ============================================================================
// USER PROFILES
// ============================================================================

export async function saveUserProfile(
  profile: InsertUserProfile
): Promise<void> {
  const db = await getDb();
  const existing = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, profile.userId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(userProfiles)
      .set({
        state: profile.state,
        city: profile.city,
        searchRadiusMiles: profile.searchRadiusMiles,
        willingToRelocate: profile.willingToRelocate,
        remotePreference: profile.remotePreference,
        educationLevel: profile.educationLevel,
        yearsExperience: profile.yearsExperience,
        skillsRaw: profile.skillsRaw,
        skillsParsed: profile.skillsParsed,
        resumeText: profile.resumeText ?? null,
        minSalary: profile.minSalary ?? null,
        salaryFilterEnabled: profile.salaryFilterEnabled ?? 0,
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.userId, profile.userId));
  } else {
    await db.insert(userProfiles).values(profile);
  }
}

export async function getUserProfile(
  userId: number
): Promise<UserProfile | undefined> {
  const db = await getDb();
  const result = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getActiveJobTitles(userId: number): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ jobTitle: userJobTitles.jobTitle })
    .from(userJobTitles)
    .where(
      and(eq(userJobTitles.userId, userId), eq(userJobTitles.isActive, 1))
    );
  return rows.map(row => row.jobTitle);
}

// ============================================================================
// SCRAPER HEALTH
// ============================================================================

// Health is tracked for every source (Tier 1 + Tier 2). The card on the
// Platforms page consumes this directly. Keep in sync with the tier map in
// `shared/platforms.ts` so a new source registers a health row on its
// first call.
const SUPPORTED_SCRAPER_PLATFORMS = [
  "indeed",
  "glassdoor",
  "linkedin",
  "ziprecruiter",
  "google",
  "adzuna",
  "usajobs",
  "jooble",
  "themuse",
  "remotive",
  "remoteok",
] as const;

export type ScraperPlatform = (typeof SUPPORTED_SCRAPER_PLATFORMS)[number];

/**
 * Record one scrape attempt against a platform. Increments counters,
 * updates last_attempt_at, sets last_success_at on success, sets
 * last_error on failure. Upserts the row if it doesn't exist.
 */
export async function recordScraperAttempt(
  platform: ScraperPlatform,
  success: boolean,
  error?: string | null
): Promise<void> {
  const db = await getDb();
  const now = new Date();
  const existing = await db
    .select()
    .from(scraperHealth)
    .where(eq(scraperHealth.platform, platform))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(scraperHealth).values({
      platform,
      lastAttemptAt: now,
      lastSuccessAt: success ? now : null,
      lastError: success ? null : (error ?? "Unknown error"),
      totalAttempts: 1,
      totalFailures: success ? 0 : 1,
      updatedAt: now,
    });
    return;
  }

  const row = existing[0];
  await db
    .update(scraperHealth)
    .set({
      lastAttemptAt: now,
      lastSuccessAt: success ? now : row.lastSuccessAt,
      lastError: success ? null : (error ?? row.lastError ?? "Unknown error"),
      totalAttempts: row.totalAttempts + 1,
      totalFailures: row.totalFailures + (success ? 0 : 1),
      updatedAt: now,
    })
    .where(eq(scraperHealth.platform, platform));
}

/**
 * Snapshot of all platforms' health, including platforms that haven't been
 * attempted yet (returned with null timestamps and 0 counters).
 */
export async function getScraperHealthSnapshot() {
  const db = await getDb();
  const rows = await db.select().from(scraperHealth);
  const byPlatform = new Map(rows.map(r => [r.platform, r]));
  return SUPPORTED_SCRAPER_PLATFORMS.map(platform => {
    const r = byPlatform.get(platform);
    return {
      platform,
      lastSuccessAt: r?.lastSuccessAt ?? null,
      lastAttemptAt: r?.lastAttemptAt ?? null,
      lastError: r?.lastError ?? null,
      totalAttempts: r?.totalAttempts ?? 0,
      totalFailures: r?.totalFailures ?? 0,
    };
  });
}

export async function updateUserProfileSkills(
  userId: number,
  skillsRaw: string,
  skillsParsed: Array<{ skill: string; yearsExperience: number; level: string }>
): Promise<void> {
  const db = await getDb();
  await db
    .update(userProfiles)
    .set({ skillsRaw, skillsParsed, updatedAt: new Date() })
    .where(eq(userProfiles.userId, userId));
}

// ============================================================================
// TRACKED JOBS
// ============================================================================

export async function bulkSaveTrackedJobs(jobs: InsertTrackedJob[]) {
  const db = await getDb();
  if (jobs.length === 0) return { newJobs: 0, skipped: 0 };

  const BATCH_SIZE = 50;
  let newJobs = 0;
  let skipped = 0;

  const userIds = Array.from(new Set(jobs.map(job => job.userId)));
  if (userIds.length !== 1) {
    throw new Error(
      "bulkSaveTrackedJobs expects jobs for exactly one local user"
    );
  }
  const existingRows = await db
    .select({
      platform: trackedJobs.platform,
      jobId: trackedJobs.jobId,
    })
    .from(trackedJobs)
    .where(eq(trackedJobs.userId, userIds[0]));
  const known = new Set(
    existingRows.map(row => `${row.platform}\u0000${row.jobId}`)
  );
  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE);
    const pending: InsertTrackedJob[] = [];
    for (const job of batch) {
      const key = `${job.platform}\u0000${job.jobId}`;
      if (known.has(key)) {
        skipped++;
        continue;
      }
      known.add(key);
      pending.push(job);
    }
    if (pending.length > 0) {
      await db.insert(trackedJobs).values(pending);
      newJobs += pending.length;
    }
    if ((i + BATCH_SIZE) % 500 === 0) {
      console.log(
        `[Database] Saved ${newJobs} new jobs, skipped ${skipped} duplicates so far...`
      );
    }
  }
  return { newJobs, skipped };
}

// ============================================================================
// JOB SCAN HISTORY
// ============================================================================

export async function createJobScanHistory(
  scan: InsertJobScanHistory
): Promise<number> {
  const db = await getDb();
  const [inserted] = await db
    .insert(jobScanHistory)
    .values(scan)
    .returning({ id: jobScanHistory.id });
  return inserted.id;
}

export async function updateJobScanHistory(
  scanId: number,
  updates: {
    status?: "running" | "completed" | "failed";
    totalJobsFound?: number;
    newJobsFound?: number;
    errorMessage?: string;
    completedAt?: Date;
    currentPhase?: string;
    currentProgress?: number;
    totalProgress?: number;
    progressMessage?: string;
    lastProgressUpdate?: Date;
    completedSearches?: Array<{ title: string; location: string }>;
    operationPaused?: boolean;
    operationCancelled?: boolean;
  }
) {
  const db = await getDb();
  await db
    .update(jobScanHistory)
    .set(updates)
    .where(eq(jobScanHistory.id, scanId));
}

export async function getRecentJobScans(userId: number, limit: number = 10) {
  const db = await getDb();
  return await db
    .select()
    .from(jobScanHistory)
    .where(eq(jobScanHistory.userId, userId))
    .orderBy(desc(jobScanHistory.startedAt))
    .limit(limit);
}

// ============================================================================
// PLATFORM SETTINGS
// ============================================================================

export async function getEnabledPlatforms(userId: number): Promise<string[]> {
  const db = await getDb();
  const [settings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  // Default mixes Tier-1 (Adzuna) with the two green Tier-2 scrapers
  // (Indeed, LinkedIn). Adzuna runs only if credentials are configured;
  // searchJobs() will short-circuit it cleanly otherwise.
  if (!settings || !settings.enabledPlatforms)
    return ["indeed", "linkedin", "adzuna"];
  return settings.enabledPlatforms as string[];
}

// ============================================================================
// SEARCH PRESETS
// ============================================================================

export async function getSearchPresets(
  userId: number
): Promise<SearchPreset[]> {
  const db = await getDb();
  return await db
    .select()
    .from(searchPresets)
    .where(eq(searchPresets.userId, userId))
    .orderBy(searchPresets.createdAt);
}

export async function createSearchPreset(data: {
  userId: number;
  name: string;
  jobTitles: string[];
  location: string;
  radiusMiles: number;
  remotePreference: "remote_only" | "hybrid" | "on_site" | "any";
  platforms: string[];
  minSalary?: number | null;
  jobType?: string | null;
  isDefault?: number;
}): Promise<number | null> {
  const db = await getDb();
  if (data.isDefault) {
    await db
      .update(searchPresets)
      .set({ isDefault: 0 })
      .where(eq(searchPresets.userId, data.userId));
  }
  const [inserted] = await db
    .insert(searchPresets)
    .values({
      userId: data.userId,
      name: data.name,
      jobTitles: data.jobTitles,
      location: data.location,
      radiusMiles: data.radiusMiles,
      remotePreference: data.remotePreference,
      platforms: data.platforms,
      minSalary: data.minSalary ?? null,
      jobType: data.jobType ?? null,
      isDefault: data.isDefault ?? 0,
    })
    .returning({ id: searchPresets.id });
  return inserted.id;
}

export async function updateSearchPreset(
  presetId: number,
  userId: number,
  data: {
    name?: string;
    jobTitles?: string[];
    location?: string;
    radiusMiles?: number;
    remotePreference?: "remote_only" | "hybrid" | "on_site" | "any";
    platforms?: string[];
    minSalary?: number | null;
    jobType?: string | null;
    isDefault?: number;
  }
): Promise<boolean> {
  const db = await getDb();
  if (data.isDefault) {
    await db
      .update(searchPresets)
      .set({ isDefault: 0 })
      .where(eq(searchPresets.userId, userId));
  }
  await db
    .update(searchPresets)
    .set({ ...data, updatedAt: new Date() })
    .where(
      and(eq(searchPresets.id, presetId), eq(searchPresets.userId, userId))
    );
  return true;
}

export async function deleteSearchPreset(
  presetId: number,
  userId: number
): Promise<boolean> {
  const db = await getDb();
  await db
    .delete(searchPresets)
    .where(
      and(eq(searchPresets.id, presetId), eq(searchPresets.userId, userId))
    );
  return true;
}

export async function markPresetUsed(
  presetId: number,
  userId: number
): Promise<void> {
  const db = await getDb();
  await db
    .update(searchPresets)
    .set({ lastUsedAt: new Date() })
    .where(
      and(eq(searchPresets.id, presetId), eq(searchPresets.userId, userId))
    );
}

// ── Application Notes ──────────────────────────────────────────────
export async function getApplicationNotes(userId: number, jobId: number) {
  const db = await getDb();
  return db
    .select()
    .from(applicationNotes)
    .where(
      and(
        eq(applicationNotes.userId, userId),
        eq(applicationNotes.jobId, jobId)
      )
    )
    .orderBy(desc(applicationNotes.createdAt));
}

export async function addApplicationNote(data: {
  userId: number;
  jobId: number;
  noteType:
    | "note"
    | "status_change"
    | "interview"
    | "follow_up"
    | "offer"
    | "rejection";
  content: string;
  oldStatus?: string;
  newStatus?: string;
}) {
  const db = await getDb();
  await db.insert(applicationNotes).values({
    userId: data.userId,
    jobId: data.jobId,
    noteType: data.noteType,
    content: data.content,
    oldStatus: data.oldStatus || null,
    newStatus: data.newStatus || null,
  });
}

export async function deleteApplicationNote(userId: number, noteId: number) {
  const db = await getDb();
  await db
    .delete(applicationNotes)
    .where(
      and(eq(applicationNotes.id, noteId), eq(applicationNotes.userId, userId))
    );
}

export async function getApplicationNotesCount(userId: number) {
  const db = await getDb();
  return await db
    .select({ jobId: applicationNotes.jobId, count: sql<number>`count(*)` })
    .from(applicationNotes)
    .where(eq(applicationNotes.userId, userId))
    .groupBy(applicationNotes.jobId);
}
