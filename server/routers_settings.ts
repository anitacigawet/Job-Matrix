import { z } from "zod";
import { eq } from "drizzle-orm";
import { router, protectedProcedure, publicProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { userSettings } from "../drizzle/schema";
import { notifyOwner } from "./_core/notification";
import {
  clearProviderKey,
  getSettingsForApi,
  resolveProviderKey,
  resolveProviderModel,
  writeSettings,
  readSettings,
  type AppSettings,
} from "./_core/settings";
import { PROVIDER_ORDER, ENV, type ProviderId } from "./_core/env";

const providerSchema = z.enum(PROVIDER_ORDER as [ProviderId, ...ProviderId[]]);

// Tier-1 data sources (Phase 13 — see DECISIONS.md D-019). Add an entry here
// when a new Tier-1 source ships and wire it up in data-source-tester.ts.
// "credentialed" subset is enforced by Zod when saving — sources without
// credentials (remotive, remoteok) don't need a save path.
const CREDENTIALED_SOURCE_IDS = [
  "adzuna",
  "usajobs",
  "jooble",
  "themuse",
] as const;
type DataSourceId = (typeof CREDENTIALED_SOURCE_IDS)[number];
const dataSourceSchema = z.enum(CREDENTIALED_SOURCE_IDS);

function maskCredential(value?: string): string | null {
  if (!value) return null;
  if (value.length <= 8) return "•".repeat(value.length);
  return `${value.slice(0, 4)}…${value.slice(-2)}`;
}

interface SourceFieldDescriptor {
  name: string;
  label: string;
  inputType: "text" | "password" | "email";
  placeholder?: string;
  valueMasked: string | null;
  required: boolean;
}

interface DataSourceDescriptor {
  id: DataSourceId | "remotive" | "remoteok";
  label: string;
  tier: 1;
  configured: boolean;
  source: "env" | "settings" | "none";
  signupUrl: string | null;
  fields: SourceFieldDescriptor[];
  /** Sources without credentials still appear here so the UI can show "no setup needed". */
  noAuthRequired: boolean;
}

function getDataSourcesForApi(): { sources: DataSourceDescriptor[] } {
  const settings = readSettings();
  const ds = settings.dataSources ?? {};

  // ── Adzuna ────────────────────────────────────────────────
  const adzunaAppId =
    ENV.adzunaAppId || ds.adzuna?.appId || settings.adzunaAppId || "";
  const adzunaAppKey =
    ENV.adzunaAppKey || ds.adzuna?.appKey || settings.adzunaAppKey || "";
  const adzunaSourceOrigin: DataSourceDescriptor["source"] =
    ENV.adzunaAppId && ENV.adzunaAppKey
      ? "env"
      : adzunaAppId && adzunaAppKey
        ? "settings"
        : "none";

  // ── USAJobs ───────────────────────────────────────────────
  const usajobsEmail = ENV.usajobsEmail || ds.usajobs?.email || "";
  const usajobsApiKey = ENV.usajobsApiKey || ds.usajobs?.apiKey || "";
  const usajobsSourceOrigin: DataSourceDescriptor["source"] =
    ENV.usajobsEmail && ENV.usajobsApiKey
      ? "env"
      : usajobsEmail && usajobsApiKey
        ? "settings"
        : "none";

  // ── Jooble ────────────────────────────────────────────────
  const joobleApiKey = ENV.joobleApiKey || ds.jooble?.apiKey || "";
  const joobleSourceOrigin: DataSourceDescriptor["source"] = ENV.joobleApiKey
    ? "env"
    : joobleApiKey
      ? "settings"
      : "none";

  // ── The Muse (optional key — raises rate limit) ───────────
  const themuseApiKey = ENV.themuseApiKey || ds.themuse?.apiKey || "";
  const themuseSourceOrigin: DataSourceDescriptor["source"] = ENV.themuseApiKey
    ? "env"
    : themuseApiKey
      ? "settings"
      : "none";

  return {
    sources: [
      {
        id: "adzuna",
        label: "Adzuna",
        tier: 1,
        configured: !!adzunaAppId && !!adzunaAppKey,
        source: adzunaSourceOrigin,
        signupUrl: "https://developer.adzuna.com/",
        noAuthRequired: false,
        fields: [
          {
            name: "appId",
            label: "App ID",
            inputType: "text",
            placeholder: "c17cfb68",
            valueMasked: maskCredential(adzunaAppId),
            required: true,
          },
          {
            name: "appKey",
            label: "App Key",
            inputType: "password",
            placeholder: "••••••••",
            valueMasked: maskCredential(adzunaAppKey),
            required: true,
          },
        ],
      },
      {
        id: "usajobs",
        label: "USAJobs",
        tier: 1,
        configured: !!usajobsEmail && !!usajobsApiKey,
        source: usajobsSourceOrigin,
        signupUrl: "https://developer.usajobs.gov/APIRequest/",
        noAuthRequired: false,
        fields: [
          {
            name: "email",
            label: "Email (User-Agent)",
            inputType: "email",
            placeholder: "you@example.com",
            valueMasked: maskCredential(usajobsEmail),
            required: true,
          },
          {
            name: "apiKey",
            label: "API Key",
            inputType: "password",
            placeholder: "••••••••",
            valueMasked: maskCredential(usajobsApiKey),
            required: true,
          },
        ],
      },
      {
        id: "jooble",
        label: "Jooble",
        tier: 1,
        configured: !!joobleApiKey,
        source: joobleSourceOrigin,
        signupUrl: "https://jooble.org/api/about",
        noAuthRequired: false,
        fields: [
          {
            name: "apiKey",
            label: "API Key (partner)",
            inputType: "password",
            placeholder: "••••••••",
            valueMasked: maskCredential(joobleApiKey),
            required: true,
          },
        ],
      },
      {
        id: "themuse",
        label: "The Muse",
        tier: 1,
        configured: true, // no-auth source — always usable; key just raises rate limit
        source: themuseSourceOrigin,
        signupUrl: "https://www.themuse.com/developers/api/v2",
        noAuthRequired: true,
        fields: [
          {
            name: "apiKey",
            label: "API Key (optional — raises rate limit)",
            inputType: "password",
            placeholder: "leave blank for no-auth tier",
            valueMasked: maskCredential(themuseApiKey),
            required: false,
          },
        ],
      },
      {
        id: "remotive",
        label: "Remotive",
        tier: 1,
        configured: true,
        source: "none",
        signupUrl: "https://remotive.com/api-documentation/",
        noAuthRequired: true,
        fields: [],
      },
      {
        id: "remoteok",
        label: "RemoteOK",
        tier: 1,
        configured: true,
        source: "none",
        signupUrl: "https://remoteok.com/api",
        noAuthRequired: true,
        fields: [],
      },
    ],
  };
}

export const settingsRouter = router({
  /**
   * Read LLM provider configuration: active provider, per-provider key/model
   * status, and rate limit. Keys are never returned in full.
   */
  getLlm: publicProcedure.query(() => getSettingsForApi()),

  /**
   * Save LLM provider configuration. Any subset of fields may be supplied;
   * the rest are preserved.
   */
  saveLlm: publicProcedure
    .input(
      z.object({
        activeProvider: providerSchema.optional(),
        geminiKey: z.string().trim().min(1).optional(),
        geminiModel: z.string().trim().min(1).optional(),
        openaiKey: z.string().trim().min(1).optional(),
        openaiModel: z.string().trim().min(1).optional(),
        deepseekKey: z.string().trim().min(1).optional(),
        deepseekModel: z.string().trim().min(1).optional(),
        rateLimitRps: z.number().min(0).optional(),
      })
    )
    .mutation(({ input }) => {
      writeSettings(input as Partial<AppSettings>);
      return getSettingsForApi();
    }),

  /**
   * Remove the saved API key for a specific provider. Env vars (if set)
   * still take effect for that provider.
   */
  clearProviderKey: publicProcedure
    .input(z.object({ provider: providerSchema }))
    .mutation(({ input }) => {
      clearProviderKey(input.provider);
      return getSettingsForApi();
    }),

  /**
   * Get user settings (creates default if none exist)
   */
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    let [settings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, ctx.user.id))
      .limit(1);

    // Auto-create defaults if no settings exist
    if (!settings) {
      await db.insert(userSettings).values({ userId: ctx.user.id });
      [settings] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id))
        .limit(1);
    }

    return settings;
  }),

  /**
   * Update notification settings
   */
  updateNotifications: protectedProcedure
    .input(
      z.object({
        notificationsEnabled: z.boolean().optional(),
        notifyOnNewEligible: z.boolean().optional(),
        notifyOnScanComplete: z.boolean().optional(),
        notifyDigestFrequency: z
          .enum(["immediate", "daily", "weekly", "never"])
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [existing] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id))
        .limit(1);

      if (!existing) {
        await db.insert(userSettings).values({ userId: ctx.user.id });
      }

      const updates: Record<string, any> = {};
      if (input.notificationsEnabled !== undefined)
        updates.notificationsEnabled = input.notificationsEnabled ? 1 : 0;
      if (input.notifyOnNewEligible !== undefined)
        updates.notifyOnNewEligible = input.notifyOnNewEligible ? 1 : 0;
      if (input.notifyOnScanComplete !== undefined)
        updates.notifyOnScanComplete = input.notifyOnScanComplete ? 1 : 0;
      if (input.notifyDigestFrequency !== undefined)
        updates.notifyDigestFrequency = input.notifyDigestFrequency;

      if (Object.keys(updates).length > 0) {
        await db
          .update(userSettings)
          .set(updates)
          .where(eq(userSettings.userId, ctx.user.id));
      }

      return { success: true };
    }),

  /**
   * Update auto-scan settings
   */
  updateAutoScan: protectedProcedure
    .input(
      z.object({
        autoScanEnabled: z.boolean().optional(),
        autoScanFrequency: z
          .enum(["every_6h", "every_12h", "daily", "every_2d", "weekly"])
          .optional(),
        autoScanIncludeAI: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [existing] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id))
        .limit(1);

      if (!existing) {
        await db.insert(userSettings).values({ userId: ctx.user.id });
      }

      const updates: Record<string, any> = {};
      if (input.autoScanEnabled !== undefined)
        updates.autoScanEnabled = input.autoScanEnabled ? 1 : 0;
      if (input.autoScanFrequency !== undefined)
        updates.autoScanFrequency = input.autoScanFrequency;
      if (input.autoScanIncludeAI !== undefined)
        updates.autoScanIncludeAI = input.autoScanIncludeAI ? 1 : 0;

      if (input.autoScanEnabled === true) {
        const freq =
          input.autoScanFrequency || existing?.autoScanFrequency || "daily";
        const nextRun = calculateNextRun(freq);
        updates.autoScanNextRun = nextRun;
      }

      if (input.autoScanEnabled === false) {
        updates.autoScanNextRun = null;
      }

      if (Object.keys(updates).length > 0) {
        await db
          .update(userSettings)
          .set(updates)
          .where(eq(userSettings.userId, ctx.user.id));
      }

      return { success: true };
    }),

  /**
   * Validate a provider's API key + model with a single tiny round-trip
   * before the user saves anything. Returns ok + human-readable message.
   * Does not touch saved settings.
   */
  testProvider: protectedProcedure
    .input(
      z.object({
        provider: z.enum(["gemini", "openai", "deepseek"]),
        apiKey: z.string(),
        model: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { testProviderConnection } = await import(
        "./services/provider-tester"
      );
      return testProviderConnection(input.provider, input.apiKey, input.model);
    }),

  /**
   * Validate the *saved* key + model for a provider. Used by the header-level
   * "Test" button (which tests the active provider with what's already in
   * settings.json or the env var) and as a fallback for the per-sub-tab
   * "Test Connection" button when the user hasn't re-typed their key — the
   * masked display value (`sk-...abc`) is not a real key and would always
   * fail the round-trip.
   */
  testSavedProvider: protectedProcedure
    .input(z.object({ provider: providerSchema }))
    .mutation(async ({ input }) => {
      const key = resolveProviderKey(input.provider);
      if (!key) {
        return {
          ok: false,
          message: `No API key saved for ${input.provider}. Enter one in the form below and click Save first.`,
          latencyMs: 0,
        };
      }
      const model = resolveProviderModel(input.provider);
      const { testProviderConnection } = await import(
        "./services/provider-tester"
      );
      return testProviderConnection(input.provider, key, model);
    }),

  // ── Tier-1 data sources (Phase 13 — D-019) ────────────────────────────
  /** Snapshot of every Tier-1 source: configured?, masked credentials, source (env|settings|none). */
  getDataSources: publicProcedure.query(() => getDataSourcesForApi()),

  /**
   * Save credentials for one Tier-1 source. `fields` is a per-source bag —
   * the server stores whichever keys the source descriptor declared. Unknown
   * keys are ignored.
   */
  saveDataSource: publicProcedure
    .input(
      z.object({
        source: dataSourceSchema,
        fields: z.record(z.string(), z.string().trim().min(1)),
      })
    )
    .mutation(({ input }) => {
      const current = readSettings();
      current.dataSources = current.dataSources ?? {};
      if (input.source === "adzuna") {
        current.dataSources.adzuna = current.dataSources.adzuna ?? {};
        if (input.fields.appId)
          current.dataSources.adzuna.appId = input.fields.appId;
        if (input.fields.appKey)
          current.dataSources.adzuna.appKey = input.fields.appKey;
      } else if (input.source === "usajobs") {
        current.dataSources.usajobs = current.dataSources.usajobs ?? {};
        if (input.fields.email)
          current.dataSources.usajobs.email = input.fields.email;
        if (input.fields.apiKey)
          current.dataSources.usajobs.apiKey = input.fields.apiKey;
      } else if (input.source === "jooble") {
        current.dataSources.jooble = current.dataSources.jooble ?? {};
        if (input.fields.apiKey)
          current.dataSources.jooble.apiKey = input.fields.apiKey;
      } else if (input.source === "themuse") {
        current.dataSources.themuse = current.dataSources.themuse ?? {};
        if (input.fields.apiKey)
          current.dataSources.themuse.apiKey = input.fields.apiKey;
      }
      writeSettings(current);
      return getDataSourcesForApi();
    }),

  /** Remove saved credentials for one Tier-1 source. Env vars (if set) still take effect. */
  clearDataSource: publicProcedure
    .input(z.object({ source: dataSourceSchema }))
    .mutation(({ input }) => {
      const current = readSettings();
      current.dataSources = current.dataSources ?? {};
      if (input.source === "adzuna") {
        delete current.dataSources.adzuna;
        // Also wipe legacy flat fields so they don't resurface on next read.
        delete current.adzunaAppId;
        delete current.adzunaAppKey;
      } else if (input.source === "usajobs") {
        delete current.dataSources.usajobs;
      } else if (input.source === "jooble") {
        delete current.dataSources.jooble;
      } else if (input.source === "themuse") {
        delete current.dataSources.themuse;
      }
      writeSettings(current);
      return getDataSourcesForApi();
    }),

  /**
   * Round-trip a single minimal request against the source to validate
   * credentials before save. Uses typed values when supplied; otherwise
   * falls back to saved/env credentials (mirrors testSavedProvider for the
   * LLM keys — D11.1a).
   */
  testDataSource: protectedProcedure
    .input(
      z.object({
        source: dataSourceSchema,
        fields: z.record(z.string(), z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { testDataSourceConnection } = await import(
        "./services/data-source-tester"
      );
      const settings = readSettings();
      const ds = settings.dataSources ?? {};
      const typed = input.fields ?? {};
      const typedHas = (k: string) => (typed[k]?.trim().length ?? 0) > 0;
      if (input.source === "adzuna") {
        const appId = typedHas("appId")
          ? typed.appId.trim()
          : ENV.adzunaAppId || ds.adzuna?.appId || settings.adzunaAppId || "";
        const appKey = typedHas("appKey")
          ? typed.appKey.trim()
          : ENV.adzunaAppKey ||
            ds.adzuna?.appKey ||
            settings.adzunaAppKey ||
            "";
        if (!appId || !appKey)
          return {
            ok: false,
            message:
              "No Adzuna credentials available. Enter app_id + app_key and Save first.",
            latencyMs: 0,
          };
        return testDataSourceConnection("adzuna", { appId, appKey });
      }
      if (input.source === "usajobs") {
        const email = typedHas("email")
          ? typed.email.trim()
          : ENV.usajobsEmail || ds.usajobs?.email || "";
        const apiKey = typedHas("apiKey")
          ? typed.apiKey.trim()
          : ENV.usajobsApiKey || ds.usajobs?.apiKey || "";
        if (!email || !apiKey)
          return {
            ok: false,
            message:
              "No USAJobs credentials. Enter email + API key and Save first.",
            latencyMs: 0,
          };
        return testDataSourceConnection("usajobs", { email, apiKey });
      }
      if (input.source === "jooble") {
        const apiKey = typedHas("apiKey")
          ? typed.apiKey.trim()
          : ENV.joobleApiKey || ds.jooble?.apiKey || "";
        if (!apiKey)
          return {
            ok: false,
            message:
              "No Jooble API key. Enter your partner key and Save first.",
            latencyMs: 0,
          };
        return testDataSourceConnection("jooble", { apiKey });
      }
      if (input.source === "themuse") {
        const apiKey = typedHas("apiKey")
          ? typed.apiKey.trim()
          : ENV.themuseApiKey || ds.themuse?.apiKey || "";
        // The Muse always works without a key — test confirms the optional key is valid.
        return testDataSourceConnection("themuse", { apiKey });
      }
      return {
        ok: false,
        message: `Unknown source: ${input.source}`,
        latencyMs: 0,
      };
    }),

  /**
   * Update enabled job platforms
   */
  updatePlatforms: protectedProcedure
    .input(
      z.object({
        enabledPlatforms: z
          .array(
            z.enum([
              "indeed",
              "glassdoor",
              "linkedin",
              "ziprecruiter",
              "google",
              "adzuna",
            ])
          )
          .min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [existing] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id))
        .limit(1);

      if (!existing) {
        await db.insert(userSettings).values({ userId: ctx.user.id });
      }

      await db
        .update(userSettings)
        .set({ enabledPlatforms: input.enabledPlatforms })
        .where(eq(userSettings.userId, ctx.user.id));

      return { success: true, platforms: input.enabledPlatforms };
    }),

  /**
   * Get enabled platforms for the current user
   */
  getEnabledPlatforms: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    // Defaults updated in Phase 13 (D-019): drop Glassdoor (D-014 "not
    // operable"), add Adzuna (Tier 1). Adzuna only runs if credentials
    // are configured — Settings → Data Sources.
    const DEFAULT_ENABLED = ["indeed", "linkedin", "adzuna"];
    if (!db) return DEFAULT_ENABLED;

    const [settings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, ctx.user.id))
      .limit(1);

    if (!settings || !settings.enabledPlatforms) {
      return DEFAULT_ENABLED;
    }

    return settings.enabledPlatforms;
  }),

  /**
   * Send a test notification to verify the notification system works
   */
  sendTestNotification: protectedProcedure.mutation(async () => {
    const result = await notifyOwner({
      title: "Test Notification from Job Matrix",
      content: `This is a test notification to verify your notification settings are working correctly. Sent at ${new Date().toLocaleString()}.`,
    });

    return { success: result };
  }),
});

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
