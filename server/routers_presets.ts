import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "./_core/trpc";
import {
  getSearchPresets,
  createSearchPreset,
  updateSearchPreset,
  deleteSearchPreset,
  markPresetUsed,
  saveUserProfile,
  getUserProfile,
  getDb,
} from "./db";
import {
  searchPresets,
  userSettings,
  userJobTitles,
} from "../drizzle/schema";

const MAX_PRESETS_PER_USER = 20;
const presetJobTitles = z.array(z.string().trim().min(1).max(160)).min(1).max(15);
const presetPlatforms = z.array(z.string().trim().min(1).max(40)).min(1).max(12);

/**
 * Parse a preset's free-text location into (city, state).
 *
 * Presets store `location` as a single text field (legacy from a simpler
 * scan model); user_profiles needs structured city + state. We split on
 * the first comma. If the second piece isn't a 2-letter US state code
 * we keep the existing profile state rather than corrupting it.
 *
 * Returns { city, state, warning } — warning is non-null when the parse
 * had to fall back, so the UI can surface "we kept your existing state."
 */
function parsePresetLocation(
  presetLocation: string,
  fallbackState: string,
): { city: string; state: string; warning: string | null } {
  const trimmed = presetLocation.trim();
  if (!trimmed) {
    return { city: "", state: fallbackState, warning: "Preset location was empty — kept existing state." };
  }
  const commaIdx = trimmed.indexOf(",");
  if (commaIdx === -1) {
    return {
      city: trimmed,
      state: fallbackState,
      warning: `Preset location "${trimmed}" has no state — kept existing state "${fallbackState}".`,
    };
  }
  const city = trimmed.slice(0, commaIdx).trim();
  const rawState = trimmed.slice(commaIdx + 1).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(rawState)) {
    return {
      city,
      state: fallbackState,
      warning: `Preset state "${rawState}" isn't a 2-letter code — kept existing state "${fallbackState}".`,
    };
  }
  return { city, state: rawState, warning: null };
}

