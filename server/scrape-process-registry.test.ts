import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  killScrapeProcessesForScan,
  registerScrapeProcess,
  terminateScrapeProcess,
} from "./scrape-process-registry";

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
    kill: ReturnType<typeof vi.fn>;
  };
  child.exitCode = null;
  child.signalCode = null;
  child.kill = vi.fn(() => true);
  return child as unknown as ChildProcess;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("scrape process registry", () => {
  it("signals only the requested tenant and scan", () => {
    const owned = fakeChild();
    const other = fakeChild();
    registerScrapeProcess(owned, { userId: 1, scanId: 10 });
    registerScrapeProcess(other, { userId: 2, scanId: 20 });

    expect(killScrapeProcessesForScan(1, 10, 60_000).count).toBe(1);
    expect(owned.kill).toHaveBeenCalledWith("SIGTERM");
    expect(other.kill).not.toHaveBeenCalled();

    owned.emit("close", 0);
    other.emit("close", 0);
  });

  it("force-kills a child that remains alive after SIGTERM", () => {
    vi.useFakeTimers();
    const child = fakeChild();
    terminateScrapeProcess(child, 25);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    vi.advanceTimersByTime(25);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });
});
