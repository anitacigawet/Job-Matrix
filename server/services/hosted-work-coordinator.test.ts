import { describe, expect, it, vi } from "vitest";
import { HostedWorkCoordinator } from "./hosted-work-coordinator";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(next => { resolve = next; });
  return { promise, resolve };
}

describe("HostedWorkCoordinator", () => {
  it("does not execute an idempotent duplicate", async () => {
    const coordinator = new HostedWorkCoordinator();
    const operation = vi.fn(async () => "ran");
    const result = await coordinator.runSearch(
      1,
      async () => ({ allowed: true, duplicate: true }),
      operation,
    );
    expect(result.kind).toBe("duplicate");
    expect(operation).not.toHaveBeenCalled();
  });

  it("reserves before a search enters the long-lived queue", async () => {
    const coordinator = new HostedWorkCoordinator(1);
    const active = deferred<void>();
    const first = coordinator.runSearch(
      1,
      async () => ({ allowed: true }),
      async () => { await active.promise; return "first"; },
    );
    await vi.waitFor(() => expect(coordinator.snapshot().scrapeActive).toBe(true));

    const denied = await coordinator.runSearch(
      2,
      async () => ({ allowed: false, reason: "personal-limit-reached" }),
      async () => "must-not-run",
    );
    expect(denied.kind).toBe("denied");
    expect(coordinator.snapshot().scrapeWaiters).toBe(0);

    active.resolve();
    await first;
  });

  it("allows only one active or pending search per user", async () => {
    const coordinator = new HostedWorkCoordinator();
    const reservation = deferred<{ allowed: boolean }>();
    const first = coordinator.runSearch(7, () => reservation.promise, async () => "first");
    await expect(coordinator.runSearch(7, async () => ({ allowed: true }), async () => "second"))
      .rejects.toThrow("Only one search");
    reservation.resolve({ allowed: false });
    await first;
  });

  it("bounds AI concurrency and excludes duplicate work per user", async () => {
    const coordinator = new HostedWorkCoordinator(6, 1);
    const active = deferred<void>();
    const first = coordinator.runAi(1, async () => { await active.promise; return "done"; });
    await vi.waitFor(() => expect(coordinator.snapshot().aiActive).toBe(1));
    await expect(coordinator.runAi(1, async () => "duplicate")).rejects.toThrow("already running");
    await expect(coordinator.runAi(2, async () => "overflow")).rejects.toThrow("maximum number");
    active.resolve();
    await expect(first).resolves.toBe("done");
  });
});
