import type { IncomingMessage, ServerResponse } from "node:http";
import { registerWithEmail } from "../../backend/src/auth.js";
import { handleCors, readJson, sendJson } from "../_utils.js";

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (handleCors(request, response)) return;

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed. Use POST." });
    return;
  }

  try {
    const body = (await readJson(request)) as { email?: string; password?: string; name?: string };
    const { email, password, name } = body;
    if (!email || !password || !name) {
      sendJson(response, 400, { error: "Name, email, and password are required." });
      return;
    }

    const authResult = await registerWithEmail(email, password, name);
    sendJson(response, 201, authResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed.";
    sendJson(response, 400, { error: message });
  }
}
