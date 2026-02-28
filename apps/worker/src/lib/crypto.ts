/**
 * lib/crypto.ts
 *
 * Cryptographic utility functions for the Cloudflare Worker runtime.
 * Uses the Web Crypto API which is available natively in the worker environment.
 */

/**
 * Computes the SHA-256 hex digest of a UTF-8 string.
 * Used to hash raw API bearer tokens before comparing them against the database.
 */
export async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
