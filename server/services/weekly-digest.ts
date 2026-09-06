/**
 * Weekly Digest Service
 * Sends a summary notification with new eligible jobs, top fit scores,
 * and application pipeline stats.
 */
import { eq, and, gte, desc, sql, InferSelectModel } from "drizzle-orm";
import { getDb } from "../db";
import { trackedJobs, userSettings, applicationNotes } from "../../drizzle/schema";

type TrackedJob = InferSelectModel<typeof trackedJobs>;
import { notifyOwner } from "../_core/notification";
import { assertOperationActive, withWorkspaceOperation } from "../operation-lifecycle";

// Check every hour if a weekly digest is due
const DIGEST_CHECK_INTERVAL_MS = 60 * 60 * 1000;

let digestInterval: ReturnType<typeof setInterval> | null = null;

export function startWeeklyDigestScheduler() {
  if (digestInterval) return;
  console.log("[WeeklyDigest] Starting scheduler (check every hour)");
  checkAndSendDigests();
  digestInterval = setInterval(checkAndSendDigests, DIGEST_CHECK_INTERVAL_MS);
}

export function stopWeeklyDigestScheduler() {
  if (digestInterval) {
    clearInterval(digestInterval);
    digestInterval = null;
    console.log("[WeeklyDigest] Scheduler stopped");
  }
}

async function checkAndSendDigests() {
  try {
    await withWorkspaceOperation(sendDueDigests);
  } catch (error) {
    console.error("[WeeklyDigest] Check stopped:", error);
  }
}

async function sendDueDigests() {
  try {
    const db = await getDb();
    if (!db) return;

    // Find users with digest enabled
    const settings = await db
      .select()
      .from(userSettings)
      .where(
        and(
          eq(userSettings.notificationsEnabled, 1),
          eq(userSettings.notifyDigestFrequency, "weekly")
        )
      );

    if (settings.length === 0) return;

    const now = new Date();
    // Send weekly digest only during Monday 9AM hour (server local time).
    // This avoids relying on unrelated settings.updatedAt writes as a digest clock.
    const isDigestWindow = now.getDay() === 1 && now.getHours() === 9;
    if (!isDigestWindow) return;
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    for (const setting of settings) {
      try {
        await sendDigestForUser(setting.userId, oneWeekAgo);
      } catch (err: any) {
        console.error(`[WeeklyDigest] Error for user ${setting.userId}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error("[WeeklyDigest] Scheduler error:", err.message);
  }
}

async function sendDigestForUser(userId: number, since: Date) {
  const db = await getDb();
  if (!db) return;

  // Get new jobs tracked this week
  const newJobs = await db
    .select()
    .from(trackedJobs)
    .where(
      and(
        eq(trackedJobs.userId, userId),
        gte(trackedJobs.firstSeenAt, since)
      )
    );

  // Count eligible jobs (those with aiAnalysis.eligible = true)
  const eligibleJobs = newJobs.filter(j => {
    const analysis = j.aiAnalysis as any;
    return analysis?.eligible === true;
  });

  // Get top fit scores
  const topFitJobs = eligibleJobs
    .filter(j => {
      const analysis = j.aiAnalysis as any;
      return analysis?.fitScore != null || analysis?.fitScore?.overall != null;
    })
    .sort((a, b) => {
      const aAnalysis = a.aiAnalysis as any;
      const bAnalysis = b.aiAnalysis as any;
      const aScore = Number(aAnalysis?.fitScore?.overall ?? aAnalysis?.fitScore ?? 0);
      const bScore = Number(bAnalysis?.fitScore?.overall ?? bAnalysis?.fitScore ?? 0);
      return bScore - aScore;
    })
    .slice(0, 5);

  // Get application notes count this week
  const recentNotes = await db
    .select({ count: sql<number>`count(*)` })
    .from(applicationNotes)
    .where(
      and(
        eq(applicationNotes.userId, userId),
        gte(applicationNotes.createdAt, since)
      )
    );

  const noteCount = Number(recentNotes[0]?.count || 0);

  // Build the digest content
  let title = `Weekly Job Hunt Digest`;
  let content = `Here's your weekly summary for the past 7 days:\n\n`;

  content += `**New Jobs Found:** ${newJobs.length}\n`;
  content += `**Eligible (AI-Approved):** ${eligibleJobs.length}\n`;
  content += `**Application Notes Added:** ${noteCount}\n\n`;

  if (topFitJobs.length > 0) {
    content += `**Top Matches by Match Score:**\n`;
    topFitJobs.forEach((job, i) => {
      const analysis = job.aiAnalysis as any;
      const score = Number(analysis?.fitScore?.overall ?? analysis?.fitScore ?? 0);
      content += `${i + 1}. ${job.title} at ${job.company} — ${score}% fit\n`;
    });
    content += `\n`;
  }

  // Platform breakdown
  const platformCounts: Record<string, number> = {};
  newJobs.forEach(j => {
    const platform = j.platform || "indeed";
    platformCounts[platform] = (platformCounts[platform] || 0) + 1;
  });
  if (Object.keys(platformCounts).length > 0) {
    content += `**Jobs by Platform:**\n`;
    Object.entries(platformCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([platform, count]) => {
        content += `• ${platform.charAt(0).toUpperCase() + platform.slice(1)}: ${count}\n`;
      });
    content += `\n`;
  }

  if (newJobs.length === 0 && eligibleJobs.length === 0) {
    content += `No new jobs were found this week. Consider adjusting your search criteria or enabling more platforms.\n`;
  } else {
    content += `Visit your dashboard to review these jobs and take action.\n`;
  }

  assertOperationActive();
  await notifyOwner({ title, content });
  console.log(`[WeeklyDigest] Sent digest for user ${userId}: ${newJobs.length} new, ${eligibleJobs.length} eligible`);
}
