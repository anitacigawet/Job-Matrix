/**
 * server/scrape-process-registry.ts
 *
 * Tracks live Python scrape subprocesses so the cancel-operation flow can
 * SIGTERM them directly instead of waiting for them to finish naturally.
 *
 * Job Matrix is single-user, so a flat set is fine — at most one scan
 * runs at a time per host, and that scan may have multiple subprocesses
 * in flight (one per platform). All of them belong to the same logical
 * "current scrape," so killing all-active on cancel is the right scope.
 *
 * Lifecycle:
 *   register(child) on spawn
 *   unregister(child) on close / error / kill
 *   killAll() from cancelOperation — sends SIGTERM, schedules SIGKILL fallback
 */
import type { ChildProcess } from "node:child_process";

const active = new Set<ChildProcess>();

export function registerScrapeProcess(child: ChildProcess): void {
  active.add(child);
  // Auto-unregister whenever the subprocess exits, regardless of cause.
  const cleanup = () => {
    active.delete(child);
  };
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

/**
 * Kill every currently-tracked scrape subprocess.
 * Sends SIGTERM first; falls back to SIGKILL after a grace window for any
 * stragglers that ignored the term signal (Python subprocesses sometimes
 * do, especially when wedged inside a C extension).
 */
export function killAllScrapeProcesses(graceMs: number = 3000): { count: number } {
  const count = active.size;
  if (count === 0) return { count };

  const stragglers: ChildProcess[] = [];
  for (const child of Array.from(active)) {
    try {
      const killed = child.kill("SIGTERM");
      if (!killed || child.exitCode === null) {
        stragglers.push(child);
      }
    } catch (err) {
      console.warn("[Scrape Registry] SIGTERM failed:", err);
    }
  }

  if (stragglers.length > 0) {
    setTimeout(() => {
      for (const child of stragglers) {
        if (child.exitCode === null && !child.killed) {
          try {
            child.kill("SIGKILL");
          } catch (err) {
            console.warn("[Scrape Registry] SIGKILL fallback failed:", err);
          }
        }
      }
    }, graceMs);
  }

  console.log(
    `[Scrape Registry] Sent SIGTERM to ${count} subprocess(es); ${stragglers.length} pending SIGKILL fallback`,
  );
  return { count };
}
