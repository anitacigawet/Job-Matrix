/**
 * Auto-Scan Scheduler
 * Runs in the background on the server, checking every 5 minutes if any user
 * has an auto-scan due. When due, triggers Global Search + optional AI Job Filtering.
 */
import { eq, and, lte, isNotNull } from "drizzle-orm";
import { getDb } from "./db";
import { userSettings, type UserSettings } from "../drizzle/schema";
import { notifyOwner } from "./_core/notification";
import { assertOperationActive, withWorkspaceOperation } from "./operation-lifecycle";

// Check interval: every 5 minutes
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

/**
 * Start the auto-scan scheduler
 */
export function startAutoScanScheduler() {
  if (schedulerInterval) {
    console.log("[AutoScan] Scheduler already running");
    return;
  }

  console.log("[AutoScan] Starting scheduler (check every 5 min)");

  // Run immediately on start, then every 5 minutes
  checkAndRunDueScans();
  schedulerInterval = setInterval(checkAndRunDueScans, CHECK_INTERVAL_MS);
}

/**
 * Stop the auto-scan scheduler
 */
export function stopAutoScanScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[AutoScan] Scheduler stopped");
  }
}

/**
 * Check for due auto-scans and run them
 */
async function checkAndRunDueScans() {
  try {
    await withWorkspaceOperation(runDueScans);
  } catch (error) {
    console.error("[AutoScan] Check stopped:", error);
  }
}

async function runDueScans() {
  if (isRunning) {
    console.log("[AutoScan] Previous check still running, skipping");
    return;
  }

  isRunning = true;

  try {
    const db = await getDb();
    if (!db) {
      console.log("[AutoScan] Database not available, skipping");
      return;
    }

    const now = new Date();

    // Find all users with auto-scan enabled and next_run <= now
    const dueSettings = await db
      .select()
      .from(userSettings)
      .where(
        and(
          eq(userSettings.autoScanEnabled, 1),
          isNotNull(userSettings.autoScanNextRun),
          lte(userSettings.autoScanNextRun, now)
        )
      );

    if (dueSettings.length === 0) {
      return; // No scans due, silent return
    }

    console.log(`[AutoScan] Found ${dueSettings.length} due auto-scan(s)`);

    for (const settings of dueSettings) {
      try {
        await runAutoScanForUser(settings.userId, settings);
      } catch (error: any) {
        console.error(`[AutoScan] Error for user ${settings.userId}:`, error.message);
      }
    }
  } catch (error: any) {
    console.error("[AutoScan] Scheduler error:", error.message);
  } finally {
    isRunning = false;
  }
}

/**
 * Run auto-scan for a specific user
 */
export async function runAutoScanForUser(userId: number, settings: UserSettings) {
  return withWorkspaceOperation(() => executeAutoScanForUser(userId, settings));
}

async function executeAutoScanForUser(userId: number, settings: UserSettings) {
  const db = await getDb();

  console.log(`[AutoScan] Running auto-scan for user ${userId}`);
  const scanStartedAt = new Date();
  const nextRun = calculateNextRun(settings.autoScanFrequency);
  let totalJobsFound = 0;
  let totalNewJobs = 0;
  let aiEligible = 0;
  let aiTotal = 0;
  const errors: string[] = [];

  try {
    // Use the same tRPC procedures as the dashboard. This keeps enabled
    // sources, profile locations/radius, active titles,
    // persistence, progress history, and the three-stage AI filter identical.
    const [{ appRouter }, { createInternalContext }] = await Promise.all([
      import("./routers"),
      import("./_core/context"),
    ]);
    const caller = appRouter.createCaller(await createInternalContext(userId));
    const scan = await caller.personalized.runGlobalSearch();
    assertOperationActive();
    totalJobsFound = scan.totalJobsFound;
    totalNewJobs = scan.newJobsFound;
    if (!scan.success) errors.push(scan.message);

    if (settings.autoScanIncludeAI && totalNewJobs > 0) {
      const analysis = await caller.personalized.runAIAnalysis();
      aiEligible = analysis.eligible;
      aiTotal = analysis.totalAnalyzed;
    }
  } catch (err: any) {
    console.error(`[AutoScan] Scan failed for user ${userId}:`, err.message);
    errors.push(err.message);
  }

  // Send notification if enabled
  assertOperationActive();
  const [notifSettings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (notifSettings?.notificationsEnabled && notifSettings?.notifyOnScanComplete) {
    const title = `Auto-Scan Complete: ${totalNewJobs} new jobs found`;
    let content = `Your scheduled job scan has completed.\n\n`;
    content += `Total jobs found: ${totalJobsFound}\n`;
    content += `New jobs found: ${totalNewJobs}\n`;
    if (settings.autoScanIncludeAI) {
      content += `AI-eligible jobs: ${aiEligible} of ${aiTotal} analyzed\n`;
    }
    if (errors.length > 0) {
      content += `\nWarnings: ${errors.join("; ")}`;
    }
    content += `\nNext scan: ${nextRun.toLocaleString()}`;

    assertOperationActive();
    await notifyOwner({ title, content });
  }

  // If new eligible jobs found, send a separate notification
  if (notifSettings?.notificationsEnabled && notifSettings?.notifyOnNewEligible && aiEligible > 0) {
    assertOperationActive();
    await notifyOwner({
      title: `${aiEligible} New Eligible Jobs Found!`,
      content: `Your auto-scan found ${aiEligible} new jobs that match your profile criteria. Check your dashboard to review them.`,
    });
  }

  // Update last run time and schedule next run only after work completes.
  await db
    .update(userSettings)
    .set({
      autoScanLastRun: scanStartedAt,
      autoScanNextRun: nextRun,
    })
    .where(eq(userSettings.userId, userId));

  console.log(`[AutoScan] User ${userId} complete: ${totalJobsFound} found, ${totalNewJobs} new, ${aiEligible} eligible`);
}

/**
 * Calculate the next auto-scan run time based on frequency
 */
function calculateNextRun(frequency: string): Date {
  const now = new Date();
  switch (frequency) {
    case "every_6h":
      return new Date(now.getTime() + 6 * 60 * 60 * 1000);
    case "every_12h":
      return new Date(now.getTime() + 12 * 60 * 60 * 1000);
    case "daily":
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case "every_2d":
      return new Date(now.getTime() + 48 * 60 * 60 * 1000);
    case "weekly":
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
}
