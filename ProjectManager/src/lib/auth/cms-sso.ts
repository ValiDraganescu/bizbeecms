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
import {
  CMS_WORKER_PREFIX,
  WORKERS_DEV_SUFFIX,
  ZONE_DOMAIN,
} from "../config/hosts.ts";

export const SSO_NONCE_PREFIX = "sso:";
/** Nonces are short-lived — just long enough for the browser round-trip. */
export const SSO_NONCE_TTL_SECONDS = 60;

/** A random, URL-safe one-time nonce. */
export function newSsoNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Is `host` exactly one of our per-Site CMS workers? Anchored to our account
 * suffix AND label count: a CMS host is `bizbeecms-cms-<slug>.<account>.workers.dev`
 * — exactly 4 labels. The label check rejects sub-subdomain squatting such as
 * `bizbeecms-cms-x.evil.vali-draganescu88.workers.dev`, which `endsWith` alone
 * would let through. (Anchoring to our suffix, NOT the bare `.workers.dev` public
 * suffix, is what stops an attacker's worker named `bizbeecms-cms-*` from
 * capturing the one-time SSO nonce via the redirect.)
 */
function isOwnCmsWorker(host: string): boolean {
  return (
    host.startsWith(CMS_WORKER_PREFIX) &&
    host.endsWith(WORKERS_DEV_SUFFIX) &&
    host.split(".").length === 4
  );
}

/**
 * Parse + first-pass open-redirect guard for the `return` URL the CMS asks PM to
 * bounce back to. Allows the per-Site CMS hosts known statically: https + host is
 * a `bizbeecms-cms-*` worker on OUR account, OR any host under our real
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
  const isOwnZone = host === ZONE_DOMAIN || host.endsWith(`.${ZONE_DOMAIN}`);
  if (isOwnCmsWorker(host) || isOwnZone) return { url: u.toString() };
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

const NEXT_SENTINEL_ORIGIN = "https://pm.local";
// Control chars (CR/LF/tab/etc.) are stripped during URL parsing, so they can
// smuggle a different target past a naive prefix check. Reject any up front.
const CONTROL_CHARS = /[\u0000-\u001f]/;

/**
 * Sanitize a post-login `next` path. Only same-origin relative paths are allowed;
 * anything else → "/" (the default landing). A bare prefix check on "/" is NOT
 * enough — browsers normalize backslashes to slashes ("/\evil.com" becomes
 * protocol-relative), encoded slashes ("/%2f", "/%5c") do the same, and control
 * chars get stripped. We reject those forms, then resolve against a sentinel
 * origin and require the result to stay on it.
 */
export function safeNextPath(raw: string | null): string {
  if (!raw) return "/";
  const lower = raw.toLowerCase();
  if (
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.startsWith("/\\") ||
    lower.startsWith("/%2f") ||
    lower.startsWith("/%5c") ||
    CONTROL_CHARS.test(raw)
  ) {
    return "/";
  }
  try {
    const u = new URL(raw, NEXT_SENTINEL_ORIGIN);
    if (u.origin !== NEXT_SENTINEL_ORIGIN) return "/";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/";
  }
}

/** Append the single-use nonce to the validated return URL as `?sso=`. */
export function appendNonce(returnUrl: string, nonce: string): string {
  const u = new URL(returnUrl);
  u.searchParams.set("sso", nonce);
  return u.toString();
}
