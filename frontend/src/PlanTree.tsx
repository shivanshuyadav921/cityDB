import { useState } from "react";
import type { VisualOperation, VisualTimeline } from "./ir";
import { EXPLAIN_KNOWLEDGE } from "./explainKnowledge";

interface PlanTreeProps {
  timeline: VisualTimeline | null;
  hoveredOpId: string | null;
  onHoverOp: (id: string | null) => void;
  onPlayOp?: (opId: string) => void;
  selectedOpId?: string | null;
}

export function PlanTree({ timeline, hoveredOpId, onHoverOp, onPlayOp, selectedOpId }: PlanTreeProps) {
  if (!timeline) {
    return (
      <div style={panelStyle}>
        <div style={{ color: "#5a6a8f", fontSize: 12 }}>
          Plan tree will appear here after you run a query.
        </div>
      </div>
    );
  }

  const byId = new Map(timeline.operations.map((op) => [op.id, op]));
  const root = byId.get(timeline.rootOpId);

  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: "#8fb0ff" }}>Query Plan Tree</div>
        {timeline.explainOnly && (
          <div style={{
            fontSize: 9,
            color: "#ffe14d",
            background: "#1a1500",
            border: "1px solid #4a3a00",
            borderRadius: 3,
            padding: "2px 6px",
          }}>
            COST ESTIMATES ONLY
          </div>
        )}
      </div>
      {root && (
        <TreeNode
          op={root}
          byId={byId}
          depth={0}
          hoveredOpId={hoveredOpId}
          onHoverOp={onHoverOp}
          onPlayOp={onPlayOp}
          selectedOpId={selectedOpId}
          explainOnly={timeline.explainOnly}
        />
      )}
      {hoveredOpId && byId.get(hoveredOpId) && (
        <ExplainCard op={byId.get(hoveredOpId)!} />
      )}
      <div style={{ fontSize: 10, color: "#3d4a70", marginTop: 12 }}>
        Hover a node to highlight its district in the city and see why the planner chose it →
      </div>
      {onPlayOp && !timeline.explainOnly && (
        <div style={{ fontSize: 10, color: "#3d4a70", marginTop: 4 }}>
          Click a node to play only that operator's execution.
        </div>
      )}
    </div>
  );
}

function TreeNode({
  op,
  byId,
  depth,
  hoveredOpId,
  onHoverOp,
  onPlayOp,
  selectedOpId,
  explainOnly,
}: {
  op: VisualOperation;
  byId: Map<string, VisualOperation>;
  depth: number;
  hoveredOpId: string | null;
  onHoverOp: (id: string | null) => void;
  onPlayOp?: (opId: string) => void;
  selectedOpId?: string | null;
  explainOnly?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const isHovered = op.id === hoveredOpId;
  const isSelected = op.id === selectedOpId;
  const hasChildren = op.children.length > 0;

  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div
        onMouseEnter={() => onHoverOp(op.id)}
        onMouseLeave={() => onHoverOp(null)}
        onClick={() => !explainOnly && onPlayOp && onPlayOp(op.id)}
        style={{
          padding: "6px 8px",
          marginBottom: 4,
          borderRadius: 6,
          cursor: (!explainOnly && onPlayOp) ? "pointer" : "default",
          background: isSelected ? "rgba(255,225,77,0.25)" : isHovered ? "rgba(255,225,77,0.15)" : "transparent",
          border: `1px solid ${isSelected ? "#ffe14d" : isHovered ? "#ffe14d" : "#1a2340"}`,
          display: "flex",
          alignItems: "flex-start",
          gap: 4,
        }}
      >
        {/* Collapse toggle */}
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed((c) => !c);
            }}
            title={collapsed ? "Expand" : "Collapse"}
            style={{
              background: "transparent",
              border: "none",
              color: "#5a6a8f",
              cursor: "pointer",
              fontSize: 10,
              padding: "0 2px",
              lineHeight: 1,
              flexShrink: 0,
              marginTop: 1,
            }}
          >
            {collapsed ? "▶" : "▼"}
          </button>
        )}
        {!hasChildren && <span style={{ width: 14, flexShrink: 0 }} />}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: (isSelected || isHovered) ? "#ffe14d" : "#e8ecff" }}>
            {opIcon(op.type)} {op.label}
            {collapsed && hasChildren && (
              <span style={{ fontSize: 9, color: "#3d4a70", marginLeft: 6 }}>
                [{op.children.length} child{op.children.length !== 1 ? "ren" : ""}]
              </span>
            )}
          </div>
          <div style={{ fontSize: 9, color: "#5a6a8f" }}>
            {explainOnly
              ? `est. ${op.costEstimate.toFixed(1)} cost · ${op.rowsReturned.toLocaleString()} rows (est.)`
              : `${op.actualTimeMs.toFixed(2)}ms · ${op.rowsReturned.toLocaleString()} rows`
            }
          </div>
        </div>
      </div>

      {!collapsed && op.children.map((childId) => {
        const child = byId.get(childId);
        if (!child) return null;
        return (
          <TreeNode
            key={childId}
            op={child}
            byId={byId}
            depth={depth + 1}
            hoveredOpId={hoveredOpId}
            onHoverOp={onHoverOp}
            onPlayOp={onPlayOp}
            selectedOpId={selectedOpId}
            explainOnly={explainOnly}
          />
        );
      })}
    </div>
  );
}

