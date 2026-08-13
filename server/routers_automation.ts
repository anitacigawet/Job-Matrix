import fs from "node:fs";
import path from "node:path";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  appliedJobs,
  applicationNotes,
  applicationProfiles,
  inboxMessages,
  trackedJobs,
  userProfiles,
  userSettings,
} from "../drizzle/schema";
import { getDb } from "./db";
import { ENV } from "./_core/env";
import { notifyOwner } from "./_core/notification";
import { readSettings, updateGmailSettings, updateSlackSettings } from "./_core/settings";
import { protectedProcedure, router } from "./_core/trpc";
import {
  createGmailAuthorizationUrl,
  disconnectGmail,
  getGmailConnectionSummary,
} from "./services/gmail-client";
import { pollGmailInboxForUser } from "./services/application-inbox";

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

const applicationProfileInput = z.object({
  fullName: optionalText(160),
  email: z.string().trim().email().max(320).optional().nullable().or(z.literal("")),
  phone: optionalText(80),
  addressLine1: optionalText(240),
  addressLine2: optionalText(240),
  city: optionalText(120),
  state: optionalText(120),
  postalCode: optionalText(24),
  availability: optionalText(1_000),
  earliestStartDate: optionalText(40),
  workAuthorized: z.boolean().optional().nullable(),
  sponsorshipRequired: z.boolean().optional().nullable(),
  transportation: optionalText(500),
  desiredPay: optionalText(120),
});

const RESUME_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};
const MAX_RESUME_BYTES = 10 * 1024 * 1024;

function resumeUrl(filePath?: string | null): string | null {
  return filePath ? `/application-assets/${path.basename(filePath)}` : null;
}

function validateSlackWebhook(value: string): string {
  const parsed = new URL(value);
  const validHost = parsed.hostname === "hooks.slack.com" || parsed.hostname === "hooks.slack-gov.com";
  if (parsed.protocol !== "https:" || !validHost || !parsed.pathname.startsWith("/services/")) {
    throw new Error("Enter a Slack incoming webhook URL from hooks.slack.com.");
  }
  parsed.hash = "";
  return parsed.toString();
}

function maskWebhook(value?: string): string | null {
  if (!value) return null;
  const tail = value.split("/").filter(Boolean).at(-1) ?? "";
  return `Slack webhook …${tail.slice(-6)}`;
}

