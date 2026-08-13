import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { KeyRound, Loader2, AlertTriangle, RefreshCw, ExternalLink, Info, Activity } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const STATUS_PRESENTATION: Record<
  string,
  { label: string; tone: "good" | "warn" | "bad" | "neutral"; description: string }
> = {
  valid: {
    label: "Connected",
    tone: "good",
    description: "Your NotebookLM session cookies are valid. Briefings can be generated.",
  },
  expired: {
    label: "Expired",
    tone: "warn",
    description:
      "NotebookLM signed you out. Re-authenticate to continue generating briefings.",
  },
  missing: {
    label: "Not signed in",
    tone: "warn",
    description:
      "No NotebookLM session cookies on this machine yet. Sign in once to enable briefings.",
  },
  unknown: {
    label: "Unknown",
    tone: "bad",
    description:
      "Could not probe NotebookLM auth status — check the server logs.",
  },
};

function badgeClass(tone: "good" | "warn" | "bad" | "neutral") {
  if (tone === "good") return "bg-green-500/15 text-green-300 border-green-500/40";
  if (tone === "warn") return "bg-amber-500/15 text-amber-300 border-amber-500/40";
  if (tone === "bad") return "bg-red-500/15 text-red-300 border-red-500/40";
  return "bg-muted text-muted-foreground";
}

// How long (ms) to stay in fast-polling mode after kicking off a sign-in
// before falling back to the slow 5-minute poll. The notebooklm login CLI
// gives the user time to complete Google sign-in interactively, but if they
// abandon the flow we don't want to poll forever.
const SIGN_IN_POLL_WINDOW_MS = 10 * 60 * 1000;

export function NotebookLMAuthCard() {
  const [polling, setPolling] = useState(false);
  const [pollingStartedAt, setPollingStartedAt] = useState<number | null>(null);
  const [lastSpawn, setLastSpawn] = useState<{ platform?: string; cmd?: string; note?: string } | null>(null);

  const checkAuth = trpc.notebooklm.checkAuth.useQuery(
    { force: polling }, // bypass cache while actively waiting on a sign-in
    {
      // Light auto-poll: every 5 minutes when idle, every 5 seconds while
      // we're expecting cookies to land.
      refetchInterval: polling ? 5_000 : 5 * 60_000,
    },
  );

  const activity = trpc.notebooklm.recentActivity.useQuery(
    { windowHours: 168 },
    { refetchInterval: 60_000 }, // refresh once a minute — cheap aggregate
  );

  const utils = trpc.useUtils();

  const spawn = trpc.notebooklm.spawnRelogin.useMutation({
    onSuccess: (result: any) => {
      setLastSpawn(result ?? null);
      if (result?.spawned) {
        setPolling(true);
        setPollingStartedAt(Date.now());
        toast.success(
          "Sign-in window opening. Complete Google sign-in, then press ENTER " +
            "in the command window. The card will auto-update.",
        );
      } else if (result?.platform === "posix") {
        toast.info("Run the command shown below in a terminal to sign in.");
      } else {
        toast.error(result?.error ?? "Failed to start the NotebookLM sign-in flow.");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  // Stop polling once we see valid cookies, or after the polling window expires.
  useEffect(() => {
    if (!polling) return;
    const status = (checkAuth.data as any)?.status;
    if (status === "valid") {
      setPolling(false);
      setPollingStartedAt(null);
      toast.success("NotebookLM connected.");
      return;
    }
    if (pollingStartedAt && Date.now() - pollingStartedAt > SIGN_IN_POLL_WINDOW_MS) {
      setPolling(false);
      setPollingStartedAt(null);
    }
  }, [polling, pollingStartedAt, checkAuth.data]);

  const auth = (checkAuth.data as any) ?? null;
  const status = (auth?.status as string) ?? "unknown";
  const presentation = STATUS_PRESENTATION[status] ?? STATUS_PRESENTATION.unknown;

  return (
    <Card data-agent-status="notebooklm-auth-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-purple-400" />
            <CardTitle>NotebookLM Connection</CardTitle>
          </div>
          <Badge
            variant="outline"
            className={badgeClass(presentation.tone)}
            data-agent-status="notebooklm-auth-status"
          >
            {presentation.label}
          </Badge>
        </div>
        <CardDescription className="pt-1">
          {presentation.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              utils.notebooklm.checkAuth.invalidate();
              checkAuth.refetch();
            }}
            disabled={checkAuth.isFetching}
            data-agent-action="refresh-notebooklm-auth"
          >
            {checkAuth.isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh status
          </Button>

          {status !== "valid" && (
            <Button
              size="sm"
              onClick={() => spawn.mutate()}
              disabled={spawn.isPending}
              data-agent-action="start-notebooklm-login"
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              {spawn.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="mr-2 h-4 w-4" />
              )}
              Sign in to NotebookLM
            </Button>
          )}
        </div>

        {polling && (
          <div className="flex items-start gap-2 text-xs text-amber-300" data-agent-status="notebooklm-awaiting-signin">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              <strong>Waiting for sign-in.</strong> A command window should have opened — finish
              the Google sign-in in the Chromium window, then press <kbd>ENTER</kbd> in the
              command window. This card refreshes every few seconds; status will flip to
              <em> Connected</em> automatically when cookies are saved.
            </span>
          </div>
        )}

        {lastSpawn?.platform === "posix" && lastSpawn?.cmd && (
          <div className="text-xs space-y-2" data-agent-status="notebooklm-posix-instructions">
            <div className="flex items-start gap-2 text-cyan-300">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{lastSpawn.note ?? "Run the following command in a terminal:"}</span>
            </div>
            <pre className="bg-muted/30 border border-border/40 rounded-md p-2 overflow-x-auto">
              {lastSpawn.cmd}
            </pre>
          </div>
        )}

        {auth?.details && !polling && (
          <p className="text-xs text-muted-foreground">{auth.details}</p>
        )}

        {activity.data && (activity.data as any).total > 0 && (
          <div
            className="pt-3 border-t border-border/30 space-y-2"
            data-agent-status="notebooklm-recent-activity"
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Activity className="h-3.5 w-3.5" />
              <span>
                Last 7 days: <strong className="text-foreground">{(activity.data as any).total}</strong>{" "}
                briefing{(activity.data as any).total === 1 ? "" : "s"}
                {(() => {
                  const s = (activity.data as any).byStatus ?? {};
                  const parts: string[] = [];
                  if (s.complete) parts.push(`${s.complete} complete`);
                  if (s.generating) parts.push(`${s.generating} in progress`);
                  if (s.failed) parts.push(`${s.failed} failed`);
                  return parts.length ? ` — ${parts.join(", ")}` : "";
                })()}
              </span>
            </div>

            {(activity.data as any).recentFailures?.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-medium">Recent failures (may indicate rate-limit pressure):</span>
                </div>
                <ul className="text-xs text-muted-foreground space-y-1 pl-5 list-disc">
                  {(activity.data as any).recentFailures.slice(0, 3).map((f: any) => (
                    <li key={f.id} className="leading-tight">
                      <span className="text-foreground">{f.title}</span> — {f.errorMessage ?? "no error message recorded"}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
