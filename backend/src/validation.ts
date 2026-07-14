/**
 * SQL input validation for the CityDB visualizer endpoint.
 *
 * EXPLAIN ANALYZE executes its argument, so the validator must enforce a
 * strictly read-only contract before the query reaches PostgreSQL.
 *
 * In DEVELOPMENT_MODE=true, non-SELECT DDL/DML is allowed so developers
 * can CREATE TABLE, INSERT data, etc. and see the city update in real time.
 * This mode MUST NOT be enabled in production.
 */

const DEVELOPMENT_MODE =
  process.env.DEVELOPMENT_MODE === "true" &&
  process.env.NODE_ENV !== "production";

/**
 * Destructive keywords that are blocked in production.
 * Each entry is a word-boundary regex pattern.
 */
const BLOCKED_KEYWORDS = [
  "DROP",
  "DELETE",
  "UPDATE",
  "ALTER",
  "TRUNCATE",
  "CREATE",
  "INSERT",
  "REPLACE",
  "GRANT",
  "REVOKE",
];

const blockedKeywordPattern = new RegExp(
  `\\b(${BLOCKED_KEYWORDS.join("|")})\\b`,
  "i"
);

export function assertVisualizableQuery(
  value: unknown
): asserts value is string {
  if (typeof value !== "string") {
    throw new Error("SQL must be a string.");
  }

  const sql = value.trim();

  if (!sql) {
    throw new Error("Enter a SQL query to visualize.");
  }

  if (sql.length > 50_000) {
    throw new Error(
      "Query is too large to visualize (maximum 50,000 characters)."
    );
  }

  // Block SQL comments — they can be used to escape the EXPLAIN wrapper context
  if (/--|\/\*/.test(sql)) {
    throw new Error("SQL comments are not supported by the visualizer.");
  }

  // Strip optional trailing semicolon for multi-statement detection
  const statement = sql.endsWith(";") ? sql.slice(0, -1).trim() : sql;

  // Block multiple statements — would allow a second statement to escape EXPLAIN
  if (statement.includes(";")) {
    throw new Error("Only one SQL statement can be visualized at a time.");
  }

  if (DEVELOPMENT_MODE) {
    // In dev mode, allow any single statement (DDL/DML included)
    return;
  }

  // Production: require SELECT
  if (!/^select\b/i.test(statement)) {
    throw new Error(
      "Only SELECT queries are allowed. " +
        "Set DEVELOPMENT_MODE=true to enable DDL/DML visualization."
    );
  }

  // Extra guard: reject known destructive keywords even inside a SELECT
  // (e.g., SELECT pg_drop_table(...) would be blocked)
  if (blockedKeywordPattern.test(statement)) {
    throw new Error(
      "Query contains a restricted keyword. Only read-only queries are allowed."
    );
  }
}
