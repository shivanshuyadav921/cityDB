import pg from "pg";
import { logger } from "./logger.js";

const { Pool } = pg;

// ─── SSL detection ────────────────────────────────────────────────────────────
// Railway and most hosted PostgreSQL providers require SSL. We detect this by
// checking whether the connection string contains `sslmode=require` or by
// checking the NODE_ENV. In production we always attempt SSL; if the server
// doesn't support it the connection will fail visibly rather than silently.

function buildSslConfig(): pg.PoolConfig["ssl"] {
  const url = process.env.DATABASE_URL ?? "";
  if (url.includes("sslmode=disable")) return false;
  if (
    process.env.NODE_ENV === "production" ||
    url.includes("sslmode=require") ||
    url.includes(".railway.app") ||
    url.includes("neon.tech") ||
    url.includes("supabase")
  ) {
    // `rejectUnauthorized: false` allows Railway's self-signed certs.
    // For fully managed providers with valid certs, set PGSSLROOTCERT instead.
    return { rejectUnauthorized: false };
  }
  return false;
}

// ─── Connection pool ──────────────────────────────────────────────────────────

const STATEMENT_TIMEOUT_MS = Number(process.env.STATEMENT_TIMEOUT_MS) || 30000;
const QUERY_TIMEOUT_MS = Number(process.env.QUERY_TIMEOUT_MS) || 35000;

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://citydb:citydb@localhost:5432/citydb",
  ssl: buildSslConfig(),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  statement_timeout: STATEMENT_TIMEOUT_MS,
  query_timeout: QUERY_TIMEOUT_MS,
});

pool.on("error", (err) => {
  logger.error("pg_pool_idle_error", { message: err.message });
});

pool.on("connect", () => {
  logger.info("pg_pool_new_connection");
});

// ─── Pool accessor (for graceful shutdown in server.ts) ───────────────────────

export function getPool(): pg.Pool {
  return pool;
}

// ─── Query execution ──────────────────────────────────────────────────────────

