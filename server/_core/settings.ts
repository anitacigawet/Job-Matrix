import fs from "node:fs";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { ENV, DEFAULT_PROVIDER, PROVIDER_DEFAULT_MODEL, PROVIDER_ORDER, type ProviderId } from "./env";
import { getDb } from "../db";
import { userSecretSettings } from "../../drizzle/schema";

/**
 * Per-source credential shapes for Tier-1 data sources. Each entry holds
 * exactly the keys that source needs — no shared bag. Sources with no
 * auth (Remotive, RemoteOK, The Muse) don't appear here at all.
 *
 * Extending: add a new key here AND wire reads in the matching adapter
 * under `server/sources/`. The Settings UI auto-renders fields from the
 * `getDataSourcesForApi()` descriptor; no UI change needed per-source.
 */
export type DataSourceCredentials = {
  adzuna?: { appId?: string; appKey?: string };
  usajobs?: { email?: string; apiKey?: string };
  jooble?: { apiKey?: string };
  themuse?: { apiKey?: string };
};

export type AppSettings = {
  /** Currently selected provider. Falls back to DEFAULT_PROVIDER if unset. */
  activeProvider?: ProviderId;

  geminiKey?: string;
  geminiModel?: string;

  openaiKey?: string;
  openaiModel?: string;

  deepseekKey?: string;
  deepseekModel?: string;

  /** Optional per-provider rate limit (requests per second). 0 disables. */
  rateLimitRps?: number;

  /**
   * Tier-1 data sources (Phase 13 — see DECISIONS.md D-019). Nested by source
   * id; each entry holds the fields that source's credentials use.
   */
  dataSources?: DataSourceCredentials;

  /** Personal Gmail connection used by the local response watcher. */
  gmail?: {
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    email?: string;
    connectedAt?: string;
  };

  /** One-way notification destination. The webhook URL is treated as a secret. */
  slack?: {
    webhookUrl?: string;
  };

  /** @deprecated Phase 13 flat fields; migrated into dataSources.adzuna on read. */
  adzunaAppId?: string;
  /** @deprecated Phase 13 flat fields; migrated into dataSources.adzuna on read. */
  adzunaAppKey?: string;
};

let cached: AppSettings | null = null;
const hostedSettings = new AsyncLocalStorage<AppSettings>();

