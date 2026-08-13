import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import {
  checkNotebookLmAuth,
  confirmNotebookLmRelogin,
  getRecentBriefingActivity,
  relogStatus,
  spawnNotebookLmRelogin,
} from "./services/briefings";

/**
 * NotebookLM auth control surface.
 *
 * The NotebookLM Python wrapper authenticates via session cookies stored
 * locally. The cookies eventually expire — when they do, briefing generations
 * fail silently. This router lets the Settings UI show auth status, kick off
 * the `notebooklm login` subprocess (which opens a browser), and confirm
 * once the user has signed in.
 */
export const notebookLmRouter = router({
  /** Check whether NotebookLM session cookies are valid. */
  checkAuth: protectedProcedure
    .input(z.object({ force: z.boolean().default(false) }).optional())
    .query(async ({ input }) => {
      return checkNotebookLmAuth(input?.force ?? false);
    }),

  /** Spawn the `notebooklm login` subprocess. Returns immediately so the UI can prompt the user. */
  spawnRelogin: protectedProcedure.mutation(async () => {
    return spawnNotebookLmRelogin();
  }),

  /** Confirm a successful sign-in by feeding ENTER to the waiting subprocess. */
  confirmRelogin: protectedProcedure
    .input(z.object({ timeoutSeconds: z.number().min(5).max(300).default(60) }).optional())
    .mutation(async ({ input }) => {
      return confirmNotebookLmRelogin(input?.timeoutSeconds ?? 60);
    }),

  /** Check whether a re-login subprocess is in flight, exited, or absent. */
  reloginStatus: protectedProcedure.query(async () => {
    return relogStatus();
  }),

  /**
   * Recent briefing activity — counts by status + recent failures. Powers
   * the "rate-limit / silent-rejection warning" panel on the auth card so
   * the user knows when something is going sideways across many generations.
   */
  recentActivity: protectedProcedure
    .input(z.object({ windowHours: z.number().min(1).max(24 * 30).default(168) }).optional())
    .query(async ({ ctx, input }) => {
      return getRecentBriefingActivity(ctx.user.id, input?.windowHours ?? 168);
    }),
});
