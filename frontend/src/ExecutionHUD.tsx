import type { VisualOperation, VisualTimeline } from "./ir";

export function ExecutionHUD({
  timeline,
  playheadMs,
}: {
  timeline: VisualTimeline | null;
  playheadMs: number;
}) {
  if (!timeline) {
    return (
      <div style={panelStyle}>
        <div style={{ color: "#5a6a8f", fontSize: 11, textAlign: "center" }}>
          Execute or Explain a query to inspect live PostgreSQL metrics.
        </div>
      </div>
    );
  }

  const activeOp =
    timeline.operations.find(
      (op) => playheadMs >= op.startTime && playheadMs < op.startTime + op.duration
    ) || timeline.operations[timeline.operations.length - 1];

  return (
    <div style={panelStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
          borderBottom: "1px solid #1a2340",
          paddingBottom: 6,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: "#ffe14d", letterSpacing: "0.05em" }}>
          EXECUTION HUD
        </span>
        {timeline.explainOnly ? (
          <span
            style={{
              fontSize: 9,
              background: "#1a1500",
              color: "#ffe14d",
              border: "1px solid #4a3a00",
              padding: "1px 5px",
              borderRadius: 3,
            }}
          >
            COST ESTIMATES
          </span>
        ) : (
          <span
            style={{
              fontSize: 9,
              background: "rgba(74, 255, 138, 0.1)",
              color: "#4aff8a",
              border: "1px solid rgba(74, 255, 138, 0.3)",
              padding: "1px 5px",
              borderRadius: 3,
            }}
          >
            ANALYZE (LIVE)
          </span>
        )}
      </div>

      <div
        style={{
          color: "#8fa0cc",
          marginBottom: 10,
          fontSize: 11,
          fontFamily: "monospace",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={timeline.queryText}
      >
        {timeline.queryText}
      </div>

      <Row label="Current Operator" value={activeOp?.label ?? "—"} highlight />
      <Row
        label="Execution Time"
        value={
          timeline.explainOnly
            ? "N/A (Cost only)"
            : `${timeline.totalExecutionTimeMs.toFixed(2)} ms`
        }
      />
      <Row label="Planning Time" value={`${timeline.totalPlanningTimeMs.toFixed(2)} ms`} />
      <Row label="Rows Examined" value={fmt(activeOp?.rowsExamined ?? 0)} />
      <Row label="Rows Returned" value={fmt(activeOp?.rowsReturned ?? 0)} />
      <Row
        label="Buffers Hit / Read"
        value={`${activeOp?.metadata?.sharedHitBlocks ?? 0} / ${
          activeOp?.metadata?.sharedReadBlocks ?? 0
        }`}
      />
      <Row
        label="Temp Read / Written"
        value={`${activeOp?.metadata?.tempReadBlocks ?? 0} / ${
          activeOp?.metadata?.tempWrittenBlocks ?? 0
        }`}
      />
      {Number(activeOp?.metadata?.workersPlanned ?? 0) > 0 && (
        <Row
          label="Parallel Workers"
          value={`${activeOp?.metadata?.workersLaunched ?? 0} / ${
            activeOp?.metadata?.workersPlanned ?? 0
          } launched`}
        />
      )}

      <div style={{ marginTop: 10, borderTop: "1px solid #1a2340", paddingTop: 8 }}>
        <div style={{ fontSize: 9, color: "#5a6a8f", marginBottom: 6, fontWeight: 600 }}>
          OPERATOR TIMELINE
        </div>
        {timeline.operations
          .slice()
          .sort((a, b) => a.startTime - b.startTime)
          .map((op) => (
            <OperatorBar key={op.id} op={op} active={op.id === activeOp?.id} />
          ))}
      </div>
    </div>
  );
}

function OperatorBar({ op, active }: { op: VisualOperation; active: boolean }) {
  return (
    <div style={{ marginBottom: 6, opacity: active ? 1 : 0.45 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: active ? "#ffe14d" : "#5a6a8f" }}>
        <span>{op.label}</span>
        <span>{op.actualTimeMs.toFixed(2)}ms</span>
      </div>
      <div style={{ background: "#111a30", height: 4, borderRadius: 2, marginTop: 2 }}>
        <div
          style={{
            width: `${Math.max(4, op.intensity * 100)}%`,
            background: active ? "#ffe14d" : "#4d7cff",
            height: 4,
            borderRadius: 2,
          }}
        />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
      <span style={{ color: "#5a6a8f" }}>{label}</span>
      <span style={{ color: highlight ? "#ffe14d" : "#e8ecff", fontWeight: highlight ? 700 : 400 }}>
        {value}
      </span>
    </div>
  );
}

function fmt(n: number) {
  return n.toLocaleString();
}

const panelStyle: React.CSSProperties = {
  position: "absolute",
  top: 64,
  right: 16,
  width: 290,
  background: "rgba(8,12,24,0.92)",
  border: "1px solid #1a2340",
  borderRadius: 10,
  padding: 14,
  color: "#e8ecff",
  backdropFilter: "blur(8px)",
  maxHeight: "calc(50vh - 40px)",
  overflowY: "auto",
  zIndex: 10,
};
