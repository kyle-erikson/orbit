/**
 * index.ts – Cloudflare Worker entry point
 *
 * Routes:
 *   POST /webhook/reel   → the Effect-ts pipeline (iOS Shortcut → AI → Supabase)
 *   POST /api/keys       → Settings page: generate an iOS Shortcut API key
 *   GET  /health         → health check
 */

import { Effect } from "effect";
import type { Env } from "./env.js";
import { runPipeline } from "./pipeline.js";
import { handleGenerateApiKey } from "./api-key.js";

// CORS headers for responses (update origin to your deployed app URL in prod)
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname, method } = Object.assign(new URL(request.url), {
      method: request.method,
    });

    // Handle preflight CORS
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // ── Health Check ──────────────────────────────────────────────────────────
    if (request.method === "GET" && pathname === "/health") {
      return jsonResponse({ status: "ok", timestamp: new Date().toISOString() });
    }

    // ── Webhook: Reel submission from iOS Shortcut ────────────────────────────
    if (request.method === "POST" && pathname === "/webhook/reel") {
      const program = runPipeline(request, env);

      const result = await Effect.runPromiseExit(program);

      if (result._tag === "Success") {
        return jsonResponse({ success: true, reel: result.value }, 201);
      }

      // Map Effect failures to HTTP errors
      const cause = result.cause;
      if (cause._tag === "Fail") {
        const err = cause.error;
        const status =
          err._tag === "ParseError"
            ? 400
            : err._tag === "AuthError"
              ? 401
              : 500;
        return jsonResponse(
          { success: false, error: err._tag, message: err.message },
          status
        );
      }

      console.error("Unexpected pipeline failure:", cause);
      return jsonResponse({ success: false, error: "InternalServerError" }, 500);
    }

    // ── API Key Management ────────────────────────────────────────────────────
    if (request.method === "POST" && pathname === "/api/keys") {
      return handleGenerateApiKey(request, env);
    }

    // ── 404 ───────────────────────────────────────────────────────────────────
    return jsonResponse({ error: "Not found" }, 404);
  },
} satisfies ExportedHandler<Env>;
