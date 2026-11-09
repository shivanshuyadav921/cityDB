import type { IncomingMessage, ServerResponse } from "node:http";
import { getCityMetadata } from "../backend/src/postgres.js";
import { handleCors, sendJson } from "./_utils.js";

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (handleCors(request, response)) return;

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    sendJson(response, 405, { error: "Method not allowed. Use GET." });
    return;
  }

  try {
    const snapshot = await getCityMetadata();
    sendJson(response, 200, snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load city metadata.";
    sendJson(response, 500, { error: message });
  }
}
