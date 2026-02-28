/**
 * stages/07-persist.ts
 *
 * Stage 7 – Persist to Database
 *
 * Inserts the fully-enriched reel into the `saved_reels` Supabase table and
 * validates the returned row against SavedReelSchema before handing it back
 * to the pipeline.
 */

import { Effect, Schema } from "effect";
import { SavedReelSchema, DatabaseError } from "@orbit/shared-types";
import type { SavedReel } from "@orbit/shared-types";
import type { Env } from "../env.js";
import { makeSupabaseClient } from "../lib/supabase.js";
import type { EmbeddedResult } from "./06-embed.js";

// ─────────────────────────────────────────────────────────────────────────────
// Stage implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inserts the reel data and its embedding into `saved_reels`, then validates
 * the returned row with Effect Schema.
 *
 * @returns SavedReel on success, DatabaseError on failure.
 */
export function persistToDatabase(
  ctx: EmbeddedResult,
  env: Env
): Effect.Effect<SavedReel, DatabaseError> {
  return Effect.tryPromise({
    try: async () => {
      const supabase = makeSupabaseClient(env);

      const { data, error } = await supabase
        .from("saved_reels")
        .insert({
          user_id: ctx.userId,
          original_url: ctx.url,
          platform: ctx.platform,
          title: ctx.extraction.title,
          summary: ctx.extraction.summary,
          category: ctx.extraction.category,
          tags: ctx.extraction.tags,
          key_takeaways: ctx.extraction.key_takeaways,
          embedding: JSON.stringify(ctx.embedding),
          // ── Debug / observability columns ──────────────────────────────────
          caption: ctx.caption || null,
          apify_raw: ctx.apifyRaw ?? null,
          gemini_prompt: ctx.geminiPrompt,
          gemini_raw: ctx.geminiRaw,
        })
        .select(
          "id, user_id, original_url, platform, title, summary, category, tags, key_takeaways, caption, created_at"
        )
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? "Insert returned no data");
      }

      // Validate the DB row at runtime with Effect Schema
      const decodeSavedReel = Schema.decodeUnknownSync(SavedReelSchema);
      const savedReel: SavedReel = decodeSavedReel(data);

      return savedReel;
    },
    catch: (e) =>
      new DatabaseError({ message: "Database persist failed", cause: e }),
  });
}
