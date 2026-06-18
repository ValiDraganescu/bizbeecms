/**
 * CMS SSO handoff (cross-host auth bridge). PM and each per-Site CMS run on
 * DIFFERENT hosts under `*.workers.dev` — which is on the Public Suffix List, so
 * a shared parent-domain cookie is impossible. Instead PM mints a one-time nonce
 * that the CMS exchanges (server-to-server) for a valid session id, then the CMS
 * sets its OWN `bizbee_session` cookie on its own host. The session id is never
 * placed in a URL; only the opaque single-use nonce travels in the redirect.
 *
 * Pure helpers only here (no CF/KV/React) so `node --test` loads it directly.
 */

export const SSO_NONCE_PREFIX = "sso:";
/** Nonces are short-lived — just long enough for the browser round-trip. */
export const SSO_NONCE_TTL_SECONDS = 60;

/**
 * Our Cloudflare account's workers.dev subdomain. CMS Workers live at
 * `bizbeecms-cms-<slug>.<this>`. The allowlist MUST anchor to this, NOT to the
 * bare `.workers.dev` public suffix — otherwise ANY account's worker named
 * `bizbeecms-cms-*` (e.g. on an attacker's account) would pass, letting them
 * capture the one-time SSO nonce via the redirect. Mirrors the router's
 * WORKERS_SUBDOMAIN.
 */
export const CMS_WORKER_SUFFIX = ".vali-draganescu88.workers.dev";

/** A random, URL-safe one-time nonce. */
export function newSsoNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Parse + first-pass open-redirect guard for the `return` URL the CMS asks PM to
 * bounce back to. Allows the per-Site CMS hosts known statically: https + host is
 * a `bizbeecms-cms-*` worker under `.workers.dev`, OR any host under our real
 * `.bizbeecms.com` zone. Returns:
 *   - { url } when the host is statically allowed,
 *   - { host } when the URL is well-formed + https but the host is unknown
 *     (a possible CUSTOM customer domain — caller verifies it against HOST_MAP),
 *   - null when malformed or not https (never a valid return).
 */
export function classifyCmsReturnUrl(
  raw: string | null,
): { url: string } | { host: string } | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname;
  const isCmsWorker =
    host.startsWith("bizbeecms-cms-") && host.endsWith(CMS_WORKER_SUFFIX);
  const isOwnZone = host === "bizbeecms.com" || host.endsWith(".bizbeecms.com");
  if (isCmsWorker || isOwnZone) return { url: u.toString() };
  return { host };
}

/**
 * Synchronous guard for the statically-known CMS hosts only. Returns the URL when
 * allowed, else null. (Custom domains need the async HOST_MAP check in the route.)
 */
export function safeCmsReturnUrl(raw: string | null): string | null {
  const c = classifyCmsReturnUrl(raw);
  return c && "url" in c ? c.url : null;
}

/**
 * Sanitize a post-login `next` path. Only same-origin relative paths are allowed
 * (must start with a single `/`, not `//` which is protocol-relative to another
 * host). Anything else → "/" (the default landing). Prevents open redirect after
 * sign-in while still letting the CMS SSO bounce-back through `/login` work.
 */
export function safeNextPath(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

/** Append the single-use nonce to the validated return URL as `?sso=`. */
export function appendNonce(returnUrl: string, nonce: string): string {
  const u = new URL(returnUrl);
  u.searchParams.set("sso", nonce);
  return u.toString();
}
