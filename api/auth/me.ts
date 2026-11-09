import type { IncomingMessage, ServerResponse } from "node:http";
import { verifyAuthToken, getUserProfile } from "../../backend/src/auth.js";
import { handleCors, sendJson } from "../_utils.js";

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (handleCors(request, response)) return;

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed. Use GET." });
    return;
  }

  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    sendJson(response, 401, { error: "No authentication token provided." });
    return;
  }

  const token = authHeader.slice(7).trim();
  const decoded = verifyAuthToken(token);
  if (!decoded) {
    sendJson(response, 401, { error: "Invalid or expired token. Please log in again." });
    return;
  }

  try {
    const user = await getUserProfile(decoded.userId);
    if (!user) {
      sendJson(response, 404, { error: "User not found." });
      return;
    }
    sendJson(response, 200, { user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to retrieve profile.";
    sendJson(response, 500, { error: message });
  }
}
