import { describe, expect, it, vi } from "vitest";
import { showroomLink } from "./showroomLink";

let operationId = 0;

function run(path: string, type: "query" | "mutation", input?: unknown) {
  return new Promise<any>((resolve, reject) => {
    const link = showroomLink()({});
    link({
      op: {
        id: ++operationId,
        type,
        path,
        input,
        context: {},
        signal: undefined,
      },
      next: () => {
        throw new Error("The showroom link must resolve locally.");
      },
    }).subscribe({
      next: envelope => resolve("data" in envelope.result ? envelope.result.data : envelope.result),
      error: reject,
    });
  });
}

describe("Job Matrix showroom transport", () => {
  it("runs the search and application workflow entirely in browser fixture state", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network disabled"));

    const initialJobs = await run("personalized.getEligibleJobs", "query", {});
    expect(initialJobs).toHaveLength(4);
    expect(initialJobs.every((job: any) => job.aiAnalysis?.eligible)).toBe(true);

    await expect(run("personalized.runGlobalSearch", "mutation", { requestId: "showroom-test" })).resolves.toMatchObject({ success: true });
    await expect(run("personalized.runAIAnalysis", "mutation")).resolves.toMatchObject({ success: true });
    await expect(run("personalized.runFitScoring", "mutation")).resolves.toMatchObject({ success: true });
    await expect(run("personalized.markJobAsApplied", "mutation", { jobId: initialJobs[0].id })).resolves.toMatchObject({ success: true });

    expect(await run("personalized.getEligibleJobs", "query", {})).toHaveLength(3);
    expect(await run("personalized.getAppliedJobs", "query")).toHaveLength(3);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
