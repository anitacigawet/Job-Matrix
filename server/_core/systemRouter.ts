import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { logStream } from "../log-stream";
import { ENV } from "./env";

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

  getRecentLogs: adminProcedure
    .input(z.object({ limit: z.number().optional().default(100) }))
    .query(({ input }) => ENV.hostedMode ? [] : logStream.getRecentLogs(input.limit)),
  clearLogs: adminProcedure
    .mutation(() => {
      if (ENV.hostedMode) throw new Error("Shared server logs are not exposed in hosted mode.");
      logStream.clearLogs();
      return { success: true };
    }),
  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required").max(200),
        content: z.string().min(1, "content is required").max(5_000),
      })
    )
    .mutation(async ({ input }) => {
      if (ENV.hostedMode) throw new Error("Server-owner notifications are not available to hosted accounts.");
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
