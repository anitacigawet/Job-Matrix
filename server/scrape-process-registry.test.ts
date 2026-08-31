import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  killAllScrapeProcesses,
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
  it("signals every active local scraper", () => {
    const first = fakeChild();
    const second = fakeChild();
    registerScrapeProcess(first);
    registerScrapeProcess(second);

    expect(killAllScrapeProcesses(60_000).count).toBe(2);
    expect(first.kill).toHaveBeenCalledWith("SIGTERM");
    expect(second.kill).toHaveBeenCalledWith("SIGTERM");

    first.emit("close", 0);
    second.emit("close", 0);
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
