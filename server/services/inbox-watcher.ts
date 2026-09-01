import { eq } from "drizzle-orm";
import { userSettings } from "../../drizzle/schema";
import { getDb } from "../db";
import { getGmailConnectionSummary } from "./gmail-client";
import { pollGmailInboxForUser } from "./application-inbox";

const CHECK_INTERVAL_MS = 5 * 60 * 1_000;
let interval: ReturnType<typeof setInterval> | null = null;
let checking = false;

export function startInboxWatcher(): void {
  if (interval) return;
  console.log("[Inbox] Starting Gmail watcher (check every 5 min while Job Matrix is running)");
  void tick();
  interval = setInterval(() => void tick(), CHECK_INTERVAL_MS);
}

export function stopInboxWatcher(): void {
  if (!interval) return;
  clearInterval(interval);
  interval = null;
}

async function tick(): Promise<void> {
  if (checking || !getGmailConnectionSummary().connected) return;
  checking = true;
  try {
    const db = await getDb();
    const enabled = await db.select().from(userSettings).where(eq(userSettings.inboxMonitoringEnabled, 1));
    for (const settings of enabled) {
      try {
        await pollGmailInboxForUser(settings.userId);
      } catch (error) {
        console.error(`[Inbox] Poll failed for user ${settings.userId}:`, error);
      }
    }
  } finally {
    checking = false;
  }
}