async function ensureUserSettings(userId: number) {
  const db = await getDb();
  let [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  if (!settings) {
    await db.insert(userSettings).values({ userId });
    [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  }
  return settings;
}

export const automationRouter = router({
  getSetup: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const [profile] = await db
      .select()
      .from(applicationProfiles)
      .where(eq(applicationProfiles.userId, ctx.user.id))
      .limit(1);
    const settings = await ensureUserSettings(ctx.user.id);
    const slackWebhook = readSettings().slack?.webhookUrl;

    return {
      profile: profile ? { ...profile, resumeFilePath: undefined, resumeUrl: resumeUrl(profile.resumeFilePath) } : null,
      gmail: getGmailConnectionSummary(),
      slack: { configured: !!slackWebhook, masked: maskWebhook(slackWebhook) },
      monitoring: {
        enabled: !!settings.inboxMonitoringEnabled,
        notifyOnEmployerResponse: !!settings.notifyOnEmployerResponse,
        lastCheckedAt: settings.inboxLastCheckedAt,
      },
    };
  }),

  saveApplicationProfile: protectedProcedure
    .input(applicationProfileInput)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const values = Object.fromEntries(
        Object.entries(input).map(([key, value]) => [key, value === "" ? null : value]),
      );
      const [existing] = await db
        .select({ id: applicationProfiles.id })
        .from(applicationProfiles)
        .where(eq(applicationProfiles.userId, ctx.user.id))
        .limit(1);
      if (existing) {
        await db.update(applicationProfiles).set({ ...values, updatedAt: new Date() }).where(eq(applicationProfiles.id, existing.id));
      } else {
        await db.insert(applicationProfiles).values({ userId: ctx.user.id, ...values });
      }
      return { success: true };
    }),

  uploadResume: protectedProcedure
    .input(z.object({
      fileName: z.string().trim().min(1).max(240),
      mimeType: z.enum([
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ]),
      base64: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.base64, "base64");
      if (buffer.length === 0 || buffer.length > MAX_RESUME_BYTES) {
        throw new Error("Résumé files must be 10 MB or smaller.");
      }
      const extension = RESUME_TYPES[input.mimeType];
      const assetsDir = path.join(path.dirname(ENV.databasePath), "application-assets");
      fs.mkdirSync(assetsDir, { recursive: true });
      const storedName = `user-${ctx.user.id}-primary.${extension}`;
      const storedPath = path.join(assetsDir, storedName);
      fs.writeFileSync(storedPath, buffer, { mode: 0o600 });

      const db = await getDb();
      const [existing] = await db
        .select({ id: applicationProfiles.id })
        .from(applicationProfiles)
        .where(eq(applicationProfiles.userId, ctx.user.id))
        .limit(1);
      const fileValues = {
        resumeFileName: path.basename(input.fileName),
        resumeFilePath: storedPath,
        updatedAt: new Date(),
      };
      if (existing) await db.update(applicationProfiles).set(fileValues).where(eq(applicationProfiles.id, existing.id));
      else await db.insert(applicationProfiles).values({ userId: ctx.user.id, ...fileValues });
      return { success: true, fileName: path.basename(input.fileName), url: resumeUrl(storedPath) };
    }),

  saveGmailClient: protectedProcedure
    .input(z.object({ clientId: z.string().trim().min(20).max(500), clientSecret: z.string().trim().min(4).max(500) }))
    .mutation(({ input }) => {
      updateGmailSettings(input);
      disconnectGmail();
      return getGmailConnectionSummary();
    }),

  createGmailAuthUrl: protectedProcedure
    .input(z.object({ origin: z.string().url() }))
    .mutation(({ input }) => ({ url: createGmailAuthorizationUrl(input.origin) })),

  disconnectGmail: protectedProcedure.mutation(async ({ ctx }) => {
    disconnectGmail();
    const db = await getDb();
    await db.update(userSettings).set({
      inboxMonitoringEnabled: 0,
      gmailHistoryId: null,
      inboxLastCheckedAt: null,
      updatedAt: new Date(),
    }).where(eq(userSettings.userId, ctx.user.id));
    return { success: true };
  }),

  saveSlackWebhook: protectedProcedure
    .input(z.object({ webhookUrl: z.string().trim().max(2_000) }))
    .mutation(({ input }) => {
      const value = input.webhookUrl ? validateSlackWebhook(input.webhookUrl) : undefined;
      updateSlackSettings(value);
      return { configured: !!value, masked: maskWebhook(value) };
    }),

  testSlack: protectedProcedure.mutation(async () => {
    if (!readSettings().slack?.webhookUrl) throw new Error("Save a Slack incoming webhook first.");
    return {
      success: await notifyOwner({
        title: "Job Matrix is connected",
        content: "Slack alerts are ready. Employer responses will appear here when inbox monitoring is on.",
        slack: true,
      }),
    };
  }),

  updateMonitoring: protectedProcedure
    .input(z.object({ enabled: z.boolean(), notifyOnEmployerResponse: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (input.enabled && !getGmailConnectionSummary().connected) {
        throw new Error("Connect Gmail before turning on inbox monitoring.");
      }
      await ensureUserSettings(ctx.user.id);
      const db = await getDb();
      await db.update(userSettings).set({
        inboxMonitoringEnabled: input.enabled ? 1 : 0,
        notifyOnEmployerResponse: input.notifyOnEmployerResponse ? 1 : 0,
        updatedAt: new Date(),
      }).where(eq(userSettings.userId, ctx.user.id));
      return { success: true };
    }),

  checkInboxNow: protectedProcedure.mutation(({ ctx }) => pollGmailInboxForUser(ctx.user.id, { force: true })),

  setQueued: protectedProcedure
    .input(z.object({ jobId: z.number().int().positive(), queued: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const [job] = await db.select().from(trackedJobs)
        .where(and(eq(trackedJobs.id, input.jobId), eq(trackedJobs.userId, ctx.user.id))).limit(1);
      if (!job) throw new Error("Job not found.");
      if (job.status === "applied") throw new Error("This job is already marked applied.");
      if (job.status === "rejected") throw new Error("Rejected jobs cannot be added to the application queue.");
      await db.update(trackedJobs).set({ status: input.queued ? "interested" : "viewed" })
        .where(eq(trackedJobs.id, job.id));
      return { success: true };
    }),

  bulkQueue: protectedProcedure
    .input(z.object({ jobIds: z.array(z.number().int().positive()).max(500) }))
    .mutation(async ({ ctx, input }) => {
      if (input.jobIds.length === 0) return { success: true, queued: 0 };
      const db = await getDb();
      const candidates = await db.select().from(trackedJobs).where(and(
        eq(trackedJobs.userId, ctx.user.id),
        inArray(trackedJobs.id, input.jobIds),
      ));
      const queueableIds = candidates
        .filter((job) => job.status !== "applied" && job.status !== "rejected")
        .map((job) => job.id);
      if (queueableIds.length > 0) {
        await db.update(trackedJobs).set({ status: "interested" }).where(and(
          eq(trackedJobs.userId, ctx.user.id),
          inArray(trackedJobs.id, queueableIds),
        ));
      }
      return { success: true, queued: queueableIds.length };
    }),

  getApplicationPacket: protectedProcedure
    .input(z.object({ jobId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const [job] = await db.select().from(trackedJobs)
        .where(and(eq(trackedJobs.id, input.jobId), eq(trackedJobs.userId, ctx.user.id))).limit(1);
      if (!job) throw new Error("Job not found.");
      const [profile] = await db.select().from(applicationProfiles)
        .where(eq(applicationProfiles.userId, ctx.user.id)).limit(1);
      const [searchProfile] = await db.select().from(userProfiles)
        .where(eq(userProfiles.userId, ctx.user.id)).limit(1);
      return {
        job,
        applicant: profile ? {
          fullName: profile.fullName,
          email: profile.email,
          phone: profile.phone,
          addressLine1: profile.addressLine1,
          addressLine2: profile.addressLine2,
          city: profile.city,
          state: profile.state,
          postalCode: profile.postalCode,
          availability: profile.availability,
          earliestStartDate: profile.earliestStartDate,
          workAuthorized: profile.workAuthorized,
          sponsorshipRequired: profile.sponsorshipRequired,
          transportation: profile.transportation,
          desiredPay: profile.desiredPay,
          resumeFileName: profile.resumeFileName,
          resumeUrl: resumeUrl(profile.resumeFilePath),
        } : null,
        background: searchProfile ? {
          educationLevel: searchProfile.educationLevel,
          yearsExperience: searchProfile.yearsExperience,
          skills: searchProfile.skillsRaw,
          resumeText: searchProfile.resumeText,
        } : null,
        instructions: [
          "Open the job posting and begin its application form.",
          "Use only the applicant answers supplied by Job Matrix. Ask the user whenever an answer is missing or ambiguous.",
          "Never invent employment, education, demographic, disability, veteran, criminal-history, or legal information.",
          "Pause on the final review screen. The user must approve the employer's Submit button.",
          "After the user confirms submission, return here and mark the job applied.",
        ],
      };
    }),

  listInbox: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    const messages = await db.select().from(inboxMessages)
      .where(eq(inboxMessages.userId, ctx.user.id)).orderBy(desc(inboxMessages.receivedAt));
    const jobIds = [...new Set(messages.map((message) => message.appliedJobId).filter((id): id is number => id !== null))];
    const jobs = jobIds.length > 0
      ? await db.select().from(appliedJobs).where(and(eq(appliedJobs.userId, ctx.user.id), inArray(appliedJobs.id, jobIds)))
      : [];
    const byId = new Map(jobs.map((job) => [job.id, job]));
    return messages.map((message) => ({
      ...message,
      application: message.appliedJobId ? byId.get(message.appliedJobId) ?? null : null,
    }));
  }),

  markResponseReviewed: protectedProcedure
    .input(z.object({ messageId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      await db.update(inboxMessages).set({ needsReview: false, reviewedAt: new Date() }).where(and(
        eq(inboxMessages.id, input.messageId),
        eq(inboxMessages.userId, ctx.user.id),
      ));
      return { success: true };
    }),

  linkResponse: protectedProcedure
    .input(z.object({ messageId: z.number().int().positive(), appliedJobId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const [message] = await db.select().from(inboxMessages).where(and(
        eq(inboxMessages.id, input.messageId), eq(inboxMessages.userId, ctx.user.id),
      )).limit(1);
      const [job] = await db.select().from(appliedJobs).where(and(
        eq(appliedJobs.id, input.appliedJobId), eq(appliedJobs.userId, ctx.user.id),
      )).limit(1);
      if (!message || !job) throw new Error("Response or application not found.");
      await db.update(inboxMessages).set({
        appliedJobId: job.id,
        matchConfidence: 100,
        needsReview: false,
        reviewedAt: new Date(),
      }).where(eq(inboxMessages.id, message.id));
      await db.insert(applicationNotes).values({
        userId: ctx.user.id,
        jobId: job.id,
        noteType: "note",
        content: `${message.subject}: ${message.summary}\nFrom: ${message.sender || message.senderAddress || "Unknown sender"}`,
        createdAt: message.receivedAt,
      });
      return { success: true };
    }),
});
