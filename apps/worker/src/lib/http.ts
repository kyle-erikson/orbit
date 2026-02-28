/**
 * lib/http.ts
 *
 * HTTP response factory helpers shared across the worker entry-point and
 * the API-key handler.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

/** Serialise `body` as JSON and attach CORS + content-type headers. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

/** Respond to a CORS pre-flight OPTIONS request. */
export function corsPreflightResponse(): Response {
  return new Response(null, { headers: CORS_HEADERS });
}
