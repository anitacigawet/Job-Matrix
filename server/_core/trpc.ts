import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { assertOperationActive, withWorkspaceOperation } from "../operation-lifecycle";

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

// Reset owns the generation transition itself; it cannot assert the old
// generation after completing that transition. The local-user check still applies.
export const workspaceResetProcedure = t.procedure.use(requireUser);
export const userProcedure = t.procedure.use(requireUser).use(({ next }) =>
  withWorkspaceOperation(async () => {
    assertOperationActive();
    const result = await next();
    assertOperationActive();
    return result;
  }),
);
export const protectedProcedure = userProcedure;
