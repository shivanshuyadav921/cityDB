import type { IncomingMessage, ServerResponse } from "node:http";
import { loginWithEmail } from "../../backend/src/auth.js";
import { handleCors, readJson, sendJson } from "../_utils.js";

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (handleCors(request, response)) return;

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed. Use POST." });
    return;
  }

  try {
    const body = (await readJson(request)) as { email?: string; password?: string };
    const { email, password } = body;
    if (!email || !password) {
      sendJson(response, 400, { error: "Email and password are required." });
      return;
    }

    const authResult = await loginWithEmail(email, password);
    sendJson(response, 200, authResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed.";
    sendJson(response, 401, { error: message });
  }
}
