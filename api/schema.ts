import type { IncomingMessage, ServerResponse } from "node:http";
import { getSchemaInfo } from "../backend/src/postgres.js";
import { handleCors, sendJson } from "./_utils.js";

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (handleCors(request, response)) return;

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed. Use GET." });
    return;
  }

  try {
    const schema = await getSchemaInfo();
    sendJson(response, 200, schema);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch schema.";
    sendJson(response, 500, { error: message });
  }
}
