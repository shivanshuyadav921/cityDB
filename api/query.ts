import type { IncomingMessage, ServerResponse } from "node:http";
import { runExplain } from "../backend/src/postgres.js";
import { translateExplainToTimeline } from "../backend/src/translator.js";
import { assertVisualizableQuery } from "../backend/src/validation.js";

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = await readJson(request);
    assertVisualizableQuery(body.sql);
    const explain = await runExplain(body.sql);
    sendJson(response, 200, translateExplainToTimeline(explain, body.sql));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run query.";
    console.error("Unable to visualize query", error);
    sendJson(response, 400, { error: message });
  }
}

function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      raw += chunk;
      if (raw.length > 60_000) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}
