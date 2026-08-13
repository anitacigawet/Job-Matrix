/**
 * Five-cell status strip at the top of the dashboard main column. Derived
 * from the dashboard's already-loaded data — does no fetching of its own.
 */

interface StatusStripProps {
  scanned: number;
  eligible: number;
  filteredOut: number;
  scored: number;
  awaitingScore: number;
}

export function StatusStrip({
  scanned,
  eligible,
  filteredOut,
  scored,
  awaitingScore,
}: StatusStripProps) {
  return (
    <div className="status-strip" data-agent-status="dashboard-status-strip">
      <div className="cell">
        <span className="stat-label">Scanned</span>
        <span className="stat-num">{scanned.toLocaleString()}</span>
      </div>
      <div className="cell">
        <span className="stat-label">Eligible</span>
        <span className="stat-num" style={{ color: "var(--accent-1)" }}>
          {eligible.toLocaleString()}
        </span>
      </div>
      <div className="cell">
        <span className="stat-label">Filtered out</span>
        <span className="stat-num" style={{ color: filteredOut > 0 ? "var(--fg-dim)" : "var(--fg-dim)" }}>
          {filteredOut.toLocaleString()}
        </span>
      </div>
      <div className="cell">
        <span className="stat-label">Scored</span>
        <span className="stat-num" style={{ color: "var(--ok)" }}>
          {scored.toLocaleString()}
        </span>
      </div>
      <div className="cell">
        <span className="stat-label">Awaiting score</span>
        <span className="stat-num" style={{ color: awaitingScore > 0 ? "var(--warn)" : "var(--fg-dim)" }}>
          {awaitingScore.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
