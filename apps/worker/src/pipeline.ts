/**
 * pipeline.ts
 *
 * The core Effect-ts pipeline that processes an incoming Reel webhook request.
 *
 * Pipeline stages:
 *  1. ParseAndValidateRequest  – validate JSON body against WebhookPayloadSchema
 *  2. AuthenticateWebhook      – hash Bearer token, look up in user_api_keys
 *  3. ExtractVideoMedia        – call Apify Instagram Reel Scraper actor
 *  4. GenerateAISummary        – send mp4 + caption to Gemini 1.5 Pro, validate output
 *  5. GenerateEmbedding        – embed summary text via text-embedding-004
 *  6. PersistToDatabase        – insert into saved_reels
 */

import { Effect } from "effect";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import {
  WebhookPayloadSchema,
  ReelExtractionSchema,
  type ReelExtraction,
  type SavedReel,
} from "@orbit/shared-types";

import type { Env } from "./env.js";
import {
  ParseError,
  AuthError,
  ApifyError,
  GeminiError,
  DatabaseError,
} from "./errors.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ParsedRequest {
  url: string;
  rawToken: string;
}

interface AuthenticatedRequest extends ParsedRequest {
  userId: string;
}

interface ExtractedMedia extends AuthenticatedRequest {
  mp4Url: string;
  caption: string;
}

interface AIResult extends ExtractedMedia {
  extraction: ReelExtraction;
}

interface EmbeddedResult extends AIResult {
  embedding: number[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 1: Parse & Validate Request
// ─────────────────────────────────────────────────────────────────────────────

export function parseAndValidateRequest(
  request: Request
): Effect.Effect<ParsedRequest, ParseError> {
  return Effect.tryPromise({
    try: async () => {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        throw new Error("Missing or malformed Authorization header");
      }
      const rawToken = authHeader.slice(7).trim();

      const body = await request.json();
      const parsed = WebhookPayloadSchema.safeParse(body);
      if (!parsed.success) {
        throw new Error(parsed.error.message);
      }

      return { url: parsed.data.url, rawToken };
    },
    catch: (e) => new ParseError("Failed to parse request", e),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 2: Authenticate Webhook
// Hash the provided Bearer token with SHA-256 and verify against
// the user_api_keys table in Supabase.
// ─────────────────────────────────────────────────────────────────────────────

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function authenticateWebhook(
  ctx: ParsedRequest,
  env: Env
): Effect.Effect<AuthenticatedRequest, AuthError> {
  return Effect.tryPromise({
    try: async () => {
      const keyHash = await sha256Hex(ctx.rawToken);

      const supabase = createClient(
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );

      const { data, error } = await supabase
        .from("user_api_keys")
        .select("id, user_id")
        .eq("key_hash", keyHash)
        .single();

      if (error || !data) {
        throw new Error("Invalid or revoked API key");
      }

      // Update last_used_at (fire-and-forget; don't block the pipeline)
      supabase
        .from("user_api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", data.id)
        .then(() => {});

      return { ...ctx, userId: data.user_id as string };
    },
    catch: (e) => new AuthError("Authentication failed", e),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 3: Extract Video Media via Apify
// Uses the `apify/instagram-reel-scraper` actor.
// ─────────────────────────────────────────────────────────────────────────────

interface ApifyRunResponse {
  data: { id: string; status: string };
}

interface ApifyDatasetItem {
  videoUrl?: string;
  caption?: string;
}

async function waitForApifyRun(
  runId: string,
  apiToken: string
): Promise<void> {
  const MAX_POLLS = 20;
  const POLL_INTERVAL_MS = 3_000;
  for (let i = 0; i < MAX_POLLS; i++) {
    const resp = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${apiToken}`
    );
    const json = (await resp.json()) as { data: { status: string } };
    if (json.data.status === "SUCCEEDED") return;
    if (json.data.status === "FAILED" || json.data.status === "ABORTED") {
      throw new Error(`Apify run ${runId} ended with status: ${json.data.status}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("Apify run timed out");
}

export function extractVideoMedia(
  ctx: AuthenticatedRequest,
  env: Env
): Effect.Effect<ExtractedMedia, ApifyError> {
  return Effect.tryPromise({
    try: async () => {
      const actorId = "apify~instagram-reel-scraper";
      const runResp = await fetch(
        `https://api.apify.com/v2/acts/${actorId}/runs?token=${env.APIFY_API_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            directUrls: [ctx.url],
            resultsLimit: 1,
          }),
        }
      );

      if (!runResp.ok) {
        throw new Error(`Apify run initiation failed: ${runResp.statusText}`);
      }

      const runData = (await runResp.json()) as ApifyRunResponse;
      const runId = runData.data.id;

      await waitForApifyRun(runId, env.APIFY_API_TOKEN);

      const datasetResp = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${env.APIFY_API_TOKEN}`
      );
      const items = (await datasetResp.json()) as ApifyDatasetItem[];

      if (!items.length || !items[0].videoUrl) {
        throw new Error("Apify returned no video URL for the given Reel");
      }

      return {
        ...ctx,
        mp4Url: items[0].videoUrl,
        caption: items[0].caption ?? "",
      };
    },
    catch: (e) => new ApifyError("Apify extraction failed", e),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 4: Generate AI Summary via Gemini 1.5 Pro
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

      // Strip potential markdown fences defensively
      const cleaned = rawText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      let parsed: unknown;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        throw new Error(`Gemini returned invalid JSON:\n${rawText}`);
      }

      const validated = ReelExtractionSchema.safeParse(parsed);
      if (!validated.success) {
        throw new Error(
          `Gemini output failed Zod validation: ${validated.error.message}`
        );
      }

      return { ...ctx, extraction: validated.data };
    },
    catch: (e) => new GeminiError("Gemini summarization failed", e),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 5: Generate Embedding (text-embedding-004)
// ─────────────────────────────────────────────────────────────────────────────

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

      // Embed the AI-generated summary for semantic search
      const result = await embeddingModel.embedContent(ctx.extraction.summary);
      const embedding = result.embedding.values;

      return { ...ctx, embedding };
    },
    catch: (e) => new GeminiError("Embedding generation failed", e),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 6: Persist to Database
// ─────────────────────────────────────────────────────────────────────────────

export function persistToDatabase(
  ctx: EmbeddedResult,
  env: Env
): Effect.Effect<SavedReel, DatabaseError> {
  return Effect.tryPromise({
    try: async () => {
      const supabase = createClient(
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );

      const { data, error } = await supabase
        .from("saved_reels")
        .insert({
          user_id: ctx.userId,
          original_url: ctx.url,
          title: ctx.extraction.title,
          summary: ctx.extraction.summary,
          category: ctx.extraction.category,
          tags: ctx.extraction.tags,
          key_takeaways: ctx.extraction.key_takeaways,
          embedding: JSON.stringify(ctx.embedding),
        })
        .select(
          "id, user_id, original_url, title, summary, category, tags, key_takeaways, created_at"
        )
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? "Insert returned no data");
      }

      return data as SavedReel;
    },
    catch: (e) => new DatabaseError("Database persist failed", e),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Composed Pipeline
// ─────────────────────────────────────────────────────────────────────────────

export function runPipeline(
  request: Request,
  env: Env
) {
  return Effect.gen(function* () {
    const parsed = yield* parseAndValidateRequest(request);
    const authed = yield* authenticateWebhook(parsed, env);
    const media = yield* extractVideoMedia(authed, env);
    const aiResult = yield* generateAISummary(media, env);
    const embedded = yield* generateEmbedding(aiResult, env);
    const saved = yield* persistToDatabase(embedded, env);
    return saved;
  });
}
