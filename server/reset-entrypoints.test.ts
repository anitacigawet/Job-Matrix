import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { userProfiles, userSettings } from "../drizzle/schema";
import { createInternalContext } from "./_core/context";
import { invokeLLM } from "./_core/llm";
import { readSettings, updateGmailSettings } from "./_core/settings";
import { getDb, initDb } from "./db";
import { scanRouter } from "./routers/scan";
import { onboardingRouter } from "./routers_onboarding";
import { completeGmailAuthorization, createGmailAuthorizationUrl } from "./services/gmail-client";

vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

async function reset() {
  const api = scanRouter.createCaller(await createInternalContext());
  await expect(api.nukeEverything()).resolves.toMatchObject({ success: true });
}

function beginAuthorization() {
  updateGmailSettings({ clientId: "synthetic-client", clientSecret: "synthetic-secret" });
  const authorization = new URL(createGmailAuthorizationUrl("http://127.0.0.1:3000"));
  return authorization.searchParams.get("state")!;
}

const tokens = () => Response.json({ access_token: "synthetic-access", refresh_token: "synthetic-refresh" });
const gmailProfile = () => Response.json({ emailAddress: "synthetic@example.test", historyId: "synthetic-history" });
const profileInput = {
  city: "Portland", state: "Oregon", remotePreference: "any" as const,
  educationLevel: "bachelors" as const, yearsExperience: "3-5" as const,
};
const skillsResponse = (skill: string) => ({ choices: [{ message: { content: JSON.stringify({
  skills: [{ skill, yearsExperience: 2, level: "intermediate" }],
}) } }] }) as any;

beforeAll(initDb);
beforeEach(async () => {
  vi.mocked(invokeLLM).mockReset();
  await reset();
});

describe("Gmail OAuth entrypoint reset boundary", () => {
  it("completes ordinary OAuth through the same entrypoint with local synthetic state", async () => {
    const state = beginAuthorization();
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(tokens()).mockResolvedValueOnce(gmailProfile());
    globalThis.fetch = fetchMock;
    await expect(completeGmailAuthorization("synthetic-code", state))
      .resolves.toEqual({ email: "synthetic@example.test" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(readSettings().gmail).toMatchObject({ refreshToken: "synthetic-refresh", email: "synthetic@example.test" });
    const db = await getDb();
    expect((await db.select().from(userSettings))[0].gmailHistoryId).toBe("synthetic-history");
  });

  it("stops a token exchange suspended before reset before requesting the Gmail profile", async () => {
    const state = beginAuthorization();
    const started = deferred<void>();
    const release = deferred<Response>();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      started.resolve();
      return release.promise;
    });
    globalThis.fetch = fetchMock;
    const pending = completeGmailAuthorization("synthetic-code", state);
    const rejected = expect(pending).rejects.toThrow("reset");
    await started.promise;
    await reset();
    release.resolve(tokens());
    await rejected;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readSettings()).toEqual({});
    expect(await (await getDb()).select().from(userSettings)).toEqual([]);
  });

  it("does not overwrite fresh settings or a fresh inbox cursor when an old profile response arrives", async () => {
    const state = beginAuthorization();
    const started = deferred<void>();
    const release = deferred<Response>();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(tokens())
      .mockImplementationOnce(async () => { started.resolve(); return release.promise; });
    globalThis.fetch = fetchMock;
    const pending = completeGmailAuthorization("synthetic-code", state);
    const rejected = expect(pending).rejects.toThrow("reset");
    await started.promise;
    await reset();
    updateGmailSettings({ clientId: "fresh-client", clientSecret: "fresh-secret" });
    const db = await getDb();
    await db.insert(userSettings).values({ userId: 1, gmailHistoryId: "fresh-history" });
    release.resolve(gmailProfile());
    await rejected;
    expect(readSettings().gmail).toEqual({ clientId: "fresh-client", clientSecret: "fresh-secret" });
    expect((await db.select().from(userSettings))[0].gmailHistoryId).toBe("fresh-history");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("shared user procedure reset boundary", () => {
  it("does not let delayed skills from an old profile overwrite a fresh profile or return success", async () => {
    const started = deferred<void>();
    const release = deferred<ReturnType<typeof skillsResponse>>();
    vi.mocked(invokeLLM).mockImplementationOnce(async () => { started.resolve(); return release.promise; })
      .mockResolvedValue(skillsResponse("Fresh skill"));
    const api = onboardingRouter.createCaller(await createInternalContext());
    const oldSave = api.saveProfile({ ...profileInput, skillsRaw: "Old skill" });
    const rejected = expect(oldSave).rejects.toThrow("reset");
    await started.promise;
    await reset();
    await expect(api.saveProfile({ ...profileInput, city: "Eugene", skillsRaw: "Fresh skill" }))
      .resolves.toMatchObject({ success: true });
    release.resolve(skillsResponse("Old skill"));
    await rejected;
    const profiles = await (await getDb()).select().from(userProfiles);
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ city: "Eugene", skillsRaw: "Fresh skill",
      skillsParsed: [{ skill: "Fresh skill", yearsExperience: 2, level: "intermediate" }] });
  });

  it("preserves the reset authorization check", async () => {
    const context = await createInternalContext();
    const api = scanRouter.createCaller({ ...context, user: null as any });
    await expect(api.nukeEverything()).rejects.toThrow("UNAUTHORIZED");
  });
});
