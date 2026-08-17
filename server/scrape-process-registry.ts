import type { ChildProcess } from "node:child_process";

export type ScrapeProcessOwner = {
  userId: number;
  scanId: number;
};

type TrackedProcess = {
  child: ChildProcess;
  owner?: ScrapeProcessOwner;
};

const active = new Map<ChildProcess, TrackedProcess>();

export function registerScrapeProcess(child: ChildProcess, owner?: ScrapeProcessOwner): void {
  active.set(child, { child, owner });
  const cleanup = () => active.delete(child);
  child.once("close", cleanup);
  child.once("exit", cleanup);
  child.once("error", cleanup);
}

export function unregisterScrapeProcess(child: ChildProcess): void {
  active.delete(child);
}

export function activeCount(): number {
  return active.size;
}

/** Signal one child and force-kill it if it has not actually exited. */
export function terminateScrapeProcess(child: ChildProcess, graceMs = 3000): boolean {
  if (child.exitCode !== null || child.signalCode !== null) return false;
  let signalled = false;
  try {
    signalled = child.kill("SIGTERM");
  } catch (error) {
    console.warn("[Scrape Registry] SIGTERM failed:", error);
  }
  const fallback = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      try {
        child.kill("SIGKILL");
      } catch (error) {
        console.warn("[Scrape Registry] SIGKILL fallback failed:", error);
      }
    }
  }, graceMs);
  fallback.unref?.();
  return signalled;
}

function terminateMatching(predicate: (entry: TrackedProcess) => boolean, graceMs = 3000): { count: number } {
  const matches = Array.from(active.values()).filter(predicate);
  for (const entry of matches) terminateScrapeProcess(entry.child, graceMs);
  console.log(`[Scrape Registry] Sent SIGTERM to ${matches.length} scoped subprocess(es)`);
  return { count: matches.length };
}

/** Local single-user compatibility path. Hosted callers must use the scoped form. */
export function killAllScrapeProcesses(graceMs = 3000): { count: number } {
  return terminateMatching(() => true, graceMs);
}

export function killScrapeProcessesForScan(
  userId: number,
  scanId: number,
  graceMs = 3000,
): { count: number } {
  return terminateMatching(
    entry => entry.owner?.userId === userId && entry.owner.scanId === scanId,
    graceMs,
  );
}
