import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import {
  BRIEFING_SPECS,
  type BriefingType,
  deleteBriefing,
  getBriefing,
  listBriefings,
  startBriefingGeneration,
} from "./services/briefings";

const briefingTypeSchema = z.enum(Object.keys(BRIEFING_SPECS) as [BriefingType, ...BriefingType[]]);

export const briefingsRouter = router({
  /** Catalog of all available briefing types with their kind and Studio config. */
  catalog: protectedProcedure.query(() => {
    return Object.values(BRIEFING_SPECS).map((spec) => ({
      type: spec.type,
      kind: spec.kind,
      requiresJobId: Boolean(spec.requiresJobId),
      studio: spec.studio ?? null,
    }));
  }),

  /** All briefings for the current user, newest first. */
  list: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(500).default(100) }).optional())
    .query(async ({ ctx, input }) => {
      return listBriefings(ctx.user.id, input?.limit ?? 100);
    }),

  /** Single briefing by ID. */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      return getBriefing(input.id, ctx.user.id);
    }),

  /**
   * Kick off a generation. Returns the freshly-inserted row immediately
   * (status: "generating"). The client polls `get` to see status change to
   * "complete" or "failed".
   */
  generate: protectedProcedure
    .input(
      z.object({
        type: briefingTypeSchema,
        jobId: z.number().optional(),
        customTitle: z.string().min(1).max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const spec = BRIEFING_SPECS[input.type];
      if (spec.requiresJobId && !input.jobId) {
        throw new Error(`Briefing type ${input.type} requires a jobId`);
      }
      return startBriefingGeneration(input.type, {
        userId: ctx.user.id,
        jobId: input.jobId,
        customTitle: input.customTitle,
      });
    }),

  /** Remove a briefing record (and its media file, if any). */
  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const ok = await deleteBriefing(input.id, ctx.user.id);
      return { success: ok };
    }),
});
