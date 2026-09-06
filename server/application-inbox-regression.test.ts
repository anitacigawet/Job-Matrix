import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { appliedJobs, applicationNotes, inboxMessages, userSettings } from "../drizzle/schema";

const mocks = vi.hoisted(() => ({
  gmailApiRequest: vi.fn(),
  invokeLLM: vi.fn(),
  notifyOwner: vi.fn(),
}));

vi.mock("./services/gmail-client", async importOriginal => ({
  ...await importOriginal<typeof import("./services/gmail-client")>(),
  gmailApiRequest: mocks.gmailApiRequest,
}));
vi.mock("./_core/llm", () => ({ invokeLLM: mocks.invokeLLM }));
vi.mock("./_core/notification", () => ({ notifyOwner: mocks.notifyOwner }));

import { createInternalContext } from "./_core/context";
import { writeSettings } from "./_core/settings";
import { getDb, initDb } from "./db";
import { appRouter } from "./routers";
import { pollGmailInboxForUser } from "./services/application-inbox";

const SENDER_ADDRESS = "sender@unrelated-domain.example";
const COMPANY = "Rose City Burgers";
const TITLE = "Crew Member";
const receivedAt = new Date("2026-09-04T12:00:00Z");

function email(id: string, body: string, unrelated = false) {
  return {
    id,
    threadId: `thread-${id}`,
    internalDate: String(receivedAt.getTime()),
    snippet: body,
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "Subject", value: unrelated ? "Your books are ready" : `${COMPANY} - ${TITLE}` },
        { name: "From", value: unrelated
          ? "Neighborhood Library <news@library.example>"
          : `"${COMPANY} Recruiting" <${SENDER_ADDRESS}>` },
      ],
      body: { data: Buffer.from(body).toString("base64url") },
    },
  };
}

let mailbox: ReturnType<typeof email>[] = [];

async function caller() {
  return appRouter.createCaller(await createInternalContext());
}

async function applicationRows() {
  const db = await getDb();
  return db.select().from(appliedJobs).where(eq(appliedJobs.userId, 1));
}

beforeAll(async () => {
  await initDb();
  // The actual connection check reads only this suite's disposable settings.
  writeSettings({ gmail: {
    clientId: "fictional-client", clientSecret: "fictional-secret",
    refreshToken: "fictional-refresh", email: "local@example.test",
  } });
});

beforeEach(async () => {
  const db = await getDb();
  await db.delete(inboxMessages);
  await db.delete(applicationNotes);
  await db.delete(appliedJobs);
  await db.delete(userSettings);
  await db.insert(appliedJobs).values({
    userId: 1, platform: "indeed", jobId: "inbox-regression-job",
    company: COMPANY, title: TITLE, jobUrl: "https://employer.example/job",
    applicationStatus: "applied",
    firstTrackedAt: new Date("2026-09-01T12:00:00Z"),
    appliedAt: new Date("2026-09-02T12:00:00Z"),
    interviewAt: null, offerAt: null, resolvedAt: null,
    notes: "User-authored application notes",
  });
  await db.insert(userSettings).values({
    userId: 1, gmailHistoryId: "100", inboxMonitoringEnabled: 1,
    notificationsEnabled: 1, notifyOnEmployerResponse: 1,
  });
  mailbox = [];
  mocks.gmailApiRequest.mockReset().mockImplementation(async (endpoint: string) => {
    const url = new URL(endpoint, "http://gmail-fixture.test");
    if (url.pathname === "/users/me/history") {
      return {
        historyId: "200",
        history: [{ messagesAdded: mailbox.map(message => ({ message: { id: message.id } })) }],
      };
    }
    const message = mailbox.find(candidate => url.pathname === `/users/me/messages/${candidate.id}`);
    if (message) return message;
    throw new Error(`Unexpected mocked Gmail endpoint: ${url.pathname}`);
  });
  mocks.invokeLLM.mockReset().mockResolvedValue({ choices: [{ message: { content: JSON.stringify({
    category: "interview", summary: "The message suggests arranging an interview.", confidence: 100,
  }) } }] });
  mocks.notifyOwner.mockReset().mockResolvedValue(true);
});

const scenarios = [
  { category: "interview", body: "We invite you to schedule your interview.", method: "rules" },
  { category: "offer", body: "We are pleased to offer you the position.", method: "rules" },
  { category: "rejection", body: "We have decided to pursue other candidates.", method: "rules" },
  ...["interview", "offer", "rejection"].map(category => ({
    category, body: "There is news about your record. Please read the attached document.", method: "llm",
  })),
];