export async function runExplain(
  sql: string,
  params?: unknown[]
): Promise<PostgresExplainRoot> {
  const explainSql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`;
  let client: pg.PoolClient;
  try {
    client = await pool.connect();
  } catch (err) {
    const msg = (err as Error).message || "";
    if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")) {
      throw new Error(
        "Cannot connect to PostgreSQL. Please set DATABASE_URL in Vercel Project Settings → Environment Variables."
      );
    }
    throw err;
  }
  try {
    // Read-only transaction ensures the visualizer cannot mutate data
    // even if database permissions are broad.
    await client.query("BEGIN READ ONLY");
    const result = await client.query<{ "QUERY PLAN": PostgresExplainRoot[] }>(
      { text: explainSql, values: params }
    );
    await client.query("COMMIT");
    // pg returns the JSON plan as the first row's "QUERY PLAN" column
    const planRoot = result.rows[0]["QUERY PLAN"][0];
    return planRoot;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error instanceof pg.DatabaseError) {
      throw new Error(
        `PostgreSQL error: ${error.message} (Code: ${error.code ?? "unknown"})`
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

// ─── Explain-only (no execution — cost estimates only) ───────────────────────

/**
 * Runs EXPLAIN without ANALYZE: returns the planner's cost estimates without
 * actually executing the query. Safe for any query (including writes) since
 * PostgreSQL does not execute the plan. Does not require a read-only transaction.
 */
export async function runExplainOnly(
  sql: string
): Promise<PostgresExplainRoot> {
  const explainSql = `EXPLAIN (FORMAT JSON) ${sql}`;
  let client: pg.PoolClient;
  try {
    client = await pool.connect();
  } catch (err) {
    const msg = (err as Error).message || "";
    if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")) {
      throw new Error(
        "Cannot connect to PostgreSQL. Please set DATABASE_URL in Vercel Project Settings → Environment Variables."
      );
    }
    throw err;
  }
  try {
    const result = await client.query<{ "QUERY PLAN": PostgresExplainRoot[] }>(
      { text: explainSql }
    );
    const planRoot = result.rows[0]["QUERY PLAN"][0];
    // Explain-only plans have no Actual* fields; fill timing with zeros so the
    // translator can handle them with the same code path.
    fillActualTimes(planRoot.Plan);
    planRoot["Planning Time"] = 0;
    planRoot["Execution Time"] = 0;
    planRoot.explainOnly = true;
    return planRoot;
  } catch (error) {
    if (error instanceof pg.DatabaseError) {
      throw new Error(
        `PostgreSQL error: ${error.message} (Code: ${error.code ?? "unknown"})`
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Recursively fill missing Actual* fields with 0 for explain-only plans. */
function fillActualTimes(node: PostgresPlanNode): void {
  node["Actual Startup Time"] ??= 0;
  node["Actual Total Time"] ??= 0;
  node["Actual Rows"] ??= node["Plan Rows"];
  node["Actual Loops"] ??= 1;
  if (node.Plans) {
    for (const child of node.Plans) {
      fillActualTimes(child);
    }
  }
}

// ─── Query cancellation ───────────────────────────────────────────────────────

export async function cancelQuery(pid: number): Promise<void> {
  let client: pg.PoolClient;
  try {
    client = await pool.connect();
  } catch (err) {
    const msg = (err as Error).message || "";
    if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")) {
      throw new Error(
        "Cannot connect to PostgreSQL. Please set DATABASE_URL in Vercel Project Settings → Environment Variables."
      );
    }
    throw err;
  }
  try {
    await client.query("SELECT pg_cancel_backend($1)", [pid]);
  } finally {
    client.release();
  }
}

// ─── City metadata ────────────────────────────────────────────────────────────

export async function getCityMetadata(): Promise<{ districts: District[] }> {
  const tablesRes = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );

  const districts: District[] = [];
  for (const row of tablesRes.rows) {
    const tableName = row.table_name;

    const countRes = await pool.query<{ estimate: string }>(
      `SELECT reltuples::bigint AS estimate FROM pg_class WHERE relname = $1`,
      [tableName]
    );
    const estimatedRowCount = Number(countRes.rows[0]?.estimate ?? 0);

    const colsRes = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [tableName]
    );

    const idxRes = await pool.query<{
      indexname: string;
      indexdef: string;
    }>(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = $1`,
      [tableName]
    );

    const fkRes = await pool.query<{
      constraint_name: string;
      column_name: string;
      foreign_table_name: string;
      foreign_column_name: string;
    }>(
      `SELECT
         tc.constraint_name,
         kcu.column_name,
         ccu.table_name  AS foreign_table_name,
         ccu.column_name AS foreign_column_name
       FROM information_schema.table_constraints     AS tc
       JOIN information_schema.key_column_usage      AS kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema    = kcu.table_schema
       JOIN information_schema.constraint_column_usage AS ccu
         ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema    = tc.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_schema    = 'public'
         AND tc.table_name      = $1`,
      [tableName]
    );

    const foreignKeysMap = new Map<string, ForeignKeySpec>();
    for (const fkRow of fkRes.rows) {
      const existing = foreignKeysMap.get(fkRow.constraint_name);
      if (existing) {
        existing.columns.push(fkRow.column_name);
        existing.foreignColumns.push(fkRow.foreign_column_name);
      } else {
        foreignKeysMap.set(fkRow.constraint_name, {
          constraintName: fkRow.constraint_name,
          columns: [fkRow.column_name],
          foreignTable: fkRow.foreign_table_name,
          foreignColumns: [fkRow.foreign_column_name],
        });
      }
    }

    districts.push({
      tableName,
      estimatedRowCount,
      columns: colsRes.rows.map((c) => c.column_name),
      indexes: idxRes.rows.map((i) => ({
        indexName: i.indexname,
        columns: extractIndexColumns(i.indexdef),
        isUnique: i.indexdef.includes("UNIQUE"),
        isPrimary: i.indexname.endsWith("_pkey"),
      })),
      foreignKeys: Array.from(foreignKeysMap.values()),
      ...classifyScale(estimatedRowCount),
    });
  }

  return { districts };
}

