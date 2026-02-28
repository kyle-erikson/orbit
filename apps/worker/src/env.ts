/**
 * Cloudflare Worker environment bindings.
 * Corresponds to [vars] and secrets defined in wrangler.toml / wrangler secret put.
 */
export interface Env {
  /** Supabase project URL, e.g. https://abc.supabase.co */
  SUPABASE_URL: string;
  /**
   * Supabase service-role key – bypasses RLS.
   * Used ONLY on the worker to perform privileged inserts/reads.
   * NEVER expose to the browser.
   */
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** Apify API token for the Instagram Reel Scraper actor */
  APIFY_API_TOKEN: string;
  /** Google AI Studio / Vertex AI Gemini API key */
  GEMINI_API_KEY: string;
}
