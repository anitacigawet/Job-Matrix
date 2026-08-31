import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Local, single-user mode: every procedure is "public" (no auth).
// Aliases preserved so existing router files keep compiling.
const requireUser = t.middleware(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx });
});

export const userProcedure = t.procedure.use(requireUser);
export const protectedProcedure = userProcedure;
