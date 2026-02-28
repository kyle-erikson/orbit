/**
 * pipeline.ts
 *
 * Composed Effect-ts pipeline that processes an incoming Reel webhook request.
 *
 * Stages (in order):
 *  1. parseAndValidateRequest  – validate Authorization header + JSON body
 *  2. authenticateWebhook      – hash Bearer token, look up in user_api_keys
 *  3. detectReelPlatform       – accept only Instagram / Facebook Reels; reject all else
 *  4. extractVideoMedia        – scrape mp4 URL + caption via Apify
 *  5. generateAISummary        – structured Gemini 1.5 Pro analysis
 *  6. generateEmbedding        – embed summary with text-embedding-004
 *  7. persistToDatabase        – insert into saved_reels, return validated row
 */

import { Effect } from "effect";
import type { Env } from "./env.js";

import { parseAndValidateRequest } from "./stages/01-parse.js";
import { authenticateWebhook } from "./stages/02-auth.js";
import { detectReelPlatform } from "./stages/03-detect-platform.js";
import { extractVideoMedia } from "./stages/04-extract-media.js";
import { generateAISummary } from "./stages/05-summarize.js";
import { generateEmbedding } from "./stages/06-embed.js";
import { persistToDatabase } from "./stages/07-persist.js";

/**
 * Runs the complete reel-processing pipeline for a single webhook request.
 *
 * On success the Effect resolves to the persisted SavedReel row.
 * On failure the Effect fails with one of the typed PipelineError variants –
 * ParseError | AuthError | UnsupportedPlatformError | ApifyError | GeminiError | DatabaseError.
 */
export function runPipeline(request: Request, env: Env) {
  return Effect.gen(function* () {
    const parsed = yield* parseAndValidateRequest(request);
    const authed = yield* authenticateWebhook(parsed, env);
    const detected = yield* detectReelPlatform(authed);
    const media = yield* extractVideoMedia(detected, env);
    const aiResult = yield* generateAISummary(media, env);
    const embedded = yield* generateEmbedding(aiResult, env);
    const saved = yield* persistToDatabase(embedded, env);
    return saved;
  });
}
