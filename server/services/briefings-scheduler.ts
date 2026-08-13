/**
 * server/services/briefings-scheduler.ts
 *
 * Background scheduler for NotebookLM-powered briefings. Mirrors the
 * shape of auto-scan-scheduler.ts: a setInterval ticks every hour, queries
 * user_settings for opted-in users, and kicks off a generation if the
 * appropriate window has elapsed since last_run.
 *
 * Generation itself is fire-and-forget (see startBriefingGeneration) —
 * the scheduler just enqueues, NotebookLM does the work, the briefings
 * row's status flips when complete.
 *
 * Quota-aware: never fires while a previous one of the same type is still
 * in "generating" state. Never doubles up.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { briefings, userSettings } from "../../drizzle/schema";
import { startBriefingGeneration } from "./briefings";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const DAILY_WINDOW_MS = 23 * 60 * 60 * 1000; // 23h — gives a bit of drift tolerance
const WEEKLY_WINDOW_MS = 6.5 * 24 * 60 * 60 * 1000; // 6.5 days

let interval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

export function startBriefingsScheduler() {
  if (interval) {
    console.log("[Briefings Scheduler] Already running");
    return;
  }
  console.log("[Briefings Scheduler] Starting (check every 1 hour)");
  // Run immediately on boot, then hourly.
  void tick();
  interval = setInterval(() => void tick(), CHECK_INTERVAL_MS);
}

export function stopBriefingsScheduler() {
  if (interval) {
    clearInterval(interval);
    interval = null;
    console.log("[Briefings Scheduler] Stopped");
  }
}

async function tick(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  try {
    const db = await getDb();
    if (!db) return;

    const now = new Date();
    const allSettings = await db.select().from(userSettings);

    for (const s of allSettings) {
      try {
        if (s.autoDailyBriefing === 1) {
          await maybeFireDaily(db, s, now);
        }
        if (s.autoWeeklyBriefing === 1) {
          await maybeFireWeekly(db, s, now);
        }
      } catch (err: any) {
        console.error(
          `[Briefings Scheduler] User ${s.userId} tick error:`,
          err?.message ?? err,
        );
      }
    }
  } catch (err: any) {
    console.error("[Briefings Scheduler] Tick failed:", err?.message ?? err);
  } finally {
    isRunning = false;
  }
}

async function maybeFireDaily(db: any, settings: any, now: Date): Promise<void> {
  const last = settings.autoDailyBriefingLastRun as Date | null | undefined;
  if (last && now.getTime() - last.getTime() < DAILY_WINDOW_MS) return;

  // Don't double-fire while a previous daily is still generating.
  const inFlight = await db
    .select()
    .from(briefings)
    .where(
      and(
        eq(briefings.userId, settings.userId),
        eq(briefings.briefingType, "daily_coach_audio"),
        eq(briefings.status, "generating"),
      ),
    );
  if (inFlight.length > 0) {
    console.log(
      `[Briefings Scheduler] User ${settings.userId}: daily already generating, skipping`,
    );
    return;
  }

  console.log(`[Briefings Scheduler] User ${settings.userId}: firing daily_coach_audio`);
  try {
    await startBriefingGeneration("daily_coach_audio", { userId: settings.userId });
    await db
      .update(userSettings)
      .set({ autoDailyBriefingLastRun: now })
      .where(eq(userSettings.userId, settings.userId));
  } catch (err: any) {
    console.error(
      `[Briefings Scheduler] User ${settings.userId} daily failed to start:`,
      err?.message ?? err,
    );
  }
}

async function maybeFireWeekly(db: any, settings: any, now: Date): Promise<void> {
  const last = settings.autoWeeklyBriefingLastRun as Date | null | undefined;
  if (last && now.getTime() - last.getTime() < WEEKLY_WINDOW_MS) return;

  const inFlight = await db
    .select()
    .from(briefings)
    .where(
      and(
        eq(briefings.userId, settings.userId),
        eq(briefings.briefingType, "weekly_market_audio"),
        eq(briefings.status, "generating"),
      ),
    );
  if (inFlight.length > 0) {
    console.log(
      `[Briefings Scheduler] User ${settings.userId}: weekly already generating, skipping`,
    );
    return;
  }

  console.log(
    `[Briefings Scheduler] User ${settings.userId}: firing weekly_market_audio`,
  );
  try {
    await startBriefingGeneration("weekly_market_audio", { userId: settings.userId });
    await db
      .update(userSettings)
      .set({ autoWeeklyBriefingLastRun: now })
      .where(eq(userSettings.userId, settings.userId));
  } catch (err: any) {
    console.error(
      `[Briefings Scheduler] User ${settings.userId} weekly failed to start:`,
      err?.message ?? err,
    );
  }
}
