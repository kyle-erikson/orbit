/**
 * @orbit/shared-types
 *
 * All shared schemas and derived TypeScript types for the Orbit monorepo.
 * Uses Effect's built-in Schema module for runtime validation and type
 * generation — no additional dependencies required.
 */

import { Schema, Data } from "effect";

// ─────────────────────────────────────────────────────────────────────────────
// Platform
// The two supported reel platforms.
// ─────────────────────────────────────────────────────────────────────────────

export const ReelPlatform = Schema.Literal("instagram", "facebook");
export type ReelPlatform = Schema.Schema.Type<typeof ReelPlatform>;

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Payload Schema
// Sent by the iOS Apple Shortcut when a user shares a Reel URL.
// ─────────────────────────────────────────────────────────────────────────────

/** The JSON body the iOS Shortcut POSTs to the webhook endpoint. */
export const WebhookPayloadSchema = Schema.Struct({
  /** The raw Instagram or Facebook Reel URL */
  url: Schema.String.pipe(
    Schema.filter((s) => {
      try {
        new URL(s);
        return true;
      } catch {
        return false;
      }
    }, { message: () => "A valid Reel URL is required." })
  ),
});

export type WebhookPayload = Schema.Schema.Type<typeof WebhookPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// AI Extraction Schema (Gemini Output)
// The structured JSON that Gemini must return after analysing a Reel.
// ─────────────────────────────────────────────────────────────────────────────

/** A single actionable takeaway distilled from the reel. */
export const KeyTakeawaySchema = Schema.Struct({
  /** Short title / label for the takeaway */
  title: Schema.NonEmptyString,
  /** Detailed explanation of the takeaway */
  detail: Schema.NonEmptyString,
});

export type KeyTakeaway = Schema.Schema.Type<typeof KeyTakeawaySchema>;

/**
 * The full extraction result that Gemini 1.5 Pro is instructed to produce.
 * This schema is used both to validate Gemini's raw output on the Worker and
 * as the authoritative type shared with frontend consumers.
 */
export const ReelExtractionSchema = Schema.Struct({
  /** Concise, human-readable title for the reel (≤ 80 chars) */
  title: Schema.String.pipe(
    Schema.minLength(1),
    Schema.maxLength(80)
  ),

  /** A 2-4 sentence plain-language summary of the reel's core value */
  summary: Schema.String.pipe(Schema.minLength(10)),

  /**
   * A broad, single-word category for the reel
   * (e.g. "Cooking", "Finance", "Fitness", "Travel", "Tech")
   */
  category: Schema.String.pipe(
    Schema.minLength(2),
    Schema.maxLength(60)
  ),

  /** 3-10 granular tags (lowercase, no leading #) */
  tags: Schema.Array(
    Schema.String.pipe(Schema.minLength(1))
  ).pipe(
    Schema.filter((arr) => arr.length >= 3 && arr.length <= 10, {
      message: () => "tags must have between 3 and 10 items",
    })
  ),

  /** 2-5 actionable bullet points the viewer can apply */
  key_takeaways: Schema.Array(KeyTakeawaySchema).pipe(
    Schema.filter((arr) => arr.length >= 2 && arr.length <= 5, {
      message: () => "key_takeaways must have between 2 and 5 items",
    })
  ),
});

export type ReelExtraction = Schema.Schema.Type<typeof ReelExtractionSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Saved Reel (Database Row Shape)
// Mirrors the `saved_reels` table in Supabase. Used for API responses and
// frontend rendering; the `embedding` column is omitted since it is a
// server-only concern.
// ─────────────────────────────────────────────────────────────────────────────

export const SavedReelSchema = Schema.Struct({
  id: Schema.UUID,
  user_id: Schema.UUID,
  original_url: Schema.String,
  platform: ReelPlatform,
  title: Schema.String,
  summary: Schema.String,
  category: Schema.String,
  tags: Schema.Array(Schema.String),
  key_takeaways: Schema.Array(KeyTakeawaySchema),
  created_at: Schema.String,
});

export type SavedReel = Schema.Schema.Type<typeof SavedReelSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// API Key Schemas
// For the Settings page — generating & displaying a freshly-created token.
// ─────────────────────────────────────────────────────────────────────────────

export const GenerateApiKeyRequestSchema = Schema.Struct({
  /** SHA-256 hex digest of the raw key generated on the client */
  key_hash: Schema.String.pipe(
    Schema.filter((s) => s.length === 64, {
      message: () => "Expected a 64-character SHA-256 hex digest",
    })
  ),
});

export type GenerateApiKeyRequest = Schema.Schema.Type<
  typeof GenerateApiKeyRequestSchema
>;

export const GenerateApiKeyResponseSchema = Schema.Struct({
  /** Confirm the key was stored; the raw key is NEVER echoed by the server */
  success: Schema.Boolean,
  id: Schema.UUID,
});

export type GenerateApiKeyResponse = Schema.Schema.Type<
  typeof GenerateApiKeyResponseSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Tagged Errors (Effect Data)
// Re-exported here so both worker and any future consumers share the same
// error constructors without duplicating them.
// ─────────────────────────────────────────────────────────────────────────────

export class ParseError extends Data.TaggedError("ParseError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class AuthError extends Data.TaggedError("AuthError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class UnsupportedPlatformError extends Data.TaggedError(
  "UnsupportedPlatformError"
)<{
  readonly url: string;
}> {}

export class ApifyError extends Data.TaggedError("ApifyError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class GeminiError extends Data.TaggedError("GeminiError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class DatabaseError extends Data.TaggedError("DatabaseError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export type PipelineError =
  | ParseError
  | AuthError
  | UnsupportedPlatformError
  | ApifyError
  | GeminiError
  | DatabaseError;
