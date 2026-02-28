/**
 * lib/supabase.ts
 *
 * Factory for creating a Supabase service-role client.
 * Centralised here so imports in stage files don't need to reach for env directly.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../env.js";

/** Returns a Supabase client configured with the service-role key (bypasses RLS). */
export function makeSupabaseClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}
