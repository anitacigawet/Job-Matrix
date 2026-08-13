import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { logStream } from "../log-stream";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  getRecentLogs: publicProcedure
    .input(z.object({ limit: z.number().optional().default(100) }))
    .query(({ input }) => logStream.getRecentLogs(input.limit)),
  clearLogs: adminProcedure
    .mutation(() => {
      logStream.clearLogs();
      return { success: true };
    }),
  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
