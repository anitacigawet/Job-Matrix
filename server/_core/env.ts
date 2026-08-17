import path from "node:path";

export type ProviderId = "gemini" | "openai" | "deepseek";

export const PROVIDER_ORDER: ProviderId[] = ["gemini", "openai", "deepseek"];
export const DEFAULT_PROVIDER: ProviderId = "gemini";

export const PROVIDER_DEFAULT_MODEL: Record<ProviderId, string> = {
  gemini: "gemini-2.0-flash",
  openai: "gpt-4o-mini",
  deepseek: "deepseek-chat",
};

const envProvider = (process.env.LLM_PROVIDER ?? "").trim().toLowerCase();
const envProviderTyped: ProviderId | undefined = (PROVIDER_ORDER as string[]).includes(envProvider)
  ? (envProvider as ProviderId)
  : undefined;

export const ENV = {
  isProduction: process.env.NODE_ENV === "production",
  hostedMode: process.env.HOSTED_MODE === "true",
  databasePath: process.env.DATABASE_PATH ?? path.resolve(process.cwd(), "data", "app.db"),
  settingsPath: process.env.SETTINGS_PATH ?? path.resolve(process.cwd(), "data", "settings.json"),
  port: parseInt(process.env.PORT ?? "3000", 10),
  controlPlaneUrl: process.env.CONTROL_PLANE_URL ?? "http://127.0.0.1:3100",
  controlServiceToken: process.env.CONTROL_SERVICE_TOKEN ?? "",
  settingsEncryptionKey: process.env.SETTINGS_ENCRYPTION_KEY ?? "",

  /** Active provider override from env. Settings file wins if this is undefined. */
  llmProvider: envProviderTyped,

  geminiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "",

  openaiKey: process.env.OPENAI_API_KEY ?? "",
  openaiModel: process.env.OPENAI_MODEL ?? "",

  deepseekKey: process.env.DEEPSEEK_API_KEY ?? "",
  deepseekModel: process.env.DEEPSEEK_MODEL ?? "",

  // Tier-1 data sources (Phase 13; see DECISIONS.md D-019). Env wins over
  // Settings → Data Sources just like the LLM keys do. Add a new var here
  // when a new source ships.
  adzunaAppId: process.env.ADZUNA_APP_ID ?? "",
  adzunaAppKey: process.env.ADZUNA_APP_KEY ?? "",
  usajobsEmail: process.env.USAJOBS_EMAIL ?? "",
  usajobsApiKey: process.env.USAJOBS_API_KEY ?? "",
  joobleApiKey: process.env.JOOBLE_API_KEY ?? "",
  themuseApiKey: process.env.THEMUSE_API_KEY ?? "", // optional — raises rate limit
};
