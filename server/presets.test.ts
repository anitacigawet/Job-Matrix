import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { createInternalContext } from "./_core/context";
import { getDb, initDb } from "./db";
import { searchPresets } from "../drizzle/schema";

describe("presets router integration", () => {
  beforeAll(async () => {
    await initDb();
  });

  beforeEach(async () => {
    const db = await getDb();
    await db.delete(searchPresets);
  });

  it("creates, reads, updates, marks used, and deletes a preset", async () => {
    const api = appRouter.createCaller(await createInternalContext());
    const created = await api.presets.create({
      name: "Remote analyst roles",
      jobTitles: ["Data Analyst", "Reporting Analyst"],
      location: "Remote",
      radiusMiles: 50,
      remotePreference: "remote_only",
      platforms: ["indeed", "remotive"],
      isDefault: false,
    });
    expect(created.success).toBe(true);
    if (created.id == null) throw new Error("Preset create did not return an id");
    const presetId = created.id;

    let rows = await api.presets.list();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Remote analyst roles");

    await expect(api.presets.update({ id: presetId, name: "Analyst roles" }))
      .resolves.toEqual({ success: true });
    await expect(api.presets.markUsed({ id: presetId }))
      .resolves.toEqual({ success: true });

    rows = await api.presets.list();
    expect(rows[0].name).toBe("Analyst roles");
    expect(rows[0].lastUsedAt).toBeInstanceOf(Date);

    await expect(api.presets.delete({ id: presetId }))
      .resolves.toEqual({ success: true });
    await expect(api.presets.list()).resolves.toEqual([]);
  });
});
