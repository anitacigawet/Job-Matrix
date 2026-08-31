import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { getDb, LOCAL_USER_ID } from "../db";

/**
 * Single-user, no-auth context.
 *
 * The seed migration inserts the local user (id = 1) so all existing
 * router code that reads `ctx.user.id` keeps working without per-call edits.
 */
export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User;
};

/**
 * Read the single local user from SQLite for every request.
 *
 * Onboarding and factory-reset state live in the users row; keeping a second
 * in-memory copy made a fresh database look permanently onboarded.
 */
export async function getLocalUser(userId = LOCAL_USER_ID): Promise<User> {
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    throw new Error(`Local user ${userId} is missing. Re-run the database migrations.`);
  }
  return user;
}

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  return {
    req: opts.req,
    res: opts.res,
    user: await getLocalUser(),
  };
}

/** Context for supported server-side tRPC callers such as the scheduler. */
export async function createInternalContext(userId = LOCAL_USER_ID): Promise<TrpcContext> {
  return {
    req: undefined as unknown as TrpcContext["req"],
    res: undefined as unknown as TrpcContext["res"],
    user: await getLocalUser(userId),
  };
}
