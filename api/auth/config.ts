import type { IncomingMessage, ServerResponse } from "node:http";
import { getGoogleClientId } from "../../backend/src/auth.js";
import { handleCors, sendJson } from "../_utils.js";

export default function handler(request: IncomingMessage, response: ServerResponse) {
  if (handleCors(request, response)) return;

  const clientId = getGoogleClientId();
  sendJson(response, 200, {
    googleConfigured: Boolean(clientId),
    googleClientId: clientId || null,
  });
}
