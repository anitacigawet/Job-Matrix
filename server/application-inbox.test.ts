import { describe, expect, it } from "vitest";
import type { AppliedJob } from "../drizzle/schema";
import {
  classifyWithRules,
  isPlausiblyJobRelated,
  matchApplication,
  parseGmailMessage,
  type ParsedIncomingMessage,
} from "./services/application-inbox";

function incoming(overrides: Partial<ParsedIncomingMessage> = {}): ParsedIncomingMessage {
  return {
    providerMessageId: "message-1",
    source: "email",
    sender: "Hiring Team",
    senderAddress: "jobs@example.com",
    senderPhone: null,
    subject: "Application update",
    body: "Thank you for applying.",
    snippet: "Thank you for applying.",
    receivedAt: new Date("2026-08-03T12:00:00Z"),
    ...overrides,
  };
}

function applied(overrides: Partial<AppliedJob> = {}): AppliedJob {
  return {
    id: 4,
    userId: 1,
    trackedJobId: 8,
    platform: "indeed",
    jobId: "external-4",
    title: "Crew Member",
    company: "Rose City Burgers",
    location: "Portland, OR",
    salaryMin: null,
    salaryMax: null,
    salaryInterval: null,
    jobType: "full-time",
    description: null,
    jobUrl: "https://example.test/job",
    applicationStatus: "applied",
    firstTrackedAt: new Date("2026-08-01T12:00:00Z"),
    appliedAt: new Date("2026-08-02T12:00:00Z"),
    interviewAt: null,
    offerAt: null,
    resolvedAt: null,
    notes: null,
    ...overrides,
  };
}

describe("application inbox privacy and interpretation", () => {
  it("ignores unrelated personal email before classification or storage", () => {
    const message = incoming({
      sender: "Neighborhood Library",
      senderAddress: "news@library.example",
      subject: "Your holds are ready",
      body: "Two books are available for pickup.",
    });
    expect(isPlausiblyJobRelated(message, 0)).toBe(false);
  });

  it("keeps job-related mail and any Google Voice event", () => {
    expect(isPlausiblyJobRelated(incoming({ subject: "Interview invitation" }), 0)).toBe(true);
    expect(isPlausiblyJobRelated(incoming({ source: "voice_missed_call", subject: "Missed call" }), 0)).toBe(true);
  });

  it("recognizes high-confidence interview and rejection language without an LLM", () => {
    expect(classifyWithRules(incoming({ subject: "Schedule your interview", body: "Select a time slot." }))).toMatchObject({ category: "interview", confidence: 97, method: "rules" });
    expect(classifyWithRules(incoming({ subject: "Application update", body: "We have decided to pursue other candidates." }))).toMatchObject({ category: "rejection", confidence: 97, method: "rules" });
  });

  it("matches a reply to a recent application by company and title", () => {
    const result = matchApplication(incoming({
      sender: "Rose City Burgers Recruiting",
      senderAddress: "hiring@rosecityburgers.example",
      subject: "Crew Member interview",
      body: "We would like to schedule your interview.",
    }), [applied()]);
    expect(result.job?.id).toBe(4);
    expect(result.confidence).toBeGreaterThanOrEqual(70);
  });

  it("parses Google Voice missed-call mail without retaining raw MIME", () => {
    const payload = Buffer.from("You missed a call from (503) 555-0199.").toString("base64url");
    const parsed = parseGmailMessage({
      id: "voice-1",
      internalDate: "1785768000000",
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "Subject", value: "Missed call from (503) 555-0199" },
          { name: "From", value: "Google Voice <voice-noreply@google.com>" },
        ],
        body: { data: payload },
      },
    });
    expect(parsed).toMatchObject({
      source: "voice_missed_call",
      senderAddress: "voice-noreply@google.com",
      senderPhone: "(503) 555-0199",
    });
  });
});
