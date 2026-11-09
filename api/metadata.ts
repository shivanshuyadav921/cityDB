import type { IncomingMessage, ServerResponse } from "node:http";
import { getPool } from "../backend/src/postgres.js";
import { handleCors, sendJson } from "./_utils.js";

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (handleCors(request, response)) return;

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed. Use GET." });
    return;
  }

  try {
    let pgVersion = "unknown";
    try {
      const pool = getPool();
      const versionRes = await pool.query<{ version: string }>("SELECT version()");
      pgVersion = versionRes.rows[0]?.version ?? "unknown";
    } catch {
      // postgres may be unreachable
    }

    const dbUrl = process.env.DATABASE_URL ?? "";
    let dbHost = "unknown";
    try {
      const u = new URL(dbUrl);
      dbHost = u.hostname;
    } catch {
      // ignore
    }

    sendJson(response, 200, {
      nodeVersion: process.version,
      nodeEnv: process.env.NODE_ENV || "production",
      postgresVersion: pgVersion,
      databaseHost: dbHost,
      uptime: Math.floor(process.uptime()),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch metadata.";
    sendJson(response, 500, { error: message });
  }
}
