import type { IncomingMessage, ServerResponse } from "node:http";
import { loginWithGoogle, getGoogleClientId } from "../../backend/src/auth.js";
import { handleCors, readJson, sendJson } from "../_utils.js";

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (handleCors(request, response)) return;

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed. Use POST." });
    return;
  }

  try {
    const configuredId = getGoogleClientId();
    const body = (await readJson(request)) as { credential?: string; token?: string };
    const credential = body.credential || body.token;

    if (!credential) {
      sendJson(response, 400, {
        error: "Google credential token is missing.",
        note: configuredId ? undefined : "Google Client ID is not configured in environment variables.",
      });
      return;
    }

    const authResult = await loginWithGoogle(credential);
    sendJson(response, 200, authResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google authentication failed.";
    sendJson(response, 401, { error: message });
  }
}
