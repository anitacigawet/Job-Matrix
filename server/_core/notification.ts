import { readSettings } from "./settings";

/**
 * Local-first notification dispatcher. Every notification remains visible in
 * the server log; when the user has configured Slack, the same human-readable
 * payload is posted to that private incoming webhook.
 */

export type NotificationPayload = {
  title: string;
  content: string;
  /** Explicit opt-in: ordinary scan/briefing console notices stay local. */
  slack?: boolean;
};

export async function notifyOwner(payload: NotificationPayload): Promise<boolean> {
  const title = payload.title?.trim() ?? "";
  const content = payload.content?.trim() ?? "";
  if (!title || !content) return false;
  console.log("─── notification ───");
  console.log(title);
  console.log(content);
  console.log("────────────────────");

  const webhookUrl = payload.slack ? readSettings().slack?.webhookUrl : undefined;
  if (!webhookUrl) return true;

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `*${title}*\n${content}`,
        unfurl_links: false,
        unfurl_media: false,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error(`[Notification] Slack rejected the message (${response.status}).`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[Notification] Slack delivery failed:", error);
    return false;
  }
}
