/**
 * stages/04-extract-media.ts
 *
 * Stage 4 – Extract Video Media via Apify
 *
 * Selects the correct Apify actor based on the detected platform, starts a run,
 * polls until SUCCEEDED, and returns the mp4 URL + caption.
 *
 * Actors used:
 *   Instagram – apify~instagram-reel-scraper
 *   Facebook  – apify~facebook-reel-scraper
 */

import { Effect, Schema } from "effect";
import { ApifyError } from "@orbit/shared-types";
import type { Env } from "../env.js";
import type { DetectedRequest } from "./03-detect-platform.js";

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
});

export type ExtractedMedia = Schema.Schema.Type<typeof ExtractedMediaSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Apify internal types
// ─────────────────────────────────────────────────────────────────────────────

interface ApifyRunResponse {
  data: { id: string; status: string };
}

interface ApifyDatasetItem {
  videoUrl?: string;
  caption?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const APIFY_BASE = "https://api.apify.com/v2";
const MAX_POLLS = 20;
const POLL_INTERVAL_MS = 3_000;

/** Maps a platform to its Apify actor slug. */
function actorSlugFor(platform: string): string {
  return platform === "facebook"
    ? "apify~facebook-reel-scraper"
    : "apify~instagram-reel-scraper";
}

/**
 * Polls the Apify run status until it reaches SUCCEEDED or a terminal failure
 * state, or until MAX_POLLS is exhausted.
 */
async function waitForApifyRun(runId: string, apiToken: string): Promise<void> {
  for (let i = 0; i < MAX_POLLS; i++) {
    const resp = await fetch(
      `${APIFY_BASE}/actor-runs/${runId}?token=${apiToken}`
    );
    const json = (await resp.json()) as { data: { status: string } };

    switch (json.data.status) {
      case "SUCCEEDED":
        return;
      case "FAILED":
      case "ABORTED":
      case "TIMED-OUT":
        throw new Error(
          `Apify run ${runId} ended with status: ${json.data.status}`
        );
      default:
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
  throw new Error("Apify run timed out after maximum polls");
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Starts an Apify actor run for the appropriate platform, waits for completion,
 * and extracts the video URL and caption from the dataset.
 *
 * @returns ExtractedMedia on success, ApifyError on any failure.
 */
export function extractVideoMedia(
  ctx: DetectedRequest,
  env: Env
): Effect.Effect<ExtractedMedia, ApifyError> {
  return Effect.tryPromise({
    try: async () => {
      const actorId = actorSlugFor(ctx.platform);

      // Start the actor run
      const runResp = await fetch(
        `${APIFY_BASE}/acts/${actorId}/runs?token=${env.APIFY_API_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ directUrls: [ctx.url], resultsLimit: 1 }),
        }
      );

      if (!runResp.ok) {
        throw new Error(`Apify run initiation failed: ${runResp.statusText}`);
      }

      const runData = (await runResp.json()) as ApifyRunResponse;
      const runId = runData.data.id;

      // Poll until complete
      await waitForApifyRun(runId, env.APIFY_API_TOKEN);

      // Fetch dataset results
      const datasetResp = await fetch(
        `${APIFY_BASE}/actor-runs/${runId}/dataset/items?token=${env.APIFY_API_TOKEN}`
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
    catch: (e) =>
      new ApifyError({ message: "Apify extraction failed", cause: e }),
  });
}
