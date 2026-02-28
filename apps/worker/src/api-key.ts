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
 * The client generates a cryptographically random token, shows it ONCE to the user,
 * then sends only the SHA-256 hash here. We store the hash, never the raw token.
 */

import { createClient } from "@supabase/supabase-js";
import { GenerateApiKeyRequestSchema } from "@orbit/shared-types";
import type { Env } from "./env.js";

export async function handleGenerateApiKey(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    // 1. Verify the Supabase user JWT so only authenticated users can create keys
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const supabaseJwt = authHeader.slice(7).trim();

    // Use the anon key via the user's JWT to get their user_id
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData, error: userError } = await supabase.auth.getUser(supabaseJwt);
    if (userError || !userData.user) {
      return json({ error: "Invalid token" }, 401);
    }
    const userId = userData.user.id;

    // 2. Validate request body
    const body = await request.json();
    const parsed = GenerateApiKeyRequestSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: parsed.error.message }, 400);
    }

    // 3. Store the hashed key
    const { data, error } = await supabase
      .from("user_api_keys")
      .insert({
        user_id: userId,
        key_hash: parsed.data.key_hash,
      })
      .select("id")
      .single();

    if (error || !data) {
      return json({ error: "Failed to store API key" }, 500);
    }

    return json({ success: true, id: data.id }, 201);
  } catch (e) {
    console.error("handleGenerateApiKey error:", e);
    return json({ error: "Internal server error" }, 500);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
