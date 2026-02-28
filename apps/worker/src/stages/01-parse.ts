/**
 * stages/01-parse.ts
 *
 * Stage 1 – Parse & Validate Request
 *
 * Reads the Authorization header and JSON body from the incoming Request and
 * produces a validated { url, rawToken } object.  Any malformation causes a
 * typed ParseError to surface in the Effect error channel.
 */

import { Effect, Schema } from "effect";
import { WebhookPayloadSchema, ParseError } from "@orbit/shared-types";

// ─────────────────────────────────────────────────────────────────────────────
// Context type produced by this stage
// ─────────────────────────────────────────────────────────────────────────────

export const ParsedRequestSchema = Schema.Struct({
  /** The reel URL extracted from the webhook body */
  url: Schema.String,
  /** Raw bearer token extracted from the Authorization header */
  rawToken: Schema.String,
});

export type ParsedRequest = Schema.Schema.Type<typeof ParsedRequestSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Stage implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts and validates the bearer token and the webhook JSON payload.
 *
 * @returns ParsedRequest on success, ParseError on failure.
 */
export function parseAndValidateRequest(
  request: Request
): Effect.Effect<ParsedRequest, ParseError> {
  return Effect.tryPromise({
    try: async () => {
      // 1. Extract bearer token
      const authHeader = request.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        throw new Error("Missing or malformed Authorization header");
      }
      const rawToken = authHeader.slice(7).trim();

      // 2. Parse + validate body with Effect Schema
      const body = await request.json();
      const decode = Schema.decodeUnknownSync(WebhookPayloadSchema);
      const { url } = decode(body);

      return { url, rawToken };
    },
    catch: (e) =>
      new ParseError({
        message: "Failed to parse or validate request",
        cause: e,
      }),
  });
}
