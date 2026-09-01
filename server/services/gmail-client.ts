import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { userSettings } from "../../drizzle/schema";
import { LOCAL_USER_ID, getDb } from "../db";
import {
  clearGmailConnection,
  readSettings,
  updateGmailSettings,
} from "../_core/settings";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_ROOT = "https://gmail.googleapis.com/gmail/v1";
const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

type PendingAuthorization = {
  callbackUrl: string;
  expiresAt: number;
};

const pendingAuthorizations = new Map<string, PendingAuthorization>();

function requireLoopbackOrigin(origin: string): string {
  const parsed = new URL(origin);
  const isLoopback = parsed.protocol === "http:" &&
    (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost");
  if (!isLoopback || parsed.username || parsed.password || parsed.pathname !== "/") {
    throw new Error("Gmail can only be connected from the local Job Matrix address.");
  }
  return parsed.origin;
}

function requireGmailClient() {
  const gmail = readSettings().gmail;
  if (!gmail?.clientId || !gmail.clientSecret) {
    throw new Error("Save your Google desktop OAuth credentials before connecting Gmail.");
  }
  return gmail as Required<Pick<NonNullable<typeof gmail>, "clientId" | "clientSecret">> & typeof gmail;
}

async function parseGoogleResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const detail = typeof payload.error_description === "string"
      ? payload.error_description
      : typeof payload.error === "string"
        ? payload.error
        : `Google request failed (${response.status})`;
    throw new Error(detail);
  }
  return payload as T;
}

export function getGmailConnectionSummary() {
  const gmail = readSettings().gmail;
  return {
    clientConfigured: !!gmail?.clientId && !!gmail.clientSecret,
    connected: !!gmail?.refreshToken,
    email: gmail?.email ?? null,
    connectedAt: gmail?.connectedAt ?? null,
    clientIdMasked: gmail?.clientId
      ? `${gmail.clientId.slice(0, 10)}…${gmail.clientId.slice(-8)}`
      : null,
  };
}

export function createGmailAuthorizationUrl(origin: string): string {
  const gmail = requireGmailClient();
  const safeOrigin = requireLoopbackOrigin(origin);
  const callbackUrl = `${safeOrigin}/oauth/gmail/callback`;
  const state = randomBytes(24).toString("hex");
  const now = Date.now();

  for (const [key, pending] of pendingAuthorizations) {
    if (pending.expiresAt <= now) pendingAuthorizations.delete(key);
  }
  pendingAuthorizations.set(state, { callbackUrl, expiresAt: now + 10 * 60_000 });

  const params = new URLSearchParams({
    client_id: gmail.clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: GMAIL_READONLY_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function completeGmailAuthorization(code: string, state: string) {
  const pending = pendingAuthorizations.get(state);
  pendingAuthorizations.delete(state);
  if (!pending || pending.expiresAt <= Date.now()) {
    throw new Error("This Gmail connection request expired. Return to Job Matrix and try again.");
  }

  const gmail = requireGmailClient();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: gmail.clientId,
      client_secret: gmail.clientSecret,
      redirect_uri: pending.callbackUrl,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const tokens = await parseGoogleResponse<{
    access_token: string;
    refresh_token?: string;
  }>(response);

  const refreshToken = tokens.refresh_token ?? gmail.refreshToken;
  if (!refreshToken) {
    throw new Error("Google did not return a refresh token. Reconnect and approve access when prompted.");
  }

  const profile = await gmailApiRequest<{
    emailAddress: string;
    historyId: string;
  }>("/users/me/profile", tokens.access_token);

  updateGmailSettings({
    refreshToken,
    email: profile.emailAddress,
    connectedAt: new Date().toISOString(),
  });

  // Establish the cursor at connection time so the first watcher pass does not
  // import an old inbox or miss messages that arrive before the scheduler runs.
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, LOCAL_USER_ID))
    .limit(1);
  if (!existing) await db.insert(userSettings).values({ userId: LOCAL_USER_ID });
  await db
    .update(userSettings)
    .set({ gmailHistoryId: profile.historyId, inboxLastCheckedAt: new Date() })
    .where(eq(userSettings.userId, LOCAL_USER_ID));

  return { email: profile.emailAddress };
}

export async function getGmailAccessToken(): Promise<string> {
  const gmail = requireGmailClient();
  if (!gmail.refreshToken) throw new Error("Gmail is not connected.");

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: gmail.clientId,
      client_secret: gmail.clientSecret,
      refresh_token: gmail.refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const tokens = await parseGoogleResponse<{ access_token: string }>(response);
  return tokens.access_token;
}

export async function gmailApiRequest<T>(
  path: string,
  accessToken?: string,
): Promise<T> {
  const token = accessToken ?? await getGmailAccessToken();
  const response = await fetch(`${GMAIL_API_ROOT}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  return parseGoogleResponse<T>(response);
}

export function disconnectGmail(): void {
  clearGmailConnection();
}

