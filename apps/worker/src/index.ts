/**
 * index.ts – Cloudflare Worker entry point
 *
 * Routes:
 *   POST /webhook/reel   → Effect-ts pipeline (iOS Shortcut → AI → Supabase)
 *   POST /api/keys       → Settings page: generate an iOS Shortcut API key
 *   GET  /health         → health check
 *
 * Unsupported reel platforms (anything other than Instagram/Facebook Reels)
 * are silently ignored and receive a 200 with { ignored: true }.
 */

import { Effect } from "effect";
import type { Env } from "./env.js";
import { runPipeline } from "./pipeline.js";
import { handleGenerateApiKey } from "./api-key.js";
import { jsonResponse, corsPreflightResponse } from "./lib/http.js";

// ─────────────────────────────────────────────────────────────────────────────
// Worker entry-point
// ─────────────────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // ── CORS pre-flight ────────────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      return corsPreflightResponse();
    }

    // ── Health check ───────────────────────────────────────────────────────
    if (request.method === "GET" && pathname === "/health") {
      return jsonResponse({ status: "ok", timestamp: new Date().toISOString() });
    }

    // ── Webhook: Reel submission from iOS Shortcut ─────────────────────────
    if (request.method === "POST" && pathname === "/webhook/reel") {
      return handleReelWebhook(request, env);
    }

    // ── API Key Management ─────────────────────────────────────────────────
    if (request.method === "POST" && pathname === "/api/keys") {
      return handleGenerateApiKey(request, env);
    }

    return jsonResponse({ error: "Not found" }, 404);
  },
} satisfies ExportedHandler<Env>;

// ─────────────────────────────────────────────────────────────────────────────
// Reel webhook handler
// ─────────────────────────────────────────────────────────────────────────────

async function handleReelWebhook(request: Request, env: Env): Promise<Response> {
  const exit = await Effect.runPromiseExit(runPipeline(request, env));

  if (exit._tag === "Success") {
    return jsonResponse({ success: true, reel: exit.value }, 201);
  }

  const { cause } = exit;

  if (cause._tag === "Fail") {
    const err = cause.error;

    // Unsupported platform — silently ignore as instructed
    if (err._tag === "UnsupportedPlatformError") {
      return jsonResponse(
        {
          success: false,
          ignored: true,
          reason: `URL is not a supported Instagram or Facebook Reel: ${err.url}`,
        },
        200
      );
    }

    // Map typed pipeline errors to HTTP status codes
    const status: number =
      err._tag === "ParseError" ? 400
      : err._tag === "AuthError"  ? 401
      : 500;

    return jsonResponse(
      { success: false, error: err._tag, message: (err as { message?: string }).message ?? "An error occurred" },
      status
    );
  }

  // Defects / unexpected failures
  console.error("Unhandled pipeline defect:", cause);
  return jsonResponse({ success: false, error: "InternalServerError" }, 500);
}
