/**
 * api-key.ts
 *
 * Handles the Settings page endpoint for generating iOS Shortcut bearer tokens.
 *
 * Flow:
 *   POST /api/keys
 *   Authorization: Bearer <supabase_jwt>
 *   Body: { key_hash: "<sha256 hex of the raw random token>" }
 *
 * The client generates a cryptographically random token, shows it ONCE to the
 * user, then sends only the SHA-256 hash here.  We store the hash, never the
 * raw token.
 */

import { Schema } from "effect";
import { GenerateApiKeyRequestSchema } from "@orbit/shared-types";
import type { Env } from "./env.js";
import { makeSupabaseClient } from "./lib/supabase.js";
import { jsonResponse } from "./lib/http.js";

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function handleGenerateApiKey(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    // 1. Extract and verify the caller's Supabase JWT
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const supabaseJwt = authHeader.slice(7).trim();

    const supabase = makeSupabaseClient(env);
    const { data: userData, error: userError } =
      await supabase.auth.getUser(supabaseJwt);

    if (userError || !userData.user) {
      return jsonResponse({ error: "Invalid token" }, 401);
    }
    const userId = userData.user.id;

    // 2. Parse + validate request body with Effect Schema
    const body = await request.json();
    const decodeBody = Schema.decodeUnknownSync(GenerateApiKeyRequestSchema);
    const { key_hash } = decodeBody(body);

    // 3. Store the hashed key; never the raw token
    const { data, error } = await supabase
      .from("user_api_keys")
      .insert({ user_id: userId, key_hash })
      .select("id")
      .single();

    if (error || !data) {
      return jsonResponse({ error: "Failed to store API key" }, 500);
    }

    return jsonResponse({ success: true, id: data.id }, 201);
  } catch (e) {
    console.error("handleGenerateApiKey error:", e);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
}
