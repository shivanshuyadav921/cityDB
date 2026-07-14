import type { PostgresExplainRoot, PostgresPlanNode } from "./postgres.js";
import type { VisualOperation, VisualOpType, VisualTimeline } from "./ir.js";

// ─── Timing normalization constants ───────────────────────────────────────────
// Normalize real execution time into watchable playback time.
// Fast queries (<1ms) still get a minimum duration so the animation reads.
const MIN_OP_DURATION_MS = 400;
const MAX_TOTAL_DURATION_MS = 8000;

// ─── Node type → IR type mapping ─────────────────────────────────────────────

function mapNodeType(nodeType: string): VisualOpType {
  switch (nodeType) {
    case "Seq Scan":
      return "scan";
    case "Index Scan":
    case "Index Only Scan":
      return "beam";
    case "Bitmap Heap Scan":
    case "Bitmap Index Scan":
      return "bitmap";
    case "Nested Loop":
      return "traffic";
    case "Hash Join":
    case "Hash":
      return "fold";
    case "Merge Join":
      return "zipper";
    case "Sort":
      return "sort";
    case "Aggregate":
    case "HashAggregate":
    case "GroupAggregate":
    case "MixedAggregate":
      return "aggregate";
    case "Limit":
      return "limit";
    case "Append":
    case "MergeAppend":
    case "Subquery Scan":
    case "Values Scan":
    case "CTE Scan":
    case "Named Tuplestore Scan":
    case "WorkTable Scan":
      return "scan";
    case "Materialize":
    case "Memoize":
      return "scan";
    case "Gather":
    case "Gather Merge":
      return "aggregate";
    case "Unique":
    case "SetOp":
    case "LockRows":
      return "aggregate";
    case "Result":
    case "ProjectSet":
    case "ModifyTable":
    case "InitPlan":
    case "SubPlan":
      return "result";
    case "BitmapAnd":
    case "BitmapOr":
      return "bitmap";
    case "Function Scan":
    case "Table Function Scan":
      return "scan";
    case "Foreign Scan":
    case "Custom Scan":
      return "scan";
    case "Recursive Union":
      return "zipper";
    default:
      return "scan";
  }
}

// ─── Label generation ─────────────────────────────────────────────────────────

function buildLabel(node: PostgresPlanNode): string {
  const rel = node["Relation Name"] ? ` on ${node["Relation Name"]}` : "";
  const idx = node["Index Name"] ? ` using ${node["Index Name"]}` : "";
  return `${node["Node Type"]}${rel}${idx}`;
}

// ─── Plan flattening ──────────────────────────────────────────────────────────

interface FlatNode {
  op: VisualOperation;
  rawDuration: number; // real ms before normalization
}

let idCounter = 0;

function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

function flattenPlan(
  node: PostgresPlanNode,
  parentDistrict: string | undefined,
  parentId: string | null,
  acc: FlatNode[]
): string {
  const id = nextId("op");
  const type = mapNodeType(node["Node Type"]);
  const district =
    node["Relation Name"] ?? parentDistrict ?? "unknown";

  const childIds: string[] = [];
  if (node.Plans) {
    for (const child of node.Plans) {
      const childId = flattenPlan(child, district, id, acc);
      childIds.push(childId);
    }
  }

  // Own duration = total time minus the time spent by the first (slowest) child.
  // This gives a fair representation of the work this node itself did.
  const firstChildTime = node.Plans?.[0]?.["Actual Total Time"] ?? 0;
  const rawDuration = Math.max(
    0,
    (node["Actual Total Time"] ?? 0) - firstChildTime
  );

  // Find a related district for join visualisation (the second input)
  const relatedDistrict: string | undefined =
    childIds.length > 1
      ? (acc.find((f) => f.op.id === childIds[1])?.op.district ?? undefined)
      : undefined;

  const op: VisualOperation = {
    id,
    parentId,
    type,
    label: buildLabel(node),
    district,
    relatedDistrict,
    startTime: 0, // assigned in second pass
    duration: 0, // assigned in second pass
    rowsExamined: Math.round(
      (node["Actual Rows"] ?? 0) * Math.max(1, node["Actual Loops"] ?? 1)
    ),
    rowsReturned: Math.round(node["Actual Rows"] ?? 0),
    loops: node["Actual Loops"] ?? 1,
    costEstimate: node["Total Cost"] ?? 0,
    actualTimeMs: node["Actual Total Time"] ?? 0,
    intensity: 0, // assigned in second pass
    children: childIds,
    metadata: {
      nodeType: node["Node Type"],
      indexName: node["Index Name"] ?? null,
      joinType: node["Join Type"] ?? null,
      sharedHitBlocks: node["Shared Hit Blocks"] ?? 0,
      sharedReadBlocks: node["Shared Read Blocks"] ?? 0,
      sharedDirtiedBlocks: node["Shared Dirtied Blocks"] ?? 0,
      sharedWrittenBlocks: node["Shared Written Blocks"] ?? 0,
      tempReadBlocks: node["Temp Read Blocks"] ?? 0,
      tempWrittenBlocks: node["Temp Written Blocks"] ?? 0,
      heapFetches: node["Heap Fetches"] ?? 0,
      workersPlanned: node["Workers Planned"] ?? 0,
      workersLaunched: node["Workers Launched"] ?? 0,
    },
  };

  acc.push({ op, rawDuration });
  return id;
}

