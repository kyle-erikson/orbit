/**
 * stages/02-auth.ts
 *
 * Stage 2 – Authenticate Webhook
 *
 * Hashes the provided raw bearer token with SHA-256 and looks it up in the
 * `user_api_keys` Supabase table.  On success produces an AuthenticatedRequest
 * which carries the resolved userId forward through the pipeline.
 */

import { Effect, Schema } from "effect";
import { AuthError } from "@orbit/shared-types";
import type { Env } from "../env.js";
import { sha256Hex } from "../lib/crypto.js";
import { makeSupabaseClient } from "../lib/supabase.js";
import type { ParsedRequest } from "./01-parse.js";

// ─────────────────────────────────────────────────────────────────────────────
// Context type produced by this stage
// ─────────────────────────────────────────────────────────────────────────────

export const AuthenticatedRequestSchema = Schema.Struct({
  url: Schema.String,
  rawToken: Schema.String,
  /** Supabase user UUID resolved from the API key lookup */
  userId: Schema.String,
});

export type AuthenticatedRequest = Schema.Schema.Type<
  typeof AuthenticatedRequestSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Stage implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Authenticates the request by verifying the hashed bearer token against the
 * `user_api_keys` table.  Also fire-and-forgets a `last_used_at` update so
 * callers can track key activity.
 *
 * @returns AuthenticatedRequest on success, AuthError on failure.
 */
export function authenticateWebhook(
  ctx: ParsedRequest,
  env: Env
): Effect.Effect<AuthenticatedRequest, AuthError> {
  return Effect.tryPromise({
    try: async () => {
      const keyHash = await sha256Hex(ctx.rawToken);
      const supabase = makeSupabaseClient(env);

      const { data, error } = await supabase
        .from("user_api_keys")
        .select("id, user_id")
        .eq("key_hash", keyHash)
        .single();

      if (error || !data) {
        throw new Error("Invalid or revoked API key");
      }

      // Fire-and-forget: record last usage without blocking the pipeline
      supabase
        .from("user_api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", data.id)
        .then(() => {});

      return { ...ctx, userId: data.user_id as string };
    },
    catch: (e) =>
      new AuthError({ message: "Authentication failed", cause: e }),
  });
}
