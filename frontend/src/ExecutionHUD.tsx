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
        <div style={{ color: "#5a6a8f" }}>Run a query to see it execute.</div>
      </div>
    );
  }

  const activeOp =
    timeline.operations.find(
      (op) => playheadMs >= op.startTime && playheadMs < op.startTime + op.duration
    ) || timeline.operations[timeline.operations.length - 1];

  return (
    <div style={panelStyle}>
      <div style={{ color: "#8fb0ff", marginBottom: 8, fontSize: 12 }}>
        {timeline.queryText}
      </div>
      <Row label="Operator" value={activeOp?.label ?? "—"} highlight />
      <Row label="Execution Time" value={`${timeline.totalExecutionTimeMs.toFixed(2)} ms`} />
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
      <div style={{ marginTop: 12, borderTop: "1px solid #1a2340", paddingTop: 8 }}>
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
      <div style={{ fontSize: 10, color: active ? "#ffe14d" : "#5a6a8f" }}>
        {op.label} · {op.actualTimeMs.toFixed(2)}ms
      </div>
      <div style={{ background: "#111a30", height: 4, borderRadius: 2 }}>
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
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
      <span style={{ color: "#5a6a8f" }}>{label}</span>
      <span style={{ color: highlight ? "#ffe14d" : "#e8ecff" }}>{value}</span>
    </div>
  );
}

function fmt(n: number) {
  return n.toLocaleString();
}

const panelStyle: React.CSSProperties = {
  position: "absolute",
  top: 16,
  right: 16,
  width: 320,
  background: "rgba(8,12,24,0.88)",
  border: "1px solid #1a2340",
  borderRadius: 8,
  padding: 16,
  color: "#e8ecff",
  backdropFilter: "blur(6px)",
};
