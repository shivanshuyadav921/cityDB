import type { IncomingMessage, ServerResponse } from "node:http";
import { getCityMetadata } from "../backend/src/postgres.js";

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.statusCode = 405;
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const snapshot = await getCityMetadata();
    sendJson(response, 200, snapshot);
  } catch (error) {
    console.error("Unable to load city metadata", error);
    sendJson(response, 500, { error: "Unable to load city metadata." });
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}
