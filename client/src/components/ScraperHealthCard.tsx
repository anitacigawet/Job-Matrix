import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Network, CheckCircle2, AlertTriangle, XCircle, HelpCircle, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

const PLATFORM_LABELS: Record<string, string> = {
  indeed: "Indeed",
  glassdoor: "Glassdoor",
  linkedin: "LinkedIn",
  ziprecruiter: "ZipRecruiter",
  google: "Google Jobs",
};

type HealthState = "working" | "degraded" | "blocked" | "untested";

function classify(row: any): HealthState {
  if ((row.totalAttempts ?? 0) === 0) return "untested";
  const last = row.lastSuccessAt ? new Date(row.lastSuccessAt).getTime() : 0;
  const attempt = row.lastAttemptAt ? new Date(row.lastAttemptAt).getTime() : 0;
  // No successes ever and at least one attempt → blocked.
  if (!last && row.totalAttempts > 0) return "blocked";
  // Last attempt was a failure (later than last success) → degraded.
  if (attempt > last) return "degraded";
  // Last attempt was a success.
  return "working";
}

const STATE_PRESENTATION: Record<
  HealthState,
  { label: string; tone: "good" | "warn" | "bad" | "neutral"; Icon: any }
> = {
  working: { label: "Working", tone: "good", Icon: CheckCircle2 },
  degraded: { label: "Recently failed", tone: "warn", Icon: AlertTriangle },
  blocked: { label: "Blocked", tone: "bad", Icon: XCircle },
  untested: { label: "Not tested", tone: "neutral", Icon: HelpCircle },
};

function badgeClass(tone: "good" | "warn" | "bad" | "neutral") {
  if (tone === "good") return "bg-green-500/15 text-green-300 border-green-500/40";
  if (tone === "warn") return "bg-amber-500/15 text-amber-300 border-amber-500/40";
  if (tone === "bad") return "bg-red-500/15 text-red-300 border-red-500/40";
  return "bg-muted text-muted-foreground";
}

function timeAgo(ts: string | Date | null): string {
  if (!ts) return "never";
  const date = typeof ts === "string" ? new Date(ts) : ts;
  const seconds = (Date.now() - date.getTime()) / 1000;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86400)} d ago`;
}

export function ScraperHealthCard() {
  const query = trpc.scrapers.health.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  return (
    <Card data-agent-status="scraper-health-card">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5 text-cyan-400" />
          <CardTitle>Scraper Health</CardTitle>
        </div>
        <CardDescription className="pt-1">
          Recent results from each job source, including known failures.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : !query.data?.length ? (
          <p className="text-sm text-muted-foreground">No telemetry yet.</p>
        ) : (
          <ul className="space-y-2">
            {query.data.map((row: any) => {
              const state = classify(row);
              const pres = STATE_PRESENTATION[state];
              const Icon = pres.Icon;
              const successRate =
                row.totalAttempts > 0
                  ? Math.round(
                      ((row.totalAttempts - row.totalFailures) / row.totalAttempts) * 100,
                    )
                  : null;
              return (
                <li
                  key={row.platform}
                  className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border/30 bg-muted/10"
                  data-agent-status={`scraper-row-${row.platform}`}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <Icon
                      className={
                        "h-4 w-4 mt-0.5 shrink-0 " +
                        (pres.tone === "good"
                          ? "text-green-400"
                          : pres.tone === "warn"
                            ? "text-amber-300"
                            : pres.tone === "bad"
                              ? "text-red-300"
                              : "text-muted-foreground")
                      }
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {PLATFORM_LABELS[row.platform] ?? row.platform}
                        </span>
                        <Badge variant="outline" className={badgeClass(pres.tone)}>
                          {pres.label}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {row.totalAttempts > 0 ? (
                          <>
                            Last success: <strong className="text-foreground">{timeAgo(row.lastSuccessAt)}</strong>
                            {" · "}
                            {row.totalAttempts} attempt{row.totalAttempts === 1 ? "" : "s"}
                            {successRate !== null && ` · ${successRate}% success`}
                          </>
                        ) : (
                          <>No scrape attempts yet on this platform.</>
                        )}
                      </div>
                      {row.lastError && state !== "working" && (
                        <p
                          className="text-xs text-amber-300/80 mt-1 line-clamp-2 break-all"
                          data-agent-status={`scraper-error-${row.platform}`}
                        >
                          {row.lastError}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
