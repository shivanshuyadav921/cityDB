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

export function PlanTree({
  timeline,
  hoveredOpId,
  onHoverOp,
  onPlayOp,
  selectedOpId,
}: PlanTreeProps) {
  const [minimized, setMinimized] = useState(false);

  if (!timeline) {
    return null;
  }

  const byId = new Map(timeline.operations.map((op) => [op.id, op]));
  const root = byId.get(timeline.rootOpId);

  return (
    <div
      style={{
        ...panelStyle,
        maxHeight: minimized ? "44px" : "360px",
        overflowY: minimized ? "hidden" : "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: minimized ? 0 : 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#8fb0ff" }}>
            Query Plan Tree
          </span>
          {timeline.explainOnly && (
            <span
              style={{
                fontSize: 9,
                color: "#ffe14d",
                background: "#1a1500",
                border: "1px solid #4a3a00",
                borderRadius: 3,
                padding: "1px 5px",
              }}
            >
              COST ONLY
            </span>
          )}
        </div>
        <button
          onClick={() => setMinimized((m) => !m)}
          style={{
            background: "transparent",
            border: "none",
            color: "#5a6a8f",
            cursor: "pointer",
            fontSize: 12,
            padding: "2px 6px",
          }}
          title={minimized ? "Expand" : "Minimize"}
        >
          {minimized ? "▲" : "▼"}
        </button>
      </div>

      {!minimized && (
        <>
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
          <div style={{ fontSize: 10, color: "#3d4a70", marginTop: 10 }}>
            Hover a node to highlight its district in the city.
          </div>
          {onPlayOp && !timeline.explainOnly && (
            <div style={{ fontSize: 10, color: "#3d4a70", marginTop: 2 }}>
              Click a node to replay that operator.
            </div>
          )}
        </>
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
    <div style={{ marginLeft: depth * 14 }}>
      <div
        onMouseEnter={() => onHoverOp(op.id)}
        onMouseLeave={() => onHoverOp(null)}
        onClick={() => !explainOnly && onPlayOp && onPlayOp(op.id)}
        style={{
          padding: "5px 8px",
          marginBottom: 4,
          borderRadius: 6,
          cursor: !explainOnly && onPlayOp ? "pointer" : "default",
          background: isSelected
            ? "rgba(255,225,77,0.25)"
            : isHovered
            ? "rgba(255,225,77,0.15)"
            : "transparent",
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
              background: "none",
              border: "none",
              color: "#ffe14d",
              cursor: "pointer",
              fontSize: 9,
              padding: "0 2px",
              lineHeight: 1,
              marginTop: 2,
              flexShrink: 0,
            }}
          >
            {collapsed ? "▶" : "▼"}
          </button>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 11 }}>{opIcon(op.type)}</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: isSelected ? "#ffe14d" : "#e8ecff",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {op.label}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              fontSize: 9,
              color: "#5a6a8f",
              marginTop: 2,
            }}
          >
            <span>cost: {Math.round(op.costEstimate)}</span>
            <span>rows: {op.rowsReturned.toLocaleString()}</span>
            <span>
              time:{" "}
              {explainOnly ? "est." : `${op.actualTimeMs.toFixed(1)}ms`}
            </span>
          </div>
        </div>
      </div>

      {hasChildren &&
        !collapsed &&
        op.children.map((childId) => {
          const child = byId.get(childId);
          if (!child) return null;
          return (
            <TreeNode
              key={child.id}
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
  const knowledge = EXPLAIN_KNOWLEDGE[op.type];
  if (!knowledge) return null;

  return (
    <div
      style={{
        marginTop: 10,
        padding: 10,
        background: "#05070d",
        border: "1px solid #ffe14d44",
        borderRadius: 6,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: "#ffe14d", marginBottom: 4 }}>
        {knowledge.title}
      </div>
      <div style={{ fontSize: 10, color: "#8fa0cc", lineHeight: 1.4, marginBottom: 6 }}>
        {knowledge.description}
      </div>
      {knowledge.whenUsed && (
        <div style={{ fontSize: 9, color: "#5a6a8f" }}>
          <strong>When chosen:</strong> {knowledge.whenUsed}
        </div>
      )}
    </div>
  );
}

function opIcon(type: VisualOperation["type"]) {
  switch (type) {
    case "scan":
      return "🔦";
    case "beam":
    case "bitmap":
      return "⚡";
    case "traffic":
      return "🚗";
    case "fold":
      return "🗂";
    case "zipper":
      return "🔗";
    case "sort":
      return "↕";
    case "aggregate":
      return "▲";
    case "limit":
      return "✂";
    case "result":
      return "◉";
    default:
      return "•";
  }
}

const panelStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 16,
  left: 352,
  width: 320,
  background: "rgba(8,12,24,0.92)",
  border: "1px solid #1a2340",
  borderRadius: 10,
  padding: 12,
  backdropFilter: "blur(8px)",
  zIndex: 10,
};
