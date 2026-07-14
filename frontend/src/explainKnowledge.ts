import type { VisualOpType } from "./ir";

export interface ExplainEntry {
  title: string;
  whatItDoes: string;
  whyItHappened: string;
  complexity: string;
  advantages: string[];
  disadvantages: string[];
  bestUseCases: string[];
}

// Educational content shown when a user hovers a plan node or district.
// Keyed by the generic VisualOpType — no Postgres-internal names exposed.
export const EXPLAIN_KNOWLEDGE: Record<VisualOpType, ExplainEntry> = {
  scan: {
    title: "Sequential Scan",
    whatItDoes:
      "The database read every row in the table, in physical storage order.",
    whyItHappened:
      "No index existed that could narrow the search, or the planner decided a full scan was cheaper than using one (common when a large fraction of rows match).",
    complexity: "O(n) — cost grows linearly with table size.",
    advantages: [
      "Simple and predictable",
      "Good for large result sets",
      "No index maintenance overhead",
    ],
    disadvantages: [
      "Slow for selective queries",
      "Reads entire table even if few rows match",
      "High I/O for large tables",
    ],
    bestUseCases: [
      "Small tables",
      "Queries returning >10% of rows",
      "Full table exports",
      "When no suitable index exists",
    ],
  },
  beam: {
    title: "Index Scan",
    whatItDoes:
      "The database used a B-tree index to jump directly to matching rows instead of reading the whole table.",
    whyItHappened:
      "An index existed on the filtered column, and the planner estimated it would touch far fewer rows than a sequential scan.",
    complexity:
      "O(log n) to locate the entry, plus O(k) to fetch the k matches.",
    advantages: [
      "Fast for selective queries",
      "Minimal I/O for few matching rows",
      "Supports range queries",
    ],
    disadvantages: [
      "Index maintenance overhead on writes",
      "Random I/O pattern can be slow for large result sets",
      "Not useful for non-selective queries",
    ],
    bestUseCases: [
      "Point queries (WHERE id = ?)",
      "Range queries (WHERE date > ?)",
      "JOIN conditions on indexed columns",
      "ORDER BY on indexed columns",
    ],
  },
  bitmap: {
    title: "Bitmap Scan",
    whatItDoes:
      "The database first built an in-memory bitmap of candidate row locations from the index, then fetched only those rows in physical order.",
    whyItHappened:
      "Used when a moderate number of rows match — too many for a plain index scan to stay efficient, too few to justify a full sequential scan.",
    complexity:
      "O(k log k) for k candidates; avoids random I/O by sorting fetches.",
    advantages: [
      "Combines index precision with sequential I/O",
      "Good for multi-column conditions",
      "Efficient for moderate selectivity",
    ],
    disadvantages: [
      "Memory overhead for bitmap",
      "Two-pass process (index then heap)",
      "Slower than plain index scan for very selective queries",
    ],
    bestUseCases: [
      "Multi-column WHERE conditions",
      "OR conditions on indexed columns",
      "Queries with moderate selectivity (1–10% of rows)",
    ],
  },
  traffic: {
    title: "Nested Loop Join",
    whatItDoes:
      "For every row on the outer side, the database scanned the inner side looking for matches.",
    whyItHappened:
      "Usually chosen when one side is small, or when an index on the inner side makes each lookup cheap. Without that index, this is the classic O(n×m) trap.",
    complexity:
      "O(n × m) in the worst case — this is the operator most likely to explain a slow query.",
    advantages: [
      "No memory overhead",
      "Excellent for small outer sets",
      "Can use indexes on inner side",
      "Returns first rows quickly (good for LIMIT)",
    ],
    disadvantages: [
      "Catastrophic performance on large datasets without an index",
      "Quadratic complexity without an index on the inner side",
      "Sensitive to data distribution",
    ],
    bestUseCases: [
      "Small lookup tables",
      "When inner side has an index",
      "One-to-many relationships with a small 'one' side",
      "Queries with early row filtering via LIMIT",
    ],
  },
  fold: {
    title: "Hash Join",
    whatItDoes:
      "The database built an in-memory hash table from one side, then streamed the other side through it looking for matches.",
    whyItHappened:
      "Chosen when both sides are too large for nested loops but no useful sort order exists for a merge join.",
    complexity: "O(n + m) — usually the fastest join for large, unsorted inputs.",
    advantages: [
      "Linear time complexity",
      "Best for large, unsorted datasets",
      "Single-pass through the probe side",
    ],
    disadvantages: [
      "High memory usage for the hash table",
      "Requires hashable join keys",
      "Memory spills to disk if hash table is too large",
    ],
    bestUseCases: [
      "Large table joins on non-sorted data",
      "Equi-joins when neither side is indexed",
      "Data warehouse / analytical queries",
    ],
  },
  zipper: {
    title: "Merge Join",
    whatItDoes:
      "Both inputs were already sorted on the join key, so the database walked them in lockstep like zipping a jacket.",
    whyItHappened:
      "Chosen when both sides are pre-sorted (e.g. via an index) or sorting is cheap relative to the join size.",
    complexity:
      "O(n + m) given pre-sorted input, plus O(n log n) sort cost if not already ordered.",
    advantages: [
      "No memory overhead (streaming)",
      "Excellent for pre-sorted data",
      "Can output results in sorted order",
      "Good for streaming large datasets",
    ],
    disadvantages: [
      "Requires sorted inputs",
      "Sort cost if data not pre-sorted",
      "Only works for equi-joins",
    ],
    bestUseCases: [
      "Pre-sorted data (e.g., time series)",
      "JOIN on indexed columns (sorted by index)",
      "When result needs to be sorted",
      "Large dataset streaming",
    ],
  },
  sort: {
    title: "Sort",
    whatItDoes:
      "The database reordered the rows to satisfy an ORDER BY, a merge join, or a grouping operation.",
    whyItHappened:
      "No index provided the rows in the required order already.",
    complexity: "O(n log n).",
    advantages: [
      "Produces deterministic sorted output",
      "Required for merge join and GROUP BY",
    ],
    disadvantages: [
      "Expensive for large datasets",
      "Memory / disk overhead (spill to temp storage)",
      "Blocks pipeline — must read all rows before returning any",
    ],
    bestUseCases: [
      "ORDER BY clauses without a matching index",
      "Merge join preparation",
      "DISTINCT and GROUP BY operations",
    ],
  },
  aggregate: {
    title: "Aggregate / Gather",
    whatItDoes:
      "Rows were grouped and collapsed into summary values (COUNT, SUM, AVG, etc.), or parallel worker results were merged.",
    whyItHappened:
      "Triggered by GROUP BY, aggregate functions, DISTINCT, or the completion of a parallel query.",
    complexity:
      "O(n) with hashing, or O(n log n) with sort-based grouping.",
    advantages: [
      "Reduces result set size dramatically",
      "Enables analytical queries",
      "Hash-based aggregate is very fast in memory",
    ],
    disadvantages: [
      "Memory overhead for hash table",
      "Requires reading all input rows",
      "Hash aggregate can spill to disk",
    ],
    bestUseCases: [
      "GROUP BY queries",
      "Summary statistics (COUNT, SUM, AVG)",
      "Reporting and analytics",
      "Parallel query result collection",
    ],
  },
  limit: {
    title: "Limit",
    whatItDoes:
      "Execution stopped early once the requested number of rows was produced.",
    whyItHappened: "A LIMIT clause was present in the query.",
    complexity:
      "O(k) for k requested rows, once upstream rows start arriving.",
    advantages: [
      "Reduces network traffic",
      "Can stop upstream execution early",
      "Improves perceived performance for pagination",
    ],
    disadvantages: [
      "Still requires upstream work to produce k rows",
      "Non-deterministic without ORDER BY",
      "May hide the true total result count",
    ],
    bestUseCases: [
      "Pagination (LIMIT + OFFSET)",
      "Top-N queries",
      "Preview / sample results",
    ],
  },
  highlight: {
    title: "Highlighted Operator",
    whatItDoes:
      "This operator has been selected or hovered to highlight its corresponding district in the city visualization.",
    whyItHappened: "You selected or hovered this node in the plan tree.",
    complexity: "N/A — visualization state only.",
    advantages: ["Visual correlation between plan node and city district"],
    disadvantages: [],
    bestUseCases: ["Interactive plan exploration", "Debugging slow operators"],
  },
  result: {
    title: "Result / Output Node",
    whatItDoes:
      "The final row set was assembled, formatted, and returned to the client. This may also represent a ModifyTable operation (INSERT/UPDATE/DELETE) in development mode.",
    whyItHappened:
      "Every query plan terminates at this node. The result node is the root of the execution tree.",
    complexity: "O(1) beyond upstream cost.",
    advantages: [
      "Final output stage",
      "Result serialization and formatting",
      "Network transmission to client",
    ],
    disadvantages: [
      "Network latency to client",
      "Result serialization overhead for large result sets",
    ],
    bestUseCases: [
      "All queries — every plan has exactly one result node at the root",
    ],
  },
};
