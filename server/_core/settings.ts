import fs from "node:fs";
import path from "node:path";
import { ENV, DEFAULT_PROVIDER, PROVIDER_DEFAULT_MODEL, PROVIDER_ORDER, type ProviderId } from "./env";

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
   * Tier-1 data sources. Nested by source
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

  /** @deprecated Flat field; migrated into dataSources.adzuna on read. */
  adzunaAppId?: string;
  /** @deprecated Flat field; migrated into dataSources.adzuna on read. */
  adzunaAppKey?: string;
};

let cached: AppSettings | null = null;

function ensureDir(): void {
  const dir = path.dirname(ENV.settingsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function readSettings(): AppSettings {
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

      // Migrate flat adzunaAppId / adzunaAppKey into the nested
      // `dataSources.adzuna` shape.
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

/** Remove all settings saved by Job Matrix and clear the in-process cache. */
export function clearStoredSettings(): void {
  if (fs.existsSync(ENV.settingsPath)) {
    fs.unlinkSync(ENV.settingsPath);
  }
  cached = {};
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
  if (ENV.llmProvider) return ENV.llmProvider;
  return readSettings().activeProvider ?? DEFAULT_PROVIDER;
}

export function resolveProviderKey(provider: ProviderId): string | undefined {
  const fromEnv =
    provider === "gemini" ? ENV.geminiKey :
    provider === "openai" ? ENV.openaiKey :
    ENV.deepseekKey;
  if (fromEnv) return fromEnv;

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
  if (fromEnv) return fromEnv;

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
      keySource: envKey ? ("env" as const) : (key ? ("settings" as const) : ("none" as const)),
    };
  });

  return {
    activeProvider: active,
    activeProviderSource: ENV.llmProvider ? ("env" as const) : ("settings" as const),
    rateLimitRps: resolveRateLimitRps(),
    providers,
  };
}
