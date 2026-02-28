/**
 * stages/03-detect-platform.ts
 *
 * Stage 3 – Detect Reel Platform
 *
 * Inspects the URL to determine whether it is an Instagram Reel or a Facebook
 * Reel.  Any other URL is immediately rejected with an UnsupportedPlatformError
 * so the rest of the pipeline is never reached.
 *
 * Supported URL patterns:
 *   Instagram – https://www.instagram.com/reel/<shortcode>/…
 *   Facebook  – https://www.facebook.com/reel/<id>/… OR
 *               https://fb.watch/<token>/…
 */

import { Effect, Schema } from "effect";
import {
  ReelPlatform,
  UnsupportedPlatformError,
} from "@orbit/shared-types";
import type { AuthenticatedRequest } from "./02-auth.js";

// ─────────────────────────────────────────────────────────────────────────────
// Context type produced by this stage
// ─────────────────────────────────────────────────────────────────────────────

export const DetectedRequestSchema = Schema.Struct({
  url: Schema.String,
  rawToken: Schema.String,
  userId: Schema.String,
  /** The platform the URL was resolved to */
  platform: ReelPlatform,
});

export type DetectedRequest = Schema.Schema.Type<typeof DetectedRequestSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Platform matchers
// ─────────────────────────────────────────────────────────────────────────────

const INSTAGRAM_REEL_RE = /instagram\.com\/reel\//i;
const FACEBOOK_REEL_RE = /facebook\.com\/reel\//i;
const FACEBOOK_SHORT_RE = /fb\.watch\//i;

function detectPlatform(url: string): "instagram" | "facebook" | null {
  if (INSTAGRAM_REEL_RE.test(url)) return "instagram";
  if (FACEBOOK_REEL_RE.test(url) || FACEBOOK_SHORT_RE.test(url))
    return "facebook";
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates that the URL is a recognised Instagram or Facebook Reel, and
 * attaches the resolved platform to the context.
 *
 * @returns DetectedRequest on success, UnsupportedPlatformError when the URL
 *          does not belong to a supported platform.
 */
export function detectReelPlatform(
  ctx: AuthenticatedRequest
): Effect.Effect<DetectedRequest, UnsupportedPlatformError> {
  const platform = detectPlatform(ctx.url);

  if (platform === null) {
    return Effect.fail(new UnsupportedPlatformError({ url: ctx.url }));
  }

  return Effect.succeed({ ...ctx, platform });
}