export const presetsRouter = router({
  /** Get all search presets for the current user */
  list: protectedProcedure.query(async ({ ctx }) => {
    return getSearchPresets(ctx.user.id);
  }),

  /** Create a new search preset */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        jobTitles: presetJobTitles,
        location: z.string().trim().min(1).max(240),
        radiusMiles: z.number().min(1).max(500).default(50),
        remotePreference: z.enum(["remote_only", "hybrid", "on_site", "any"]).default("any"),
        platforms: presetPlatforms.default(["indeed"]),
        minSalary: z.number().nullable().optional(),
        jobType: z.string().trim().max(120).nullable().optional(),
        isDefault: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existing = await getSearchPresets(ctx.user.id);
      if (existing.length >= MAX_PRESETS_PER_USER) {
        throw new Error(`You can keep up to ${MAX_PRESETS_PER_USER} search presets.`);
      }
      const id = await createSearchPreset({
        userId: ctx.user.id,
        name: input.name,
        jobTitles: input.jobTitles,
        location: input.location,
        radiusMiles: input.radiusMiles,
        remotePreference: input.remotePreference,
        platforms: input.platforms,
        minSalary: input.minSalary,
        jobType: input.jobType,
        isDefault: input.isDefault ? 1 : 0,
      });
      return { success: !!id, id };
    }),

  /** Update an existing search preset */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        jobTitles: presetJobTitles.optional(),
        location: z.string().trim().min(1).max(240).optional(),
        radiusMiles: z.number().min(1).max(500).optional(),
        remotePreference: z.enum(["remote_only", "hybrid", "on_site", "any"]).optional(),
        platforms: presetPlatforms.optional(),
        minSalary: z.number().nullable().optional(),
        jobType: z.string().trim().max(120).nullable().optional(),
        isDefault: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, isDefault, ...rest } = input;
      const data: Record<string, any> = { ...rest };
      if (isDefault !== undefined) {
        data.isDefault = isDefault ? 1 : 0;
      }
      const success = await updateSearchPreset(id, ctx.user.id, data);
      return { success };
    }),

  /** Delete a search preset */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const success = await deleteSearchPreset(input.id, ctx.user.id);
      return { success };
    }),

  /** Mark a preset as recently used */
  markUsed: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await markPresetUsed(input.id, ctx.user.id);
      return { success: true };
    }),

  /**
   * Apply a preset to the user's active state. Overwrites:
   *   - user_profiles: city, state, searchRadiusMiles, remotePreference,
   *     minSalary, salaryFilterEnabled (preserves education, experience,
   *     skills, resume — presets don't track those).
   *   - user_settings.enabledPlatforms
   *   - user_job_titles: deactivates everything not in the preset, upserts
   *     the preset's titles as active.
   *
   * Also updates the preset's lastUsedAt. Returns { success, locationWarning }
   * so the UI can surface lossy free-text location parses.
   *
   * Procedure name is `activate` (not `apply`) because tRPC v11 reserves
   * `apply` as a router-builder method name — using it crashes the server
   * at boot. The user-facing agent hook stays `apply-preset-{id}` because
   * that reflects user intent.
   */
  activate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // 1. Read the preset (scoped to this user — prevent cross-user apply)
      const [preset] = await db
        .select()
        .from(searchPresets)
        .where(and(eq(searchPresets.id, input.id), eq(searchPresets.userId, ctx.user.id)))
        .limit(1);
      if (!preset) {
        throw new Error(`Preset ${input.id} not found`);
      }

      // 2. Read the current user_profile (we need most fields to round-trip
      // through saveUserProfile, which is destructive on the row).
      const profile = await getUserProfile(ctx.user.id);
      if (!profile) {
        throw new Error("User profile not found — finish onboarding first.");
      }

      // 3. Parse the preset's free-text location.
      const parsed = parsePresetLocation(preset.location, profile.state);

      // 4. Overwrite the profile's preset-controlled fields, preserve the rest.
      await saveUserProfile({
        userId: ctx.user.id,
        state: parsed.state,
        city: parsed.city || profile.city,
        searchRadiusMiles: preset.radiusMiles,
        willingToRelocate: profile.willingToRelocate,
        remotePreference: preset.remotePreference,
        educationLevel: profile.educationLevel,
        yearsExperience: profile.yearsExperience,
        skillsRaw: profile.skillsRaw,
        skillsParsed: profile.skillsParsed,
        resumeText: profile.resumeText,
        minSalary: preset.minSalary ?? null,
        // If the preset specifies a minSalary, enable the filter; otherwise
        // disable it (consistent with "the preset is now the source of truth").
        salaryFilterEnabled: preset.minSalary != null ? 1 : 0,
      });

      // 5. Update enabled platforms on user_settings (insert defaults row if missing).
      const [existingSettings] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id))
        .limit(1);
      if (existingSettings) {
        await db
          .update(userSettings)
          .set({ enabledPlatforms: preset.platforms })
          .where(eq(userSettings.userId, ctx.user.id));
      } else {
        await db.insert(userSettings).values({
          userId: ctx.user.id,
          enabledPlatforms: preset.platforms,
        });
      }

      // 6. Reconcile user_job_titles with the preset's title list.
      //    - Activate any existing rows that match (case-insensitive)
      //    - Insert rows for preset titles not yet in the table
      //    - Deactivate every existing row not in the preset
      const existingTitles = await db
        .select()
        .from(userJobTitles)
        .where(eq(userJobTitles.userId, ctx.user.id));

      const presetTitlesLower = new Set(preset.jobTitles.map((t) => t.toLowerCase().trim()));
      const existingByLower = new Map(
        existingTitles.map((row) => [row.jobTitle.toLowerCase().trim(), row]),
      );

      // (a) Activate matches
      const idsToActivate: number[] = [];
      const idsToDeactivate: number[] = [];
      for (const row of existingTitles) {
        if (presetTitlesLower.has(row.jobTitle.toLowerCase().trim())) {
          if (row.isActive !== 1) idsToActivate.push(row.id);
        } else {
          if (row.isActive !== 0) idsToDeactivate.push(row.id);
        }
      }
      if (idsToActivate.length > 0) {
        await db
          .update(userJobTitles)
          .set({ isActive: 1, updatedAt: new Date() })
          .where(inArray(userJobTitles.id, idsToActivate));
      }
      if (idsToDeactivate.length > 0) {
        await db
          .update(userJobTitles)
          .set({ isActive: 0, updatedAt: new Date() })
          .where(inArray(userJobTitles.id, idsToDeactivate));
      }
      // (b) Insert new ones
      const newTitles = preset.jobTitles.filter(
        (t) => !existingByLower.has(t.toLowerCase().trim()),
      );
      if (newTitles.length > 0) {
        await db.insert(userJobTitles).values(
          newTitles.map((jobTitle) => ({
            userId: ctx.user.id,
            jobTitle,
            isActive: 1,
          })),
        );
      }

      // 7. Bookkeeping: mark preset used
      await markPresetUsed(input.id, ctx.user.id);

      return {
        success: true,
        locationWarning: parsed.warning,
        appliedTitles: preset.jobTitles.length,
        appliedPlatforms: preset.platforms.length,
      };
    }),
});
