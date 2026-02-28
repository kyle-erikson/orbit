/**
 * stages/04-extract-media.ts
 *
 * Stage 4 – Extract Video Media via Apify
 *
 * Uses the official `apify-client` package instead of raw HTTP requests.
 * `actor.call()` handles start + polling internally, so there is no manual
 * polling loop here.  Dataset items are fetched after the run completes via
 * `client.dataset(run.defaultDatasetId).listItems()`.
 *
 * Actors used:
 *   Instagram – apify/instagram-reel-scraper
 *   Facebook  – apify/facebook-reel-scraper
 *
 * NOTE: We import from the main 'apify-client' entry. Wrangler's bundler
 * automatically resolves to the pre-built browser bundle (dist/bundle.js) via
 * the package.json "browser" field when targeting a Worker/edge runtime — so
 * we get correct types without needing the un-typed '/browser' sub-path export.
 * nodejs_compat must be enabled in wrangler.toml (it is).
 */

import { Effect, Schema } from "effect";
import { ApifyClient } from "apify-client";
import { ApifyError } from "@orbit/shared-types";
import type { Env } from "../env";
import type { DetectedRequest } from "./03-detect-platform";

// ─────────────────────────────────────────────────────────────────────────────
// Context type produced by this stage
// ─────────────────────────────────────────────────────────────────────────────

export const ExtractedMediaSchema = Schema.Struct({
  url: Schema.String,
  rawToken: Schema.String,
  userId: Schema.String,
  platform: Schema.String,
  /** Direct mp4 URL of the reel video */
  mp4Url: Schema.String,
  /** Original caption / description text from the post */
  caption: Schema.String,
  /** Full raw JSON payload returned by the Apify dataset item */
  apifyRaw: Schema.Unknown,
});

export type ExtractedMedia = Schema.Schema.Type<typeof ExtractedMediaSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Actor configuration
// ─────────────────────────────────────────────────────────────────────────────

/** Maps a platform to its Apify Store actor ID. */
function actorIdFor(platform: string): string {
  return platform === "facebook"
    ? "apify/facebook-reel-scraper"
    : "apify/instagram-reel-scraper";
}

// Dataset item shape returned by both actors
interface ReelDatasetItem {
  videoUrl?: string;
  caption?: string;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs the appropriate Apify actor for the detected platform.
 *
 * `actor.call()` starts the run and waits for it to reach a terminal state —
 * no manual polling required.  The resolved run object carries `defaultDatasetId`
 * which is used to fetch dataset items in one additional request.
 *
 * @returns ExtractedMedia on success, ApifyError on any failure.
 */
export function extractVideoMedia(
  ctx: DetectedRequest,
  env: Env
): Effect.Effect<ExtractedMedia, ApifyError> {
  return Effect.tryPromise({
    try: async () => {
      const client = new ApifyClient({
        token: env.APIFY_API_TOKEN,
        // Built-in exponential backoff; 8 retries by default.
        // timeoutSecs governs the overall wall-clock limit for `.call()`.
        timeoutSecs: 120,
      });

      const actorId = actorIdFor(ctx.platform);

      // Start the actor and block until the run reaches a terminal state.
      // The client handles all polling + exponential backoff internally.
      const run = await client.actor(actorId).call({
        directUrls: [ctx.url],
        resultsLimit: 1,
      });

      if (run.status !== "SUCCEEDED") {
        throw new Error(
          `Apify actor run ended with non-success status: ${run.status}`
        );
      }

      // Fetch up to 1 item from the run's default dataset
      const { items } = await client
        .dataset(run.defaultDatasetId)
        .listItems({ limit: 1 });

      const item = items[0] as ReelDatasetItem | undefined;

      if (!item?.videoUrl) {
        throw new Error("Apify returned no video URL for the given Reel");
      }

      return {
        ...ctx,
        mp4Url: item.videoUrl,
        caption: item.caption ?? "",
        apifyRaw: item,
      };
    },
    catch: (e) =>
      new ApifyError({ message: "Apify extraction failed", cause: e }),
  });
}
