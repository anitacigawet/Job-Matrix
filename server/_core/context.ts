import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { TRPCError } from "@trpc/server";
import type { User } from "../../drizzle/schema";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { getDb, getUserByOpenId, LOCAL_USER_ID, upsertUser } from "../db";
import { ENV } from "./env";
import { authorizeHostedUser } from "../services/control-plane";

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
  identityEmail?: string | null;
  hosted?: boolean;
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
  if (ENV.hostedMode) {
    const identityEmail = String(opts.req.headers["cf-access-authenticated-user-email"] ?? "").trim().toLowerCase();
    if (!identityEmail || !identityEmail.includes("@")) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "A verified Job Matrix account is required." });
    }
    const access = await authorizeHostedUser(identityEmail);
    if (!access.allowed) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: access.reason === "account-suspended"
          ? "This Job Matrix account is suspended."
          : "This account has not been approved for Job Matrix.",
      });
    }
    const openId = `cloudflare-access:${identityEmail}`;
    await upsertUser({
      openId,
      email: identityEmail,
      name: access.displayName || identityEmail.split("@")[0],
      loginMethod: "cloudflare-access",
      role: "user",
      lastSignedIn: new Date(),
    });
    const user = await getUserByOpenId(openId);
    if (!user) throw new Error("The Job Matrix account could not be initialized.");
    return { req: opts.req, res: opts.res, user, identityEmail, hosted: true };
  }
  return {
    req: opts.req,
    res: opts.res,
    user: await getLocalUser(),
    identityEmail: null,
    hosted: false,
  };
}

/** Context for supported server-side tRPC callers such as the scheduler. */
export async function createInternalContext(userId = LOCAL_USER_ID): Promise<TrpcContext> {
  return {
    req: undefined as unknown as TrpcContext["req"],
    res: undefined as unknown as TrpcContext["res"],
    user: await getLocalUser(userId),
    identityEmail: null,
    hosted: false,
  };
}
