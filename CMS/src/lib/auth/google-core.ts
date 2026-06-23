/**
 * PURE Google OAuth 2.0 primitives for the per-Site CMS (cms-auth Slice 2b).
 *
 * Net-new: no Google auth exists anywhere else in the repo. This is the PURE
 * half — NO `@/` imports, NO CF bindings, NO Drizzle — only `globalThis.crypto`,
 * so a bare `node --test` loads it directly (same split as `session-core.ts` /
 * `invite-core.ts`). The CF/D1-bound route handlers live in
 * `app/api/auth/google/{start,callback}/route.ts`.
 *
 * Three responsibilities:
 *   1. Build the Google consent (authorize) redirect URL.
 *   2. Sign/verify the OAuth `state` param (stateless CSRF defence — HMAC over a
 *      nonce + timestamp with CMS_AUTH_SECRET, so we need no server-side store).
 *   3. Extract the VERIFIED email from an id_token JWT and decide whether that
 *      email may sign in (allowed ONLY if a matching CMS user or pending invite
 *      exists — NO self-signup, per Slice-0 decision 3).
 *
 * The id_token comes from Google's token endpoint over TLS in a direct
 * server-to-server exchange (we hold the client_secret), so its provenance is
 * already authenticated by that channel — we decode the payload and enforce
 * `aud === clientId`, `iss` is Google, and `email_verified === true`. (Full JWK
 * signature verification is a hardening follow-up; the TLS-authenticated direct
 * exchange already prevents an attacker from injecting a forged token.)
 */

export const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
/** Google's RS256 signing keys (JWKS). Public; safe to fetch + cache. */
export const GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

/** State lifetime: 10 minutes is plenty for a consent round-trip. */
export const STATE_TTL_MS = 1000 * 60 * 10;

// ---- HMAC helpers (shared shape with forwarded-host.ts) ----------------------

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- 1. Authorize URL --------------------------------------------------------

/**
 * Build the Google consent redirect URL. `scope` defaults to openid+email so the
 * id_token carries a verified email and nothing else (least privilege).
 */
export function buildGoogleAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: "openid email",
    state: input.state,
    // We don't need a refresh token (one-shot sign-in), so no access_type=offline.
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

// ---- 2. Stateless signed state (CSRF) ----------------------------------------

/**
 * Sign an OAuth `state`: `<nonce>.<issuedAtMs>.<hmac>`. Stateless — verifying it
 * needs only the secret, no store. The nonce makes each state unique; the
 * timestamp bounds its lifetime; the HMAC binds both so a client can't forge one.
 */
