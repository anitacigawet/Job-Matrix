import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  getActiveProviderLabel,
  getDeploymentEnvironment,
  getEnvironmentLabel,
  validateEnvironment,
} from "./_core/environment";
import { personalizedRouter } from "./routers/index";
import { indeedRouter } from "./routers_indeed";
import { onboardingRouter } from "./routers_onboarding";
import { debugStagesRouter } from "./routers_debug_stages";
import { settingsRouter } from "./routers_settings";
import { presetsRouter } from "./routers_presets";
import { notesRouter } from "./routers_notes";
import { scrapersRouter } from "./routers_scrapers";
import { companiesRouter } from "./routers_companies";
import { automationRouter } from "./routers_automation";

export const appRouter = router({
  system: systemRouter,

  // Auth shim — no real login in self-hosted mode, but the frontend still
  // calls auth.me on every page load. Returns the constant local user.
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(() => ({ success: true }) as const),
  }),

  environment: router({
    status: publicProcedure.query(() => {
      const env = getDeploymentEnvironment();
      const errors = validateEnvironment();
      return {
        environment: env,
        label: getEnvironmentLabel(),
        // Bare display name for the *active* provider (e.g. "Google Gemini",
        // "OpenAI", "DeepSeek"). Used by the onboarding banner so its
        // "key not set" copy names the right provider instead of hard-
        // coding DeepSeek.
        activeProviderLabel: getActiveProviderLabel(),
        isConfigured: errors.length === 0,
        errors,
      };
    }),
  }),

  personalized: personalizedRouter,
  indeed: indeedRouter,
  onboarding: onboardingRouter,
  debugStages: debugStagesRouter,
  settings: settingsRouter,
  presets: presetsRouter,
  notes: notesRouter,
  scrapers: scrapersRouter,
  companies: companiesRouter,
  automation: automationRouter,
});

export type AppRouter = typeof appRouter;
