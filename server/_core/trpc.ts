import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Self-hosted, single-user mode: every procedure is "public" (no auth).
// Aliases preserved so existing router files keep compiling.
export const userProcedure = publicProcedure;
export const protectedProcedure = publicProcedure;
export const adminProcedure = publicProcedure;
