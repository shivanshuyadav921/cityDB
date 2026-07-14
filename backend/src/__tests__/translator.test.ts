import { describe, it, expect } from "vitest";
import { translateExplainToTimeline } from "../translator.js";
import type { PostgresExplainRoot } from "../postgres.js";

// ─── Fixture plans ─────────────────────────────────────────────────────────

const seqScanPlan: PostgresExplainRoot = {
  Plan: {
    "Node Type": "Seq Scan",
    "Relation Name": "users",
    "Startup Cost": 0.0,
    "Total Cost": 1833.0,
    "Plan Rows": 100000,
    "Actual Startup Time": 0.01,
    "Actual Total Time": 45.2,
    "Actual Rows": 1,
    "Actual Loops": 1,
    "Shared Hit Blocks": 833,
    "Shared Read Blocks": 0,
  },
  "Planning Time": 0.18,
  "Execution Time": 45.2,
};

const indexScanPlan: PostgresExplainRoot = {
  Plan: {
    "Node Type": "Index Scan",
    "Relation Name": "users",
    "Index Name": "idx_users_email",
    "Startup Cost": 0.42,
    "Total Cost": 8.44,
    "Plan Rows": 1,
    "Actual Startup Time": 0.04,
    "Actual Total Time": 0.05,
    "Actual Rows": 1,
    "Actual Loops": 1,
    "Shared Hit Blocks": 3,
    "Shared Read Blocks": 0,
  },
  "Planning Time": 0.22,
  "Execution Time": 0.05,
};

const hashJoinPlan: PostgresExplainRoot = {
  Plan: {
    "Node Type": "Hash Join",
    "Join Type": "Inner",
    "Startup Cost": 3.5,
    "Total Cost": 100.0,
    "Plan Rows": 500,
    "Actual Startup Time": 1.2,
    "Actual Total Time": 8.5,
    "Actual Rows": 500,
    "Actual Loops": 1,
    Plans: [
      {
        "Node Type": "Seq Scan",
        "Relation Name": "orders",
        "Startup Cost": 0.0,
        "Total Cost": 50.0,
        "Plan Rows": 500,
        "Actual Startup Time": 0.01,
        "Actual Total Time": 4.0,
        "Actual Rows": 500,
        "Actual Loops": 1,
      },
      {
        "Node Type": "Hash",
        "Startup Cost": 2.0,
        "Total Cost": 2.0,
        "Plan Rows": 100,
        "Actual Startup Time": 0.1,
        "Actual Total Time": 0.5,
        "Actual Rows": 100,
        "Actual Loops": 1,
        Plans: [
          {
            "Node Type": "Seq Scan",
            "Relation Name": "users",
            "Startup Cost": 0.0,
            "Total Cost": 2.0,
            "Plan Rows": 100,
            "Actual Startup Time": 0.01,
            "Actual Total Time": 0.3,
            "Actual Rows": 100,
            "Actual Loops": 1,
          },
        ],
      },
    ],
  },
  "Planning Time": 0.35,
  "Execution Time": 8.5,
};

const deepPlan: PostgresExplainRoot = {
  Plan: {
    "Node Type": "Aggregate",
    "Startup Cost": 0,
    "Total Cost": 1000,
    "Plan Rows": 1,
    "Actual Startup Time": 50,
    "Actual Total Time": 100,
    "Actual Rows": 1,
    "Actual Loops": 1,
    Plans: [
      {
        "Node Type": "Sort",
        "Startup Cost": 0,
        "Total Cost": 900,
        "Plan Rows": 1000,
        "Actual Startup Time": 40,
        "Actual Total Time": 50,
        "Actual Rows": 1000,
        "Actual Loops": 1,
        Plans: [
          {
            "Node Type": "Nested Loop",
            "Startup Cost": 0,
            "Total Cost": 800,
            "Plan Rows": 1000,
            "Actual Startup Time": 0.1,
            "Actual Total Time": 40,
            "Actual Rows": 1000,
            "Actual Loops": 1,
            Plans: [
              {
                "Node Type": "Seq Scan",
                "Relation Name": "orders",
                "Startup Cost": 0,
                "Total Cost": 400,
                "Plan Rows": 500,
                "Actual Startup Time": 0.01,
                "Actual Total Time": 15,
                "Actual Rows": 500,
                "Actual Loops": 1,
              },
              {
                "Node Type": "Index Scan",
                "Relation Name": "users",
                "Index Name": "users_pkey",
                "Startup Cost": 0,
                "Total Cost": 4,
                "Plan Rows": 1,
                "Actual Startup Time": 0.01,
                "Actual Total Time": 0.02,
                "Actual Rows": 1,
                "Actual Loops": 500,
              },
            ],
          },
        ],
      },
    ],
  },
  "Planning Time": 1.5,
  "Execution Time": 100,
};

