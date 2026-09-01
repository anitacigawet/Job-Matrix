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
import { settingsRouter } from "./routers_settings";
import { presetsRouter } from "./routers_presets";
import { notesRouter } from "./routers_notes";
import { scrapersRouter } from "./routers_scrapers";
import { automationRouter } from "./routers_automation";

export const appRouter = router({
  // The frontend reads this local state row on every page load. There is no
  // login or remote identity provider.
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
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
  settings: settingsRouter,
  presets: presetsRouter,
  notes: notesRouter,
  scrapers: scrapersRouter,
  automation: automationRouter,
});

export type AppRouter = typeof appRouter;
