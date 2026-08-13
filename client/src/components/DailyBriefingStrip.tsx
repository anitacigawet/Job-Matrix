import { useMemo } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, Loader2, Mic, Play, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getFriendlyApiErrorMessage } from "@/lib/api-errors";

/**
 * Dashboard-top strip that surfaces today's Daily Coach Audio briefing. Has
 * four visual states: empty (never generated, or older than 24h), generating,
 * failed, and complete. Always renders the same `.daily-strip` skeleton so
 * the dashboard layout doesn't shift when the state flips.
 *
 * Clicking the thumbnail in the complete state routes to /briefings — playback
 * lives there, with the full audio player + transcript surface. The strip is a
 * surface, not a replacement.
 */

const TYPE = "daily_coach_audio" as const;
const FRESH_HOURS = 24;

function mediaUrl(briefing: { mediaPath?: string | null } | undefined | null): string | null {
  if (!briefing?.mediaPath) return null;
  const normalised = briefing.mediaPath.replace(/\\/g, "/").replace(/^briefings\//, "");
  return `/briefings-media/${normalised}`;
}

function relTime(iso?: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "moments ago";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function ThumbWave() {
  // Inline animated waveform — pure SVG so it doesn't require an asset
  // pipeline and inherits accent through currentColor.
  return (
    <svg viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="briefingThumbGrad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="var(--accent-1)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="var(--accent-2)" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      {Array.from({ length: 30 }).map((_, i) => {
        const x = 6 + i * 6.4;
        const seed = (Math.sin(i * 1.7) + 1) / 2;
        const h = 18 + seed * 60;
        return (
          <rect
            key={i}
            x={x}
            y={50 - h / 2}
            width={3}
            height={h}
            rx={1.5}
            fill="url(#briefingThumbGrad)"
            opacity={0.45 + seed * 0.5}
          />
        );
      })}
    </svg>
  );
}

export function DailyBriefingStrip() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const list = trpc.briefings.list.useQuery(
    { limit: 100 },
    {
      refetchInterval: (q) => {
        const rows = (q.state.data ?? []) as any[];
        return rows.some((r) => r.briefingType === TYPE && r.status === "generating") ? 8_000 : false;
      },
      staleTime: 60_000,
    },
  );

  const latest = useMemo(() => {
    const rows = (list.data ?? []) as any[];
    return (
      rows
        .filter((r) => r.briefingType === TYPE)
        .sort(
          (a, b) =>
            (new Date(b.createdAt as any).getTime() || 0) -
            (new Date(a.createdAt as any).getTime() || 0),
        )[0] ?? null
    );
  }, [list.data]);

  const generate = trpc.briefings.generate.useMutation({
    onSuccess: () => {
      toast.success("Briefing queued — generation runs in the background.");
      utils.briefings.list.invalidate();
    },
    onError: (err) => toast.error(getFriendlyApiErrorMessage(err)),
  });

  const status = (latest?.status as string | undefined) ?? "none";
  const created = latest?.createdAt;
  const ageMs = created ? Date.now() - new Date(created as any).getTime() : Infinity;
  const isFresh = status === "complete" && Number.isFinite(ageMs) && ageMs < FRESH_HOURS * 3_600_000;
  const isGenerating = status === "generating" || status === "pending";
  const isFailed = status === "failed";
  // Surface fetch errors as a distinct rail rather than silently falling
  // back to the "empty" state — otherwise a flaky network looks like a
  // never-generated briefing and prompts the user to retry generation
  // when the real fix is to reload the page.
  const isFetchError = list.isError && !latest;

  // Empty = no briefing yet OR latest is complete but stale OR latest just failed
  // (we still show retry, so failed is a distinct rail).
  const isEmpty = !isFetchError && (!latest || (status === "complete" && !isFresh));

  let title = "Today's coach briefing";
  let sub: React.ReactNode = "Two-host 10–12 min recap of overnight scans, applications, and what to focus on next.";

  if (isFetchError) {
    title = "Couldn't load briefing status";
    sub = (
      <>
        {(list.error as any)?.message ?? "Network error fetching the briefings list."}{" "}
        Refresh the page or check the server connection.
      </>
    );
  } else if (isGenerating) {
    title = "Briefing in progress";
    sub = "NotebookLM is rendering today's two-host Deep Dive. Usually takes 7–15 minutes.";
  } else if (isFailed) {
    title = "Generation failed";
    sub = (latest?.errorMessage as string | undefined) ?? "The last attempt errored. Retry or check Briefings for details.";
  } else if (isFresh) {
    title = (latest!.title as string) || "Daily coach briefing";
    sub = (
      <>
        Generated {relTime(latest!.createdAt as string)} · two-host audio · click to listen
      </>
    );
  }

  function handleGenerate() {
    generate.mutate({ type: TYPE as any });
  }

  function openBriefings() {
    setLocation("/briefings");
  }

  const ctaDisabled = generate.isPending || isGenerating;
  const audioReady = isFresh && Boolean(mediaUrl(latest));

  return (
    <div className="card daily-strip" data-agent-status="daily-briefing-strip">
      <div className="ds-info">
        <div className="row-tight" style={{ marginBottom: 4 }}>
          <span className="badge badge-accent" style={{ gap: 4 }}>
            <Sparkles size={10} /> Daily coach
          </span>
          {isGenerating && (
            <span className="badge badge-info dot" style={{ gap: 4 }}>
              <Loader2 size={10} className="animate-spin" /> Generating
            </span>
          )}
          {isFresh && (
            <span className="badge badge-ok dot">Ready</span>
          )}
          {isFailed && (
            <span className="badge badge-err dot">Failed</span>
          )}
          {isFetchError && (
            <span className="badge badge-err dot" style={{ gap: 4 }}>
              <AlertTriangle size={10} /> Fetch error
            </span>
          )}
        </div>
        <div className="ds-title">{title}</div>
        <div className="ds-sub">{sub}</div>
        {isFresh && (
          <div className="ds-scrub" aria-hidden>
            <div style={{ width: "0%" }} />
          </div>
        )}
        <div className="row-tight" style={{ marginTop: 10, flexWrap: "wrap" }}>
          {isFetchError && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              data-agent-action="retry-daily-briefing-fetch"
              onClick={() => list.refetch()}
              disabled={list.isFetching}
            >
              {list.isFetching ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {list.isFetching ? "Retrying…" : "Retry"}
            </button>
          )}
          {isEmpty && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              data-agent-action="generate-daily-briefing"
              onClick={handleGenerate}
              disabled={ctaDisabled}
            >
              {generate.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Mic size={12} />
              )}
              {generate.isPending ? "Queuing…" : "Generate today's briefing"}
            </button>
          )}
          {isFailed && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              data-agent-action="retry-daily-briefing"
              onClick={handleGenerate}
              disabled={ctaDisabled}
            >
              <RefreshCw size={12} />
              Retry
            </button>
          )}
          {audioReady && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              data-agent-action="play-daily-briefing"
              onClick={openBriefings}
            >
              <Play size={12} /> Open in Briefings
            </button>
          )}
          {(isEmpty || isFailed || isFresh) && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              data-agent-action="go-to-briefings"
              onClick={openBriefings}
            >
              View all briefings
            </button>
          )}
        </div>
      </div>
      <button
        type="button"
        className="ds-thumb"
        data-agent-action={audioReady ? "play-daily-briefing" : "go-to-briefings"}
        onClick={openBriefings}
        aria-label={audioReady ? "Open today's briefing" : "Go to briefings"}
        style={{ background: "var(--bg-2)" }}
      >
        <ThumbWave />
        <span className="ds-thumb-label">
          {audioReady ? "PLAY" : isGenerating ? "RENDERING" : isFailed ? "RETRY" : "NEW"}
        </span>
      </button>
    </div>
  );
}
