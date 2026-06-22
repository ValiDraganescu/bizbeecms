/**
 * PURE API-key primitives for the remote MCP server (cms-mcp Slice 2).
 *
 * No `@/` imports, no Cloudflare bindings — only the Web Crypto API (present on
 * both a Worker and Node 20+, via `globalThis.crypto`). So this module is
 * node-`--test` loadable (CAVEAT: tests can't import `@/db/*`). The store-bound
 * lookup/guard live in the impure modules that import these helpers.
 *
 * A key looks like `bzb_<43 base64url chars>` (32 random bytes). We persist only
 * the SHA-256 HEX of the full plaintext (`hashKey`) — never the plaintext. The
 * guard hashes the presented bearer and looks the hash up; `verifyKey` does the
 * constant-time hex compare. `parseBearer` extracts the token from the header.
 */

const KEY_PREFIX = "bzb_";
// How many leading chars to keep as the non-secret display prefix (the literal
// `bzb_` tag + a few token chars — enough to tell keys apart, useless to auth).
const DISPLAY_PREFIX_LEN = KEY_PREFIX.length + 8;

/** Base64url-encode bytes (no padding) — URL/header-safe key text. */
function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  // btoa exists on Workers and Node 16+.
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Mint a fresh plaintext key: `bzb_` + 32 crypto-random bytes (base64url).
 * Shown to the operator ONCE; only its hash is stored. Returns the full key —
 * the caller hashes it and keeps `keyPrefix(key)` for display.
 */
export function generateKey(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return KEY_PREFIX + b64url(bytes);
}

/** The non-secret leading segment of a key, stored for the admin list. */
export function keyPrefix(key: string): string {
  return key.slice(0, DISPLAY_PREFIX_LEN);
}

/** SHA-256 hex of the full plaintext key. This is what we persist + look up. */
export async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time compare of two hex hashes (same length always; SHA-256 hex is
 * fixed 64 chars). Avoids leaking how many leading chars matched via timing.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify a presented plaintext `key` against a stored `storedHash` — hash the
 * key and constant-time compare. Returns false on shape/empty mismatch.
 */
export async function verifyKey(key: string, storedHash: string): Promise<boolean> {
  if (!key || !storedHash) return false;
  return timingSafeEqualHex(await hashKey(key), storedHash);
}

/**
 * Pull the bearer token out of an `Authorization` header value. Case-insensitive
 * scheme, tolerant of extra whitespace. Returns the trimmed token, or null if
 * the header is absent / not a non-empty `Bearer` credential.
 */
export function parseBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^\s*Bearer\s+(\S.*?)\s*$/i.exec(header);
  return m ? m[1] : null;
}

/** Quick shape check before a DB round-trip: must be a `bzb_`-prefixed token. */
export function looksLikeKey(token: string | null | undefined): boolean {
  return typeof token === "string" && token.startsWith(KEY_PREFIX) && token.length > DISPLAY_PREFIX_LEN;
}
