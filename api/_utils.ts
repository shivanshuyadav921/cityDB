import type { IncomingMessage, ServerResponse } from "node:http";

export interface JsonRequest extends IncomingMessage {
  body?: any;
  query?: Record<string, string | string[]>;
}

export function setCorsHeaders(response: ServerResponse) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export function handleCors(request: IncomingMessage, response: ServerResponse): boolean {
  setCorsHeaders(response);
  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return true;
  }
  return false;
}

export async function readJson(request: JsonRequest): Promise<Record<string, unknown>> {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }
  if (typeof request.body === "string" && request.body.trim()) {
    try {
      return JSON.parse(request.body);
    } catch {
      // continue to stream
    }
  }
  return new Promise((resolve, reject) => {
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      raw += chunk;
      if (raw.length > 65_536) {
        reject(new Error("Request body is too large (max 64KB)."));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

export function sendJson(response: ServerResponse, status: number, body: unknown) {
  setCorsHeaders(response);
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}
