import type { IncomingMessage, ServerResponse } from "node:http";

export default function handler(_request: IncomingMessage, response: ServerResponse) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.statusCode = 200;
  response.end(JSON.stringify({ ok: true }));
}