export async function signState(secret: string, nowMs = Date.now()): Promise<string> {
  const nonce = [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const payload = `${nonce}.${nowMs}`;
  const sig = await hmacHex(secret, payload);
  return `${payload}.${sig}`;
}

/**
 * Verify a `state` produced by `signState`: HMAC matches AND it's within
 * STATE_TTL_MS. Returns false for any tampering, wrong secret, or expiry.
 */
export async function verifyState(
  state: string,
  secret: string,
  nowMs = Date.now(),
): Promise<boolean> {
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [nonce, issuedAtStr, sig] = parts;
  const issuedAt = Number(issuedAtStr);
  if (!nonce || !Number.isFinite(issuedAt)) return false;
  if (nowMs - issuedAt > STATE_TTL_MS || nowMs - issuedAt < -STATE_TTL_MS) return false;
  const expected = await hmacHex(secret, `${nonce}.${issuedAtStr}`);
  return timingSafeEqualHex(sig, expected);
}

// ---- 3. id_token email extraction + sign-in decision -------------------------

type GoogleIdClaims = {
  iss?: unknown;
  aud?: unknown;
  email?: unknown;
  email_verified?: unknown;
  exp?: unknown;
};

/** base64url → JSON object, or null on any malformation. */
function decodeJwtPayload(idToken: string): GoogleIdClaims | null {
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  try {
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("utf8");
    return JSON.parse(json) as GoogleIdClaims;
  } catch {
    return null;
  }
}

/**
 * Extract a VERIFIED email from a Google id_token, enforcing `iss` is Google,
 * `aud === clientId`, `email_verified === true` (Google sends it as a boolean or
 * the string "true"), `exp` not past, and a non-empty email. Returns the
 * normalised (lowercased) email or null. `nowSec` injectable for tests.
 */
export function verifiedEmailFromIdToken(
  idToken: string,
  clientId: string,
  nowSec = Math.floor(Date.now() / 1000),
): string | null {
  const c = decodeJwtPayload(idToken);
  if (!c) return null;
  if (typeof c.iss !== "string" || !GOOGLE_ISSUERS.includes(c.iss)) return null;
  if (c.aud !== clientId) return null;
  if (typeof c.exp === "number" && c.exp < nowSec) return null;
  const verified = c.email_verified === true || c.email_verified === "true";
  if (!verified) return null;
  if (typeof c.email !== "string" || c.email.trim() === "") return null;
  return c.email.trim().toLowerCase();
}

// ---- 3b. JWK RS256 signature verification (hardening) ------------------------

/** A single RSA JWK from Google's JWKS (only the fields we use). */
export type GoogleJwk = { kid?: string; kty?: string; alg?: string; n?: string; e?: string };

/** base64url → Uint8Array (for the JWT signature bytes). */
function b64urlToBytes(b64url: string): Uint8Array {
  let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJwtHeader(idToken: string): { alg?: unknown; kid?: unknown } | null {
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  try {
    let b64 = parts[0].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Verify a Google id_token's RS256 signature against the JWKS — defense in depth
 * on top of the TLS-authenticated direct token exchange. Picks the JWK whose
 * `kid` matches the token header, imports it, and verifies `header.payload` against
 * the signature. Returns false for any mismatch, a missing/wrong key, a non-RS256
 * token, or a malformed token. PURE: takes the JWKS as a param (the route fetches
 * + caches it), so it's node-testable with a generated keypair fixture.
 */
export async function verifyIdTokenSignature(
  idToken: string,
  jwks: { keys: GoogleJwk[] },
): Promise<boolean> {
  const header = decodeJwtHeader(idToken);
  if (!header || header.alg !== "RS256") return false;
  const parts = idToken.split(".");
  if (parts.length !== 3) return false;

  const kid = typeof header.kid === "string" ? header.kid : null;
  const candidates = jwks.keys.filter(
    (k) => k.kty === "RSA" && k.n && k.e && (kid ? k.kid === kid : true),
  );
  if (candidates.length === 0) return false;

  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  let sig: Uint8Array;
  try {
    sig = b64urlToBytes(parts[2]);
  } catch {
    return false;
  }
  // Copy into fresh ArrayBuffer-backed views so the WebCrypto BufferSource type
  // is satisfied (a Uint8Array can be backed by SharedArrayBuffer otherwise).
  const sigBuf = sig.slice().buffer;
  const dataBuf = data.slice().buffer;

  for (const jwk of candidates) {
    try {
      const key = await crypto.subtle.importKey(
        "jwk",
        { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      if (await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sigBuf, dataBuf)) return true;
    } catch {
      // try the next candidate
    }
  }
  return false;
}

export type GoogleSignInDecision =
  | { ok: true; email: string }
  | { ok: false; reason: "noEmail" | "notInvited" };

/**
 * The PURE callback decision: a verified email is allowed to sign in ONLY if it
 * already matches a CMS user OR has a pending invite (NO self-signup — Slice-0
 * decision 3, randoms can't walk in). The existence flags are resolved by the
 * route against D1; this function holds the rule so it's node-testable.
 */
export function decideGoogleSignIn(
  email: string | null,
  exists: { user: boolean; pendingInvite: boolean },
): GoogleSignInDecision {
  if (!email) return { ok: false, reason: "noEmail" };
  if (!exists.user && !exists.pendingInvite) return { ok: false, reason: "notInvited" };
  return { ok: true, email };
}
