import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Payload Schema
// Sent by the iOS Apple Shortcut when a user shares a Reel URL.
// ─────────────────────────────────────────────────────────────────────────────

/** The JSON body the iOS Shortcut POSTs to the webhook endpoint. */
export const WebhookPayloadSchema = z.object({
  /** The raw Instagram or Facebook Reel URL */
  url: z.string().url({ message: "A valid Reel URL is required." }),
});

export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// AI Extraction Schema (Gemini Output)
// The structured JSON that Gemini must return after analysing a Reel.
// ─────────────────────────────────────────────────────────────────────────────

/** A single actionable takeaway distilled from the reel. */
export const KeyTakeawaySchema = z.object({
  /** Short title / label for the takeaway */
  title: z.string().min(1),
  /** Detailed explanation of the takeaway */
  detail: z.string().min(1),
});

export type KeyTakeaway = z.infer<typeof KeyTakeawaySchema>;

/**
 * The full extraction result that Gemini 1.5 Pro is instructed to produce.
 * This schema is used both to validate Gemini's raw output on the Worker and
 * as the authoritative type shared with frontend consumers.
 */
export const ReelExtractionSchema = z.object({
  /** Concise, human-readable title for the reel (≤ 80 chars) */
  title: z.string().min(1).max(80),

  /** A 2-4 sentence plain-language summary of the reel's core value */
  summary: z.string().min(10),

  /**
   * A broad, single-word category for the reel (e.g. "Cooking", "Finance",
   * "Fitness", "Travel", "Tech", "Lifestyle", "Education", "Entertainment")
   */
  category: z.string().min(2).max(60),

  /** 3-10 granular tags (lowercase, no leading #) */
  tags: z
    .array(z.string().toLowerCase().min(1))
    .min(3)
    .max(10),

  /** 2-5 actionable bullet points the viewer can apply */
  key_takeaways: z
    .array(KeyTakeawaySchema)
    .min(2)
    .max(5),
});

export type ReelExtraction = z.infer<typeof ReelExtractionSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Saved Reel (Database Row Shape)
// Mirrors the `saved_reels` table in Supabase. Used for API responses and
// frontend rendering; the `embedding` column is omitted from the public type
// since it is a server-only concern.
// ─────────────────────────────────────────────────────────────────────────────

export const SavedReelSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  original_url: z.string().url(),
  title: z.string(),
  summary: z.string(),
  category: z.string(),
  tags: z.array(z.string()),
  key_takeaways: z.array(KeyTakeawaySchema),
  created_at: z.string().datetime(),
});

export type SavedReel = z.infer<typeof SavedReelSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// API Key Schema
// For the Settings page — generating & displaying a freshly-created token.
// ─────────────────────────────────────────────────────────────────────────────

export const GenerateApiKeyRequestSchema = z.object({
  /** SHA-256 hex digest of the raw key generated on the client */
  key_hash: z.string().length(64, "Expected a 64-character SHA-256 hex digest"),
});

export type GenerateApiKeyRequest = z.infer<typeof GenerateApiKeyRequestSchema>;

export const GenerateApiKeyResponseSchema = z.object({
  /** Confirm the key was stored; the raw key is NEVER echoed by the server */
  success: z.boolean(),
  id: z.string().uuid(),
});

export type GenerateApiKeyResponse = z.infer<typeof GenerateApiKeyResponseSchema>;