// ─── Schema info (no row counts) ──────────────────────────────────────────────

export async function getSchemaInfo(): Promise<{ tables: SchemaTable[] }> {
  const tablesRes = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );

  const tables: SchemaTable[] = [];
  for (const row of tablesRes.rows) {
    const tableName = row.table_name;

    const colsRes = await pool.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [tableName]
    );

    const idxRes = await pool.query<{
      indexname: string;
      indexdef: string;
    }>(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = $1`,
      [tableName]
    );

    tables.push({
      tableName,
      columns: colsRes.rows.map((c) => ({
        name: c.column_name,
        type: c.data_type,
        nullable: c.is_nullable === "YES",
        default: c.column_default ?? null,
      })),
      indexes: idxRes.rows.map((i) => ({
        indexName: i.indexname,
        columns: extractIndexColumns(i.indexdef),
        isUnique: i.indexdef.includes("UNIQUE"),
        isPrimary: i.indexname.endsWith("_pkey"),
        definition: i.indexdef,
      })),
    });
  }

  return { tables };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractIndexColumns(indexdef: string): string[] {
  const match = indexdef.match(/\(([^)]+)\)/);
  if (!match) return [];
  return match[1].split(",").map((c) => c.trim().split(" ")[0]);
}

export function classifyScale(rowCount: number): {
  scale: "village" | "town" | "megacity";
  gridSize: number;
} {
  if (rowCount < 1000) return { scale: "village", gridSize: 8 };
  if (rowCount < 100_000) return { scale: "town", gridSize: 20 };
  return { scale: "megacity", gridSize: 40 };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PostgresPlanNode {
  "Node Type": string;
  "Relation Name"?: string;
  "Index Name"?: string;
  "Join Type"?: string;
  "Startup Cost": number;
  "Total Cost": number;
  "Plan Rows": number;
  // Actual* fields are absent in EXPLAIN-only (no ANALYZE) output.
  // fillActualTimes() backfills them so the translator always receives numbers.
  "Actual Startup Time"?: number;
  "Actual Total Time"?: number;
  "Actual Rows"?: number;
  "Actual Loops"?: number;
  "Shared Hit Blocks"?: number;
  "Shared Read Blocks"?: number;
  "Shared Dirtied Blocks"?: number;
  "Shared Written Blocks"?: number;
  "Temp Read Blocks"?: number;
  "Temp Written Blocks"?: number;
  "Heap Fetches"?: number;
  "Workers Planned"?: number;
  "Workers Launched"?: number;
  Plans?: PostgresPlanNode[];
}

export interface PostgresExplainRoot {
  Plan: PostgresPlanNode;
  /** Absent in EXPLAIN-only (no ANALYZE) output. */
  "Planning Time"?: number;
  /** Absent in EXPLAIN-only (no ANALYZE) output. */
  "Execution Time"?: number;
  /** True when this plan came from EXPLAIN without ANALYZE. */
  explainOnly?: boolean;
}

export interface ForeignKeySpec {
  constraintName: string;
  columns: string[];
  foreignTable: string;
  foreignColumns: string[];
}

export interface District {
  tableName: string;
  estimatedRowCount: number;
  columns: string[];
  indexes: {
    indexName: string;
    columns: string[];
    isUnique: boolean;
    isPrimary: boolean;
  }[];
  foreignKeys: ForeignKeySpec[];
  scale: "village" | "town" | "megacity";
  gridSize: number;
}

export interface SchemaTable {
  tableName: string;
  columns: {
    name: string;
    type: string;
    nullable: boolean;
    default: string | null;
  }[];
  indexes: {
    indexName: string;
    columns: string[];
    isUnique: boolean;
    isPrimary: boolean;
    definition: string;
  }[];
}
