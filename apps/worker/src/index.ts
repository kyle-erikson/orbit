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

import { Effect, Match } from "effect";
import type { Env } from "./env";
import { runPipeline } from "./pipeline";
import { handleGenerateApiKey } from "./api-key";
import { jsonResponse, corsPreflightResponse } from "./lib/http";

// ─────────────────────────────────────────────────────────────────────────────
// Worker entry-point
// ─────────────────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { method } = request;
    const { pathname } = new URL(request.url);

    return Match.value({ method, pathname }).pipe(
      Match.when({ method: "OPTIONS" }, () =>
        Promise.resolve(corsPreflightResponse())
      ),
      Match.when({ method: "GET", pathname: "/health" }, () =>
        Promise.resolve(
          jsonResponse({ status: "ok", timestamp: new Date().toISOString() })
        )
      ),
      Match.when({ method: "POST", pathname: "/webhook/reel" }, () =>
        handleReelWebhook(request, env)
      ),
      Match.when({ method: "POST", pathname: "/api/keys" }, () =>
        handleGenerateApiKey(request, env)
      ),
      Match.orElse(() =>
        Promise.resolve(jsonResponse({ error: "Not found" }, 404))
      )
    );
  },
} satisfies ExportedHandler<Env>;

// ─────────────────────────────────────────────────────────────────────────────
// Reel webhook handler
//
// The pipeline is transformed into Effect<Response, never> by mapping the
// success value and catching every typed error variant before running.
// This means we never need to inspect Exit or Cause tags manually.
// ─────────────────────────────────────────────────────────────────────────────

function handleReelWebhook(request: Request, env: Env): Promise<Response> {
  const program = runPipeline(request, env).pipe(
    // Success path
    Effect.map((saved) => jsonResponse({ success: true, reel: saved }, 201)),

    // Silently ignore unsupported platforms
    Effect.catchTag("UnsupportedPlatformError", (err) =>
      Effect.succeed(
        jsonResponse(
          {
            success: false,
            ignored: true,
            reason: `URL is not a supported Instagram or Facebook Reel: ${err.url}`,
          },
          200
        )
      )
    ),

    // Map every remaining typed error to an HTTP response
    Effect.catchTags({
      ParseError: (err) =>
        Effect.succeed(
          jsonResponse({ success: false, error: err._tag, message: err.message }, 400)
        ),
      AuthError: (err) =>
        Effect.succeed(
          jsonResponse({ success: false, error: err._tag, message: err.message }, 401)
        ),
      ApifyError: (err) =>
        Effect.succeed(
          jsonResponse({ success: false, error: err._tag, message: err.message }, 500)
        ),
      GeminiError: (err) =>
        Effect.succeed(
          jsonResponse({ success: false, error: err._tag, message: err.message }, 500)
        ),
      DatabaseError: (err) =>
        Effect.succeed(
          jsonResponse({ success: false, error: err._tag, message: err.message }, 500)
        ),
    }),

    // Any unhandled defect (programming error / unexpected throw) is logged and
    // converted to a 500 rather than crashing the worker.
    Effect.catchAllCause((cause) => {
      console.error("Unhandled pipeline defect:", cause);
      return Effect.succeed(
        jsonResponse({ success: false, error: "InternalServerError" }, 500)
      );
    })
  );

  return Effect.runPromise(program);
}