// ─── IR contract assertions ─────────────────────────────────────────────────

function assertIRContract(timeline: ReturnType<typeof translateExplainToTimeline>) {
  // 1. No operation may have a nodeType that equals a Postgres plan node name
  //    in its top-level fields (only in metadata.nodeType, which is intentional)
  for (const op of timeline.operations) {
    expect(op.type).not.toMatch(/Seq Scan|Index Scan|Hash Join|Nested Loop/);
    expect(op.label).toBeDefined();
    expect(op.id).toMatch(/^op_\d+$/);
    expect(op.startTime).toBeGreaterThanOrEqual(0);
    expect(op.duration).toBeGreaterThan(0);
    expect(op.intensity).toBeGreaterThanOrEqual(0);
    expect(op.intensity).toBeLessThanOrEqual(1);
    expect(op.rowsExamined).toBeGreaterThanOrEqual(0);
    expect(op.rowsReturned).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(op.children)).toBe(true);
    // metadata.nodeType is allowed to contain PG names — that is its purpose
    expect(op.metadata.nodeType).toBeDefined();
  }

  // 2. rootOpId must exist
  const rootOp = timeline.operations.find((o) => o.id === timeline.rootOpId);
  expect(rootOp).toBeDefined();

  // 3. All child IDs must reference existing ops
  const ids = new Set(timeline.operations.map((o) => o.id));
  for (const op of timeline.operations) {
    for (const childId of op.children) {
      expect(ids.has(childId)).toBe(true);
    }
  }

  // 4. Timing
  expect(timeline.totalPlanningTimeMs).toBeGreaterThanOrEqual(0);
  expect(timeline.totalExecutionTimeMs).toBeGreaterThanOrEqual(0);
  expect(timeline.totalDurationNormalizedMs).toBeGreaterThan(0);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("translateExplainToTimeline", () => {
  it("handles Seq Scan correctly", () => {
    const tl = translateExplainToTimeline(seqScanPlan, "SELECT * FROM users");
    assertIRContract(tl);
    expect(tl.operations).toHaveLength(1);
    expect(tl.operations[0].type).toBe("scan");
    expect(tl.operations[0].district).toBe("users");
    expect(tl.operations[0].label).toContain("users");
  });

  it("handles Index Scan correctly", () => {
    const tl = translateExplainToTimeline(
      indexScanPlan,
      "SELECT * FROM users WHERE email = 'x'"
    );
    assertIRContract(tl);
    expect(tl.operations[0].type).toBe("beam");
    expect(tl.operations[0].label).toContain("idx_users_email");
    expect(tl.totalExecutionTimeMs).toBe(0.05);
    expect(tl.totalPlanningTimeMs).toBe(0.22);
  });

  it("handles Hash Join with children", () => {
    const tl = translateExplainToTimeline(hashJoinPlan, "SELECT * FROM orders JOIN users");
    assertIRContract(tl);
    // Hash Join → fold; Seq Scan → scan; Hash → fold
    const types = tl.operations.map((o) => o.type);
    expect(types).toContain("fold");
    expect(types).toContain("scan");
    // Root is the Hash Join
    const root = tl.operations.find((o) => o.id === tl.rootOpId)!;
    expect(root.type).toBe("fold");
    expect(root.children).toHaveLength(2);
  });

  it("correctly times operations (deeper nodes have higher startTime)", () => {
    // In CityDB's timeline, startTime = (maxDepth - nodeDepth) * perLevel.
    // So the ROOT (nodeDepth = maxDepth) gets startTime = 0 (appears first in animation).
    // LEAVES (nodeDepth = 0) get the highest startTime (animate last as "results arrive").
    // This matches how PostgreSQL actually works: parent operators drive child operators,
    // but child scans complete before the parent join/aggregate emits output.
    const tl = translateExplainToTimeline(hashJoinPlan, "SELECT 1");
    const byId = new Map(tl.operations.map((o) => [o.id, o]));

    for (const op of tl.operations) {
      for (const childId of op.children) {
        const child = byId.get(childId)!;
        // Children have LARGER startTime than their parents in CityDB's model
        expect(child.startTime).toBeGreaterThanOrEqual(op.startTime);
      }
    }
  });

  it("handles deeply nested plan without stack overflow", () => {
    // This would cause a stack overflow with the old recursive depthOf
    const tl = translateExplainToTimeline(deepPlan, "SELECT complex");
    assertIRContract(tl);
    expect(tl.operations.length).toBeGreaterThan(1);
  });

  it("produces stable IDs starting from op_1 on each call", () => {
    const tl1 = translateExplainToTimeline(seqScanPlan, "q1");
    const tl2 = translateExplainToTimeline(seqScanPlan, "q2");
    expect(tl1.operations[0].id).toBe("op_1");
    expect(tl2.operations[0].id).toBe("op_1");
  });

  it("intensity is between 0 and 1 inclusive", () => {
    const tl = translateExplainToTimeline(deepPlan, "SELECT 1");
    for (const op of tl.operations) {
      expect(op.intensity).toBeGreaterThanOrEqual(0);
      expect(op.intensity).toBeLessThanOrEqual(1);
    }
  });

  it("includes query text in timeline", () => {
    const q = "SELECT id FROM users LIMIT 10";
    const tl = translateExplainToTimeline(seqScanPlan, q);
    expect(tl.queryText).toBe(q);
  });

  it("handles explain-only plans (no Actual* fields)", () => {
    // Simulate the output of EXPLAIN (FORMAT JSON) without ANALYZE.
    // fillActualTimes() in runExplainOnly backfills these before calling the translator.
    const explainOnlyPlan: PostgresExplainRoot = {
      Plan: {
        "Node Type": "Seq Scan",
        "Relation Name": "users",
        "Startup Cost": 0.0,
        "Total Cost": 1833.0,
        "Plan Rows": 100000,
        // Actual* fields filled by fillActualTimes()
        "Actual Startup Time": 0,
        "Actual Total Time": 0,
        "Actual Rows": 100000,
        "Actual Loops": 1,
      },
      "Planning Time": 0,
      "Execution Time": 0,
      explainOnly: true,
    };
    const tl = translateExplainToTimeline(
      explainOnlyPlan,
      "SELECT * FROM users"
    );
    assertIRContract(tl);
    expect(tl.explainOnly).toBe(true);
    expect(tl.totalExecutionTimeMs).toBe(0);
    expect(tl.totalPlanningTimeMs).toBe(0);
    expect(tl.operations[0].type).toBe("scan");
    expect(tl.operations[0].costEstimate).toBeGreaterThan(0);
  });

  it("handles Bitmap Heap Scan and Bitmap Index Scan correctly", () => {
    const bitmapPlan: PostgresExplainRoot = {
      Plan: {
        "Node Type": "Bitmap Heap Scan",
        "Relation Name": "users",
        "Startup Cost": 12.0,
        "Total Cost": 450.0,
        "Plan Rows": 500,
        "Actual Startup Time": 1.0,
        "Actual Total Time": 3.5,
        "Actual Rows": 500,
        "Actual Loops": 1,
        Plans: [
          {
            "Node Type": "Bitmap Index Scan",
            "Index Name": "idx_users_created_at",
            "Startup Cost": 0.0,
            "Total Cost": 12.0,
            "Plan Rows": 500,
            "Actual Startup Time": 0.5,
            "Actual Total Time": 0.5,
            "Actual Rows": 500,
            "Actual Loops": 1,
          },
        ],
      },
      "Planning Time": 0.15,
      "Execution Time": 3.5,
    };
    const tl = translateExplainToTimeline(bitmapPlan, "SELECT * FROM users WHERE created_at > NOW() - INTERVAL '1 day'");
    assertIRContract(tl);
    expect(tl.operations).toHaveLength(2);
    expect(tl.operations.map((o) => o.type)).toEqual(["bitmap", "bitmap"]);
  });

  it("handles Merge Join correctly", () => {
    const mergeJoinPlan: PostgresExplainRoot = {
      Plan: {
        "Node Type": "Merge Join",
        "Join Type": "Inner",
        "Startup Cost": 10.0,
        "Total Cost": 200.0,
        "Plan Rows": 1000,
        "Actual Startup Time": 0.8,
        "Actual Total Time": 12.0,
        "Actual Rows": 1000,
        "Actual Loops": 1,
        Plans: [
          {
            "Node Type": "Index Scan",
            "Relation Name": "orders",
            "Index Name": "idx_orders_user_id",
            "Startup Cost": 0.0,
            "Total Cost": 90.0,
            "Plan Rows": 1000,
            "Actual Startup Time": 0.05,
            "Actual Total Time": 5.0,
            "Actual Rows": 1000,
            "Actual Loops": 1,
          },
          {
            "Node Type": "Index Scan",
            "Relation Name": "users",
            "Index Name": "users_pkey",
            "Startup Cost": 0.0,
            "Total Cost": 80.0,
            "Plan Rows": 1000,
            "Actual Startup Time": 0.05,
            "Actual Total Time": 4.5,
            "Actual Rows": 1000,
            "Actual Loops": 1,
          },
        ],
      },
      "Planning Time": 0.4,
      "Execution Time": 12.0,
    };
    const tl = translateExplainToTimeline(mergeJoinPlan, "SELECT * FROM orders JOIN users ON orders.user_id = users.id");
    assertIRContract(tl);
    const root = tl.operations.find((o) => o.id === tl.rootOpId)!;
    expect(root.type).toBe("zipper");
  });

  it("handles Parallel Gather and Gather Merge nodes correctly", () => {
    const gatherPlan: PostgresExplainRoot = {
      Plan: {
        "Node Type": "Gather",
        "Startup Cost": 1000.0,
        "Total Cost": 5000.0,
        "Plan Rows": 1000,
        "Workers Planned": 2,
        "Workers Launched": 2,
        "Actual Startup Time": 10.0,
        "Actual Total Time": 45.0,
        "Actual Rows": 1000,
        "Actual Loops": 1,
        Plans: [
          {
            "Node Type": "Parallel Seq Scan",
            "Relation Name": "transactions",
            "Startup Cost": 0.0,
            "Total Cost": 3000.0,
            "Plan Rows": 500,
            "Actual Startup Time": 0.5,
            "Actual Total Time": 20.0,
            "Actual Rows": 500,
            "Actual Loops": 3,
          },
        ],
      },
      "Planning Time": 0.8,
      "Execution Time": 45.0,
    };
    const tl = translateExplainToTimeline(gatherPlan, "SELECT * FROM transactions");
    assertIRContract(tl);
    const root = tl.operations.find((o) => o.id === tl.rootOpId)!;
    expect(root.type).toBe("aggregate");
    expect(root.metadata.workersPlanned).toBe(2);
    expect(root.metadata.workersLaunched).toBe(2);
  });

  it("handles Append, Materialize, Limit, and Unique correctly", () => {
    const complexOpsPlan: PostgresExplainRoot = {
      Plan: {
        "Node Type": "Limit",
        "Startup Cost": 0.0,
        "Total Cost": 10.0,
        "Plan Rows": 10,
        "Actual Startup Time": 0.1,
        "Actual Total Time": 1.2,
        "Actual Rows": 10,
        "Actual Loops": 1,
        Plans: [
          {
            "Node Type": "Unique",
            "Startup Cost": 0.0,
            "Total Cost": 20.0,
            "Plan Rows": 50,
            "Actual Startup Time": 0.1,
            "Actual Total Time": 1.1,
            "Actual Rows": 50,
            "Actual Loops": 1,
            Plans: [
              {
                "Node Type": "Materialize",
                "Startup Cost": 0.0,
                "Total Cost": 30.0,
                "Plan Rows": 100,
                "Actual Startup Time": 0.05,
                "Actual Total Time": 0.9,
                "Actual Rows": 100,
                "Actual Loops": 1,
                Plans: [
                  {
                    "Node Type": "Append",
                    "Startup Cost": 0.0,
                    "Total Cost": 40.0,
                    "Plan Rows": 100,
                    "Actual Startup Time": 0.01,
                    "Actual Total Time": 0.7,
                    "Actual Rows": 100,
                    "Actual Loops": 1,
                  },
                ],
              },
            ],
          },
        ],
      },
      "Planning Time": 0.5,
      "Execution Time": 1.2,
    };
    const tl = translateExplainToTimeline(complexOpsPlan, "SELECT DISTINCT name FROM users UNION SELECT name FROM admins LIMIT 10");
    assertIRContract(tl);
    const types = tl.operations.map((o) => o.type);
    expect(types).toEqual(["scan", "scan", "aggregate", "limit"]);
  });
});

