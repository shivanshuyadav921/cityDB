// Shared Visualization IR (Intermediate Representation)
// The renderer NEVER sees Postgres plan node names directly — only these types.
// This file is the single contract between backend translator and frontend renderer.

export type VisualOpType =
  | "scan"        // crawl through a district (Seq Scan, Append, Materialize)
  | "beam"        // direct shot down a road (Index Scan / Index Only Scan)
  | "bitmap"      // heatmap-then-sweep (Bitmap Heap/Index Scan)
  | "traffic"     // door-to-door walking (Nested Loop Join)
  | "fold"        // hash table build + probe (Hash Join)
  | "zipper"      // merge join / recursive union
  | "sort"        // reorder buildings
  | "aggregate"   // cluster into summary tower (Aggregate, Gather, Unique)
  | "limit"       // beam cutoff
  | "highlight"   // district callout (used for hover emphasis)
  | "result";     // final output pulse / ModifyTable / Result node

export interface VisualOperation {
  id: string;
  parentId: string | null;
  type: VisualOpType;
  label: string;            // human readable, e.g. "Seq Scan on users"
  district: string;         // table name this op is centered on
  relatedDistrict?: string; // second table for joins
  startTime: number;        // ms, normalized timeline position
  duration: number;         // ms, normalized
  rowsExamined: number;
  rowsReturned: number;
  loops: number;
  costEstimate: number;
  actualTimeMs: number;     // real postgres timing (un-normalized)
  intensity: number;        // 0–1, drives visual brightness/speed
  children: string[];       // ids of child ops (execution order / nesting)
  metadata: Record<string, unknown>;
}

export interface VisualTimeline {
  queryText: string;
  totalPlanningTimeMs: number;
  totalExecutionTimeMs: number;
  totalDurationNormalizedMs: number; // normalized total for playback
  operations: VisualOperation[];
  rootOpId: string;
  /** True when the timeline came from EXPLAIN without ANALYZE (cost estimates only). */
  explainOnly?: boolean;
}

export type CityScale = "village" | "town" | "megacity";

export interface District {
  tableName: string;
  estimatedRowCount: number;
  columns: string[];
  indexes: RoadSpec[];
  foreignKeys: ForeignKeySpec[];
  scale: CityScale;
  gridSize: number; // sampled buildings-per-side for procedural rendering
}

export interface RoadSpec {
  indexName: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
}

export interface ForeignKeySpec {
  constraintName: string;
  columns: string[];
  foreignTable: string;
  foreignColumns: string[];
}

export interface CitySnapshot {
  districts: District[];
}

// ─── WebSocket message envelopes ──────────────────────────────────────────────

export type ServerMessage =
  | { type: "city_snapshot"; payload: CitySnapshot }
  | { type: "query_timeline"; payload: VisualTimeline }
  | { type: "error"; payload: { message: string } };

export type ClientMessage =
  | { type: "run_query"; payload: { sql: string } }
  | { type: "explain_query"; payload: { sql: string } }
  | { type: "get_city" }
  | { type: "cancel_query" };
