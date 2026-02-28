/**
 * stages/06-embed.ts
 *
 * Stage 6 – Generate Embedding (text-embedding-004)
 *
 * Embeds the AI-generated summary text using Google's text-embedding-004 model
 * so the saved reel can later be retrieved via semantic search.
 */

import { Effect, Schema } from "effect";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GeminiError, ReelExtractionSchema } from "@orbit/shared-types";
import type { Env } from "../env.js";
import type { AIResult } from "./05-summarize.js";

// ─────────────────────────────────────────────────────────────────────────────
// Context type produced by this stage
// ─────────────────────────────────────────────────────────────────────────────

export const EmbeddedResultSchema = Schema.Struct({
  url: Schema.String,
  rawToken: Schema.String,
  userId: Schema.String,
  platform: Schema.String,
  mp4Url: Schema.String,
  caption: Schema.String,
  /** Full raw Apify dataset item, carried forward from Stage 4 */
  apifyRaw: Schema.Unknown,
  /** Exact prompt string sent to Gemini */
  geminiPrompt: Schema.String,
  /** Raw Gemini response text before JSON parsing */
  geminiRaw: Schema.String,
  extraction: ReelExtractionSchema,
  /** Dense float vector from text-embedding-004 */
  embedding: Schema.Array(Schema.Number),
});

export type EmbeddedResult = Schema.Schema.Type<typeof EmbeddedResultSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Stage implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calls Google's text-embedding-004 model with the AI-generated summary and
 * returns the resulting float32 vector.
 *
 * @returns EmbeddedResult on success, GeminiError on failure.
 */
export function generateEmbedding(
  ctx: AIResult,
  env: Env
): Effect.Effect<EmbeddedResult, GeminiError> {
  return Effect.tryPromise({
    try: async () => {
      const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
      const embeddingModel = genAI.getGenerativeModel({
        model: "text-embedding-004",
      });

      const result = await embeddingModel.embedContent(
        ctx.extraction.summary
      );
      const embedding = result.embedding.values;

      return { ...ctx, embedding };
    },
    catch: (e) =>
      new GeminiError({ message: "Embedding generation failed", cause: e }),
  });
}
