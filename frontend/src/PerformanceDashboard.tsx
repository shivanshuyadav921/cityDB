import type { VisualTimeline } from "./ir";

// Performance Dashboard.
// Memory/CPU/IO are heuristic estimates derived from buffer counts — PostgreSQL's
// EXPLAIN ANALYZE does not report process-level memory or CPU directly.
// All estimates are clearly labeled so users understand what is measured vs. estimated.
export function PerformanceDashboard({ timeline }: { timeline: VisualTimeline | null }) {
  if (!timeline) return null;

  const rootOp = timeline.operations.find((o) => o.id === timeline.rootOpId);
  const totalRowsExamined = Math.max(...timeline.operations.map((o) => o.rowsExamined), 0);
  const totalBuffersHit = sumMeta(timeline, "sharedHitBlocks");
  const totalBuffersRead = sumMeta(timeline, "sharedReadBlocks");
  const totalTempRead = sumMeta(timeline, "tempReadBlocks");
  const totalTempWritten = sumMeta(timeline, "tempWrittenBlocks");
  const totalHeapFetches = sumMeta(timeline, "heapFetches");
  const maxWorkersPlanned = maxMeta(timeline, "workersPlanned");
  const maxWorkersLaunched = maxMeta(timeline, "workersLaunched");
  const estimatedMemoryMb = ((totalBuffersHit + totalBuffersRead) * 8) / 1024; // 8KB pages

  const ioLevel =
    totalBuffersRead === 0 ? "None"
    : totalBuffersRead < 50 ? "Low"
    : totalBuffersRead < 500 ? "Medium"
    : "High";

  const ioColor =
    ioLevel === "None" ? "#4aff8a"
    : ioLevel === "Low" ? "#8fb0ff"
    : ioLevel === "Medium" ? "#ffe14d"
    : "#ff5a6e";

  return (
    <div style={panelStyle}>
      <div style={{ fontSize: 12, color: "#8fb0ff", marginBottom: 10 }}>Performance Dashboard</div>

      {timeline.explainOnly && (
        <div style={{
          fontSize: 9,
          color: "#ffe14d",
          background: "#1a1500",
          border: "1px solid #4a3a00",
          borderRadius: 3,
          padding: "3px 6px",
          marginBottom: 8,
        }}>
          Cost estimates only — run Execute for real timings
        </div>
      )}

      <Metric
        label="Execution Time"
        value={timeline.explainOnly ? "—" : `${timeline.totalExecutionTimeMs.toFixed(2)} ms`}
        accent
      />
      <Metric
        label="Planning Time"
        value={timeline.explainOnly ? "—" : `${timeline.totalPlanningTimeMs.toFixed(2)} ms`}
      />
      <Metric label="Rows Returned" value={(rootOp?.rowsReturned ?? 0).toLocaleString()} />
      <Metric label="Rows Scanned" value={totalRowsExamined.toLocaleString()} />
      <Metric label="Buffers Hit / Read" value={`${totalBuffersHit} / ${totalBuffersRead}`} />
      <Metric
        label="Temp Read / Written"
        value={`${totalTempRead} / ${totalTempWritten}`}
        note="disk spill blocks"
      />
      {totalHeapFetches > 0 && (
        <Metric label="Heap Fetches" value={totalHeapFetches.toLocaleString()} note="from visibility map" />
      )}
      {maxWorkersPlanned > 0 && (
        <Metric
          label="Parallel Workers"
          value={`${maxWorkersLaunched} / ${maxWorkersPlanned} launched`}
        />
      )}
      <Metric
        label="Est. Memory"
        value={`${estimatedMemoryMb.toFixed(1)} MB`}
        note="estimated from buffer pages"
      />
      <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#5a6a8f", fontSize: 11 }}>I/O Pressure</span>
        <span style={{
          color: ioColor,
          fontSize: 11,
          fontWeight: 600,
          padding: "1px 6px",
          background: `${ioColor}18`,
          border: `1px solid ${ioColor}44`,
          borderRadius: 3,
        }}>
          {ioLevel}
        </span>
      </div>
    </div>
  );
}

function sumMeta(timeline: VisualTimeline, key: string): number {
  return timeline.operations.reduce((sum, op) => sum + Number(op.metadata[key] ?? 0), 0);
}

function maxMeta(timeline: VisualTimeline, key: string): number {
  return Math.max(...timeline.operations.map((op) => Number(op.metadata[key] ?? 0)));
}

function Metric({
  label,
  value,
  accent,
  note,
}: {
  label: string;
  value: string;
  accent?: boolean;
  note?: string;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
        <span style={{ color: "#5a6a8f" }}>{label}</span>
        <span style={{ color: accent ? "#ffe14d" : "#e8ecff", fontWeight: accent ? 700 : 400 }}>
          {value}
        </span>
      </div>
      {note && <div style={{ fontSize: 9, color: "#3d4a70", textAlign: "right" }}>{note}</div>}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 16,
  right: 16,
  width: 230,
  background: "rgba(8,12,24,0.9)",
  border: "1px solid #1a2340",
  borderRadius: 8,
  padding: 14,
  backdropFilter: "blur(6px)",
};