describe("incoming email cannot control the application pipeline", () => {
  it.each(scenarios)("keeps a high-confidence $method $category as a reviewable suggestion", async scenario => {
    const db = await getDb();
    const before = await applicationRows();
    const api = await caller();
    mailbox = [email(`forged-${scenario.method}-${scenario.category}`, scenario.body)];
    mocks.invokeLLM.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({
      category: scenario.category, summary: `Unverified ${scenario.category} message.`, confidence: 100,
    }) } }] });

    expect(await pollGmailInboxForUser(1)).toMatchObject({
      checked: true, imported: 1, matched: 1, needsReview: 1,
    });
    // Whole-row equality also protects all five application timestamps and notes.
    expect(await applicationRows()).toEqual(before);
    const [response] = await api.automation.listInbox();
    expect(response).toMatchObject({
      appliedJobId: before[0].id, category: scenario.category,
      sender: `${COMPANY} Recruiting`, senderAddress: SENDER_ADDRESS,
      needsReview: true, reviewedAt: null,
    });
    expect(response.matchConfidence).toBeGreaterThanOrEqual(90);
    expect(response.classificationConfidence).toBeGreaterThanOrEqual(97);
    const notes = await db.select().from(applicationNotes);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ jobId: before[0].id, noteType: "note", oldStatus: null, newStatus: null });
    expect(notes[0].content).toContain("Unverified email classified as");
    expect(notes[0].content).toContain(SENDER_ADDRESS);
    expect(mocks.invokeLLM).toHaveBeenCalledTimes(scenario.method === "llm" ? 1 : 0);

    await api.automation.markResponseReviewed({ messageId: response.id });
    expect(await applicationRows()).toEqual(before);
    const [reviewed] = await api.automation.listInbox();
    expect(reviewed.needsReview).toBe(false);
    expect(reviewed.reviewedAt).toBeInstanceOf(Date);

    await api.automation.linkResponse({ messageId: response.id, appliedJobId: before[0].id });
    expect(await applicationRows()).toEqual(before);
    const linkedNotes = await db.select().from(applicationNotes);
    expect(linkedNotes).toHaveLength(2);
    for (const note of linkedNotes) {
      expect(note).toMatchObject({ noteType: "note", oldStatus: null, newStatus: null });
    }
  });

  it("still changes status and its date through the explicit application control", async () => {
    mailbox = [email("manual-status", "We invite you to schedule your interview.")];
    await pollGmailInboxForUser(1);
    const before = await applicationRows();
    const api = await caller();
    await api.personalized.updateApplicationStatus({ jobId: before[0].id, status: "interview" });
    const [updated] = await applicationRows();
    expect(updated.applicationStatus).toBe("interview");
    expect(updated.interviewAt).toBeInstanceOf(Date);
    expect(updated).toMatchObject({
      firstTrackedAt: before[0].firstTrackedAt, appliedAt: before[0].appliedAt,
      offerAt: null, resolvedAt: null, notes: before[0].notes,
    });
  });

  it("does not reclassify, renotify, or add a second note when polling the same message", async () => {
    const db = await getDb();
    mailbox = [email("duplicate-response", "There is news about your record. Please read the attached document.")];
    const before = await applicationRows();
    expect(await pollGmailInboxForUser(1)).toMatchObject({ imported: 1, matched: 1 });
    expect(await pollGmailInboxForUser(1)).toMatchObject({ imported: 0, matched: 0, needsReview: 0 });
    expect(await db.select().from(inboxMessages)).toHaveLength(1);
    expect(await db.select().from(applicationNotes)).toHaveLength(1);
    expect(mocks.invokeLLM).toHaveBeenCalledTimes(1);
    expect(mocks.notifyOwner).toHaveBeenCalledTimes(1);
    expect(mocks.gmailApiRequest.mock.calls.filter(([endpoint]) => String(endpoint).includes("/messages/"))).toHaveLength(1);
    expect(await applicationRows()).toEqual(before);
  });

  it("ignores unrelated personal mail before sending it to the classifier or storing it", async () => {
    const db = await getDb();
    mailbox = [email("private-library-message", "Two books are available for pickup.", true)];
    const before = await applicationRows();
    expect(await pollGmailInboxForUser(1)).toMatchObject({ checked: true, imported: 0, matched: 0 });
    expect(mocks.invokeLLM).not.toHaveBeenCalled();
    expect(mocks.notifyOwner).not.toHaveBeenCalled();
    expect(await db.select().from(inboxMessages)).toEqual([]);
    expect(await db.select().from(applicationNotes)).toEqual([]);
    expect(await applicationRows()).toEqual(before);
  });
});