function encryptionKey(): Buffer {
  const key = Buffer.from(ENV.settingsEncryptionKey, "base64");
  if (key.length !== 32) throw new Error("SETTINGS_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

function encryptSettings(settings: AppSettings) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(settings), "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptSettings(row: { ciphertext: string; iv: string; authTag: string }): AppSettings {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(row.iv, "base64"));
  decipher.setAuthTag(Buffer.from(row.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(row.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as AppSettings;
}

export async function runWithUserSettings<T>(userId: number, operation: () => Promise<T>): Promise<T> {
  if (!ENV.hostedMode) return operation();
  const db = await getDb();
  const [row] = await db.select().from(userSecretSettings).where(eq(userSecretSettings.userId, userId)).limit(1);
  const settings = row ? decryptSettings(row) : {};
  return hostedSettings.run(settings, operation);
}

export async function saveUserSettings(userId: number, next: Partial<AppSettings>): Promise<AppSettings> {
  if (!ENV.hostedMode) return writeSettings(next);
  const current = hostedSettings.getStore() ?? {};
  const merged = { ...current, ...next };
  const encrypted = encryptSettings(merged);
  const db = await getDb();
  await db.insert(userSecretSettings).values({ userId, ...encrypted, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: userSecretSettings.userId,
      set: { ...encrypted, updatedAt: new Date() },
    });
  Object.assign(current, merged);
  return merged;
}

async function replaceUserSettings(userId: number, replacement: AppSettings): Promise<AppSettings> {
  const encrypted = encryptSettings(replacement);
  const db = await getDb();
  await db.insert(userSecretSettings).values({ userId, ...encrypted, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: userSecretSettings.userId,
      set: { ...encrypted, updatedAt: new Date() },
    });
  const store = hostedSettings.getStore();
  if (store) {
    for (const key of Object.keys(store) as Array<keyof AppSettings>) delete store[key];
    Object.assign(store, replacement);
  }
  return replacement;
}

export function settingsWithoutProviderKey(settings: AppSettings, provider: ProviderId): AppSettings {
  const next = { ...settings };
  if (provider === "gemini") delete next.geminiKey;
  if (provider === "openai") delete next.openaiKey;
  if (provider === "deepseek") delete next.deepseekKey;
  return next;
}

export async function removeUserProviderKey(userId: number, provider: ProviderId): Promise<AppSettings> {
  const current = hostedSettings.getStore() ?? {};
  return replaceUserSettings(userId, settingsWithoutProviderKey(current, provider));
}

function ensureDir(): void {
  const dir = path.dirname(ENV.settingsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function readSettings(): AppSettings {
  if (ENV.hostedMode) return hostedSettings.getStore() ?? {};
  if (cached) return cached;
  try {
    if (fs.existsSync(ENV.settingsPath)) {
      const raw = fs.readFileSync(ENV.settingsPath, "utf-8");
      const parsed = JSON.parse(raw) as AppSettings & {
        // legacy field names from the DeepSeek-only era; accepted for backward compat
        deepseekRateLimitEnabled?: boolean;
        deepseekRateLimitRps?: number;
      };

      // Backward-compat: pre-multi-provider settings only have a deepseekKey
      // and deepseek rate-limit fields. Carry them forward and pin the active
      // provider to deepseek so the user is not silently switched.
      if (!parsed.activeProvider && parsed.deepseekKey) {
        parsed.activeProvider = "deepseek";
      }
      if (parsed.rateLimitRps === undefined && parsed.deepseekRateLimitRps !== undefined) {
        parsed.rateLimitRps = parsed.deepseekRateLimitEnabled === false ? 0 : parsed.deepseekRateLimitRps;
      }

      // Phase 13 expansion: migrate flat adzunaAppId / adzunaAppKey from
      // the first D13.3 shape into the nested `dataSources.adzuna` shape.
      // Old fields are left in place for one cycle so a downgrade still
      // reads them; `clearDataSource` removes both forms.
      if (parsed.adzunaAppId || parsed.adzunaAppKey) {
        parsed.dataSources = parsed.dataSources ?? {};
        parsed.dataSources.adzuna = parsed.dataSources.adzuna ?? {};
        if (parsed.adzunaAppId && !parsed.dataSources.adzuna.appId) {
          parsed.dataSources.adzuna.appId = parsed.adzunaAppId;
        }
        if (parsed.adzunaAppKey && !parsed.dataSources.adzuna.appKey) {
          parsed.dataSources.adzuna.appKey = parsed.adzunaAppKey;
        }
      }

      cached = parsed;
      return cached;
    }
  } catch (err) {
    console.warn("[Settings] Failed to read settings.json:", err);
  }
  cached = {};
  return cached;
}

export function writeSettings(next: Partial<AppSettings>): AppSettings {
  if (ENV.hostedMode) throw new Error("Hosted settings must be saved to the signed-in account.");
  ensureDir();
  const merged = { ...readSettings(), ...next };
  const pendingPath = `${ENV.settingsPath}.${process.pid}.pending`;
  const handle = fs.openSync(pendingPath, "w", 0o600);
  try {
    fs.writeFileSync(handle, JSON.stringify(merged, null, 2), "utf-8");
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  fs.renameSync(pendingPath, ENV.settingsPath);
  // Existing files retain their old mode when overwritten. Tighten it now that
  // this file can also hold an OAuth refresh token and Slack webhook secret.
  try {
    fs.chmodSync(ENV.settingsPath, 0o600);
  } catch {
    // Windows does not implement POSIX permission bits; the app remains
    // local-only there and the write above still succeeds.
  }
  cached = merged;
  return merged;
}

export function updateGmailSettings(
  next: Partial<NonNullable<AppSettings["gmail"]>>,
): AppSettings {
  const current = readSettings();
  return writeSettings({ gmail: { ...(current.gmail ?? {}), ...next } });
}

export function clearGmailConnection(): AppSettings {
  const current = readSettings();
  const gmail = { ...(current.gmail ?? {}) };
  delete gmail.refreshToken;
  delete gmail.email;
  delete gmail.connectedAt;
  return writeSettings({ gmail });
}

export function updateSlackSettings(webhookUrl?: string): AppSettings {
  return writeSettings({ slack: webhookUrl ? { webhookUrl } : {} });
}

export function clearProviderKey(provider: ProviderId): void {
  ensureDir();
  const current = readSettings();
  if (provider === "gemini") delete current.geminiKey;
  if (provider === "openai") delete current.openaiKey;
  if (provider === "deepseek") delete current.deepseekKey;
  writeSettings(current);
}

/** Active provider: env wins, then settings file, then default. */
export function resolveActiveProvider(): ProviderId {
  if (!ENV.hostedMode && ENV.llmProvider) return ENV.llmProvider;
  return readSettings().activeProvider ?? DEFAULT_PROVIDER;
}

export function resolveProviderKey(provider: ProviderId): string | undefined {
  const fromEnv =
    provider === "gemini" ? ENV.geminiKey :
    provider === "openai" ? ENV.openaiKey :
    ENV.deepseekKey;
  if (!ENV.hostedMode && fromEnv) return fromEnv;

  const settings = readSettings();
  const stored =
    provider === "gemini" ? settings.geminiKey :
    provider === "openai" ? settings.openaiKey :
    settings.deepseekKey;
  return stored && stored.length > 0 ? stored : undefined;
}

export function resolveProviderModel(provider: ProviderId): string {
  const fromEnv =
    provider === "gemini" ? ENV.geminiModel :
    provider === "openai" ? ENV.openaiModel :
    ENV.deepseekModel;
  if (!ENV.hostedMode && fromEnv) return fromEnv;

  const settings = readSettings();
  const stored =
    provider === "gemini" ? settings.geminiModel :
    provider === "openai" ? settings.openaiModel :
    settings.deepseekModel;
  return stored && stored.length > 0 ? stored : PROVIDER_DEFAULT_MODEL[provider];
}

export function resolveRateLimitRps(): number {
  const v = readSettings().rateLimitRps;
  return typeof v === "number" ? v : 0;
}

function maskKey(key?: string): string | null {
  if (!key) return null;
  if (key.length <= 12) return "•".repeat(key.length);
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}

export function getSettingsForApi() {
  const active = resolveActiveProvider();

  const providers = PROVIDER_ORDER.map((p) => {
    const key = resolveProviderKey(p);
    const envKey =
      p === "gemini" ? ENV.geminiKey :
      p === "openai" ? ENV.openaiKey :
      ENV.deepseekKey;
    return {
      id: p,
      hasKey: !!key,
      keyMasked: maskKey(key),
      model: resolveProviderModel(p),
      defaultModel: PROVIDER_DEFAULT_MODEL[p],
      keySource: !ENV.hostedMode && envKey ? ("env" as const) : (key ? ("settings" as const) : ("none" as const)),
    };
  });

  return {
    activeProvider: active,
    activeProviderSource: !ENV.hostedMode && ENV.llmProvider ? ("env" as const) : ("settings" as const),
    rateLimitRps: resolveRateLimitRps(),
    providers,
  };
}
