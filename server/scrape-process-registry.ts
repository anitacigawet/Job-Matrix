import type { ChildProcess } from "node:child_process";

const active = new Set<ChildProcess>();

export function registerScrapeProcess(child: ChildProcess): void {
  active.add(child);
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

export function killAllScrapeProcesses(graceMs = 3000): { count: number } {
  const children = Array.from(active);
  for (const child of children) terminateScrapeProcess(child, graceMs);
  console.log(`[Scrape Registry] Sent SIGTERM to ${children.length} subprocess(es)`);
  return { count: children.length };
}
