import { Loader2, Search, Sparkles, Target, AlertTriangle } from "lucide-react";

/**
 * The Scan → Filter → Score pipeline as a vertical rail. Replaces the
 * inline horizontal workflow row on the dashboard. Each step is a
 * `.workflow-step` with state (idle / active / done) driven by the parent.
 *
 * Database Cleanup is intentionally separated from the pipeline by a
 * divider — it is destructive maintenance, not part of the search flow.
 *
 * The parent owns the mutations + data and passes them in as props so the
 * rail stays presentational and testable.
 */

type DateLike = string | Date | null | undefined;

interface WorkflowRailProps {
  onScan: () => void;
  scanIsPending: boolean;
  scanLastCompletedAt?: DateLike;
  scanLastTotal?: number;
  scanLastNew?: number;

  onFilter: () => void;
  filterIsPending: boolean;
  filterEnabled: boolean;
  filterPendingCount?: number;
  filterLastCompletedAt?: DateLike;
  filterEligible?: number | null;
  filterIneligible?: number | null;

  onScore: () => void;
  scoreIsPending: boolean;
  scoreEnabled: boolean;
  scoreUnscoredCount?: number;
  scoreLastCompletedAt?: DateLike;

  onCleanup: () => void;
  cleanupIsPending: boolean;
  totalJobCount: number;
}

function fmtRelative(d?: DateLike): string {
  if (!d) return "";
  // tRPC + superjson hydrates timestamps inconsistently — sometimes a
  // Date object, sometimes an ISO string. new Date(...) accepts both.
  const t = d instanceof Date ? d.getTime() : new Date(d).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Step({
  num,
  title,
  state,
  meta,
  cta,
}: {
  num: number;
  title: string;
  state: "idle" | "active" | "done";
  meta: React.ReactNode;
  cta: React.ReactNode;
}) {
  return (
    <div className={`workflow-step ${state === "active" ? "active" : state === "done" ? "done" : ""}`}>
      <span className="step-num">{state === "active" ? <Loader2 size={12} className="animate-spin" /> : num}</span>
      <div className="flex-1" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="row-between" style={{ gap: 8 }}>
          <h4>{title}</h4>
        </div>
        {meta && <div className="step-meta">{meta}</div>}
        {cta}
      </div>
    </div>
  );
}

export function WorkflowRail(props: WorkflowRailProps) {
  const scanState: "idle" | "active" | "done" = props.scanIsPending
    ? "active"
    : props.scanLastCompletedAt
      ? "done"
      : "idle";
  const filterState: "idle" | "active" | "done" = props.filterIsPending
    ? "active"
    : props.filterLastCompletedAt
      ? "done"
      : "idle";
  const scoreState: "idle" | "active" | "done" = props.scoreIsPending
    ? "active"
    : props.scoreLastCompletedAt
      ? "done"
      : "idle";

  return (
    <div className="card card-pad stack" data-agent-status="dashboard-workflow">
      <div className="row-between">
        <div>
          <div className="eyebrow">Workflow</div>
          <div style={{ fontSize: "var(--font-sm)", fontWeight: 600, marginTop: 2 }}>
            Scan → Filter → Score
          </div>
        </div>
      </div>

      <div className="workflow">
        <Step
          num={1}
          title="Scan job sources"
          state={scanState}
          meta={
            props.scanLastCompletedAt ? (
              <>
                Last: {fmtRelative(props.scanLastCompletedAt)} ·{" "}
                <span className="mono">{props.scanLastTotal ?? 0}</span> found
                {props.scanLastNew ? (
                  <>
                    {" "}<span className="mono" style={{ color: "var(--ok)" }}>+{props.scanLastNew}</span>
                  </>
                ) : null}
              </>
            ) : (
              "Enabled job sources against your saved profile."
            )
          }
          cta={
            <button
              type="button"
              className="btn btn-primary btn-sm"
              data-agent-action="run-new-scan"
              onClick={props.onScan}
              disabled={props.scanIsPending}
            >
              {props.scanIsPending ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
              {props.scanIsPending ? "Scanning…" : "Start scan"}
            </button>
          }
        />

        <div className="workflow-connector" />

        <Step
          num={2}
          title="AI filter"
          state={filterState}
          meta={
            props.filterLastCompletedAt ? (
              <>
                Last: {fmtRelative(props.filterLastCompletedAt)}
                {typeof props.filterEligible === "number" && (
                  <>
                    {" "}· <span className="mono" style={{ color: "var(--ok)" }}>{props.filterEligible} eligible</span>
                  </>
                )}
                {typeof props.filterIneligible === "number" && (
                  <>
                    {" "}· <span className="mono" style={{ color: "var(--fg-dim)" }}>{props.filterIneligible} filtered</span>
                  </>
                )}
              </>
            ) : props.filterPendingCount ? (
              <>
                <span className="mono">{props.filterPendingCount.toLocaleString()}</span> jobs awaiting evaluation.
              </>
            ) : (
              "Score scanned jobs against your profile."
            )
          }
          cta={
            <button
              type="button"
              className="btn btn-primary btn-sm"
              data-agent-action="run-ai-filtering"
              onClick={props.onFilter}
              disabled={props.filterIsPending || !props.filterEnabled}
              title={!props.filterEnabled ? "Run a scan first" : undefined}
            >
              {props.filterIsPending ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {props.filterIsPending ? "Filtering…" : "Run filter"}
            </button>
          }
        />

        <div className="workflow-connector" />

        <Step
          num={3}
          title="Match scoring"
          state={scoreState}
          meta={
            props.scoreUnscoredCount ? (
              <>
                <span className="mono">{props.scoreUnscoredCount}</span> eligible jobs not yet scored.
              </>
            ) : props.scoreLastCompletedAt ? (
              <>Last: {fmtRelative(props.scoreLastCompletedAt)}</>
            ) : (
              "Rank eligible jobs by profile fit."
            )
          }
          cta={
            <button
              type="button"
              className="btn btn-primary btn-sm"
              data-agent-action="execute-match-scoring"
              onClick={props.onScore}
              disabled={props.scoreIsPending || !props.scoreEnabled}
              title={!props.scoreEnabled ? "Filter first to produce eligible jobs" : undefined}
            >
              {props.scoreIsPending ? <Loader2 size={12} className="animate-spin" /> : <Target size={12} />}
              {props.scoreIsPending ? "Scoring…" : "Run scoring"}
            </button>
          }
        />
      </div>

      <hr className="divider" />

      <div className="row-between">
        <div>
          <div className="eyebrow" style={{ color: "var(--err)" }}>Maintenance</div>
          <div className="dim" style={{ fontSize: "var(--font-xs)", marginTop: 2 }}>
            Wipes every job + scan + score.
          </div>
        </div>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          data-agent-action="trigger-db-cleanup"
          onClick={props.onCleanup}
          disabled={props.cleanupIsPending}
        >
          {props.cleanupIsPending ? <Loader2 size={12} className="animate-spin" /> : <AlertTriangle size={12} />}
          {props.cleanupIsPending ? "Cleaning…" : `Cleanup (${props.totalJobCount.toLocaleString()})`}
        </button>
      </div>
    </div>
  );
}