function ExplainCard({ op }: { op: VisualOperation }) {
  const entry = EXPLAIN_KNOWLEDGE[op.type];
  if (!entry) return null;
  return (
    <div
      style={{
        marginTop: 10,
        padding: 10,
        borderRadius: 6,
        background: "#0a0e1a",
        border: "1px solid #ffe14d33",
      }}
    >
      <div style={{ fontSize: 12, color: "#ffe14d", marginBottom: 4 }}>{entry.title}</div>
      <div style={{ fontSize: 10, color: "#c8d0ee", marginBottom: 4 }}>{entry.whatItDoes}</div>
      <div style={{ fontSize: 10, color: "#8fa0cc", marginBottom: 4 }}>
        <strong style={{ color: "#5a6a8f" }}>Why: </strong>
        {entry.whyItHappened}
      </div>
      <div style={{ fontSize: 10, color: "#5a6a8f", marginBottom: 4 }}>
        <strong>Complexity: </strong>
        {entry.complexity}
      </div>
      {entry.advantages.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 9, color: "#5a6a8f", marginBottom: 2 }}>✓ Advantages:</div>
          {entry.advantages.map((adv, i) => (
            <div key={i} style={{ fontSize: 9, color: "#8fa0cc", marginLeft: 8 }}>{adv}</div>
          ))}
        </div>
      )}
      {entry.disadvantages.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 9, color: "#5a6a8f", marginBottom: 2 }}>✗ Disadvantages:</div>
          {entry.disadvantages.map((dis, i) => (
            <div key={i} style={{ fontSize: 9, color: "#8fa0cc", marginLeft: 8 }}>{dis}</div>
          ))}
        </div>
      )}
      {entry.bestUseCases.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 9, color: "#5a6a8f", marginBottom: 2 }}>★ Best Use Cases:</div>
          {entry.bestUseCases.map((use, i) => (
            <div key={i} style={{ fontSize: 9, color: "#8fa0cc", marginLeft: 8 }}>{use}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function opIcon(type: VisualOperation["type"]) {
  switch (type) {
    case "scan":      return "🔦";
    case "beam":
    case "bitmap":    return "⚡";
    case "traffic":   return "🚗";
    case "fold":      return "🗂";
    case "zipper":    return "🔗";
    case "sort":      return "↕";
    case "aggregate": return "▲";
    case "limit":     return "✂";
    case "result":    return "◉";
    default:          return "•";
  }
}

const panelStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 16,
  left: 16,
  width: 340,
  maxHeight: 420,
  overflowY: "auto",
  background: "rgba(8,12,24,0.9)",
  border: "1px solid #1a2340",
  borderRadius: 8,
  padding: 14,
  backdropFilter: "blur(6px)",
};
