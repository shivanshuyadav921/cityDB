import type { IncomingMessage, ServerResponse } from "node:http";
import { handleCors, sendJson } from "./_utils.js";

export default function handler(request: IncomingMessage, response: ServerResponse) {
  if (handleCors(request, response)) return;

  sendJson(response, 200, {
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "production",
  });
}
