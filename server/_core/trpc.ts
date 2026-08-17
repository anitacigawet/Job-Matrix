import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { runWithUserSettings } from "./settings";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Self-hosted, single-user mode: every procedure is "public" (no auth).
// Aliases preserved so existing router files keep compiling.
const requireUser = t.middleware(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return runWithUserSettings(ctx.user.id, () => next({ ctx }));
});

export const userProcedure = t.procedure.use(requireUser);
export const protectedProcedure = userProcedure;
// Historical name only; owner controls live on the isolated admin service.
export const adminProcedure = userProcedure;