// ─── Depth computation (iterative — safe for deeply nested plans) ─────────────

function computeDepths(
  rootId: string,
  opsById: Map<string, FlatNode>
): Map<string, number> {
  const depths = new Map<string, number>();

  // Iterative post-order traversal using an explicit stack
  const stack: { id: string; phase: "enter" | "exit" }[] = [
    { id: rootId, phase: "enter" },
  ];

  while (stack.length > 0) {
    const frame = stack.pop()!;
    const { id, phase } = frame;
    const node = opsById.get(id);
    if (!node) {
      depths.set(id, 0);
      continue;
    }

    if (phase === "enter") {
      stack.push({ id, phase: "exit" });
      for (const childId of node.op.children) {
        stack.push({ id: childId, phase: "enter" });
      }
    } else {
      // All children have been processed
      if (node.op.children.length === 0) {
        depths.set(id, 0);
      } else {
        let maxChildDepth = 0;
        for (const childId of node.op.children) {
          const d = depths.get(childId) ?? 0;
          if (d > maxChildDepth) maxChildDepth = d;
        }
        depths.set(id, 1 + maxChildDepth);
      }
    }
  }

  return depths;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function translateExplainToTimeline(
  explain: PostgresExplainRoot,
  queryText: string
): VisualTimeline {
  // Reset counter for reproducible IDs across calls
  idCounter = 0;

  const acc: FlatNode[] = [];
  const rootId = flattenPlan(explain.Plan, undefined, null, acc);

  const opsById = new Map(acc.map((f) => [f.op.id, f]));
  const depths = computeDepths(rootId, opsById);
  const maxDepth = depths.get(rootId) ?? 0;

  const totalRawTime = Math.max(1, explain["Execution Time"] ?? 1);
  const totalTimeline = Math.min(
    MAX_TOTAL_DURATION_MS,
    Math.max(MIN_OP_DURATION_MS * (maxDepth + 1), totalRawTime * 20)
  );
  const perLevelDuration = totalTimeline / (maxDepth + 1);

  const maxRaw = Math.max(...acc.map((x) => x.rawDuration), 1);

  for (const f of acc) {
    const depth = depths.get(f.op.id) ?? 0;
    // Leaves (depth=0) start first; root starts last
    f.op.startTime = (maxDepth - depth) * perLevelDuration;
    f.op.duration = Math.max(MIN_OP_DURATION_MS, perLevelDuration * 0.9);
    f.op.intensity = Math.min(1, Math.max(0.15, f.rawDuration / maxRaw));
  }

  return {
    queryText,
    totalPlanningTimeMs: explain["Planning Time"] ?? 0,
    totalExecutionTimeMs: explain["Execution Time"] ?? 0,
    totalDurationNormalizedMs: totalTimeline,
    operations: acc.map((f) => f.op),
    rootOpId: rootId,
    explainOnly: explain.explainOnly ?? false,
  };
}
