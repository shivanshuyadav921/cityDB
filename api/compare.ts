import type { IncomingMessage, ServerResponse } from "node:http";
import { runExplain } from "../backend/src/postgres.js";
import { translateExplainToTimeline } from "../backend/src/translator.js";
import { assertVisualizableQuery } from "../backend/src/validation.js";
import { handleCors, readJson, sendJson } from "./_utils.js";

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (handleCors(request, response)) return;

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed. Use POST." });
    return;
  }

  try {
    const body = (await readJson(request)) as { sql1?: unknown; sql2?: unknown };
    assertVisualizableQuery(body.sql1);
    assertVisualizableQuery(body.sql2);
    const [explain1, explain2] = await Promise.all([
      runExplain(body.sql1),
      runExplain(body.sql2),
    ]);
    const timeline1 = translateExplainToTimeline(explain1, body.sql1);
    const timeline2 = translateExplainToTimeline(explain2, body.sql2);
    sendJson(response, 200, { baseline: timeline1, current: timeline2 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to compare queries.";
    sendJson(response, 400, { error: message });
  }
}
