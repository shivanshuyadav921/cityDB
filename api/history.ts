import type { IncomingMessage, ServerResponse } from "node:http";
import { handleCors, sendJson } from "./_utils.js";

export default function handler(request: IncomingMessage, response: ServerResponse) {
  if (handleCors(request, response)) return;

  sendJson(response, 200, {
    message: "Query history is stored client-side in localStorage for user privacy.",
  });
}
