/**
 * stages/05-summarize.ts
 *
 * Stage 5 – Generate AI Summary via Gemini 1.5 Pro
 *
 * Sends the mp4 URL and caption to Gemini 1.5 Pro with a structured-output
 * system prompt, then validates the JSON response using the Effect Schema
 * ReelExtractionSchema from shared-types.
 */

import { Effect, Schema } from "effect";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ReelExtractionSchema, GeminiError } from "@orbit/shared-types";
import type { ReelExtraction } from "@orbit/shared-types";
import type { Env } from "../env.js";
import type { ExtractedMedia } from "./04-extract-media.js";

// ─────────────────────────────────────────────────────────────────────────────
// Context type produced by this stage
// ─────────────────────────────────────────────────────────────────────────────

export const AIResultSchema = Schema.Struct({
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
  /** Structured extraction validated against ReelExtractionSchema */
  extraction: ReelExtractionSchema,
});

export type AIResult = Schema.Schema.Type<typeof AIResultSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Gemini prompt
// ─────────────────────────────────────────────────────────────────────────────

const GEMINI_SYSTEM_PROMPT = `
You are an expert information extractor for short-form video content.
Your task is to watch the provided video and read the accompanying caption,
then produce a structured JSON summary following the exact schema provided.

IMPORTANT RULES:
- Respond with ONLY a raw JSON object. No markdown fences, no explanation.
- The JSON MUST match this exact shape:
  {
    "title": "...",        // concise title ≤ 80 chars
    "summary": "...",      // 2-4 sentences, plain language
    "category": "...",     // single broad category word
    "tags": ["...", ...],  // 3-10 lowercase tags, no # prefix
    "key_takeaways": [
      { "title": "...", "detail": "..." },
      ...
    ]
  }
- key_takeaways should have 2-5 items, each with a short "title" and a "detail" explanation.
- Focus on actionable insights and the core value of the content.
`.trim();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Strips optional markdown code fences that Gemini occasionally wraps around its output. */
function stripMarkdownFences(raw: string): string {
  return raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends the video and caption to Gemini 1.5 Pro, parses the JSON response,
 * and validates it against ReelExtractionSchema using Effect Schema.
 *
 * @returns AIResult on success, GeminiError on any failure.
 */
export function generateAISummary(
  ctx: ExtractedMedia,
  env: Env
): Effect.Effect<AIResult, GeminiError> {
  return Effect.tryPromise({
    try: async () => {
      const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

      const prompt = [
        GEMINI_SYSTEM_PROMPT,
        ctx.caption ? `\nOriginal Caption:\n${ctx.caption}` : "",
      ].join("\n");

      const result = await model.generateContent([
        { text: prompt },
        {
          fileData: {
            mimeType: "video/mp4",
            fileUri: ctx.mp4Url,
          },
        },
      ]);

      const rawText = result.response.text().trim();
      const cleaned = stripMarkdownFences(rawText);

      let rawParsed: unknown;
      try {
        rawParsed = JSON.parse(cleaned);
      } catch {
        throw new Error(`Gemini returned invalid JSON:\n${rawText}`);
      }

      // Runtime-validate with Effect Schema
      const decodeExtraction = Schema.decodeUnknownSync(ReelExtractionSchema);
      const extraction: ReelExtraction = decodeExtraction(rawParsed);

      return {
        ...ctx,
        geminiPrompt: prompt,
        geminiRaw: rawText,
        extraction,
      };
    },
    catch: (e) =>
      new GeminiError({ message: "Gemini summarization failed", cause: e }),
  });
}
