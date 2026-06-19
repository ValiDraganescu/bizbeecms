/**
 * Verify the public host the router forwarded.
 *
 * The bizbeecms-router proxies customer custom domains to this Worker's internal
 * workers.dev origin, so the request host / x-forwarded-host get normalized by
 * OpenNext to workers.dev — the real customer host (e.g. restovista.com) is lost.
 * The router instead passes `x-bizbee-host` + an HMAC signature in
 * `x-bizbee-host-sig` (signed with the shared CMS_AUTH_SECRET).
 *
 * We only trust `x-bizbee-host` when its signature verifies — so a direct hit to
 * the workers.dev URL with a forged `x-bizbee-host` (open-redirect / SSO-return
 * spoof attempt) is rejected and we fall back to a trusted host. NEVER build a
 * host-dependent URL from the raw header without this check.
 */

/** Constant-time hex string compare. */
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
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Return the router-forwarded host ONLY if its HMAC signature is valid; otherwise
 * null (caller falls back to a trusted host). `host`/`sig` come from the
 * x-bizbee-host / x-bizbee-host-sig request headers.
 */
export async function verifyForwardedHost(
  host: string | null,
  sig: string | null,
  secret: string | undefined,
): Promise<string | null> {
  if (!host || !sig || !secret) return null;
  // Basic hostname sanity — no scheme, path, or CRLF that could poison a URL.
  if (!/^[a-z0-9.-]+$/i.test(host)) return null;
  const expected = await hmacHex(secret, host);
  return timingSafeEqualHex(sig, expected) ? host : null;
}
