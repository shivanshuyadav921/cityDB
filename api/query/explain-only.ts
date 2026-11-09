import type { IncomingMessage, ServerResponse } from "node:http";
import { runExplainOnly } from "../../backend/src/postgres.js";
import { translateExplainToTimeline } from "../../backend/src/translator.js";
import { assertVisualizableQuery } from "../../backend/src/validation.js";
import { handleCors, readJson, sendJson } from "../_utils.js";

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (handleCors(request, response)) return;

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "Method not allowed. Use POST." });
    return;
  }

  try {
    const body = await readJson(request);
    assertVisualizableQuery(body.sql);
    const explain = await runExplainOnly(body.sql);
    const timeline = translateExplainToTimeline(explain, body.sql);
    sendJson(response, 200, timeline);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to explain query.";
    sendJson(response, 400, { error: message });
  }
}
