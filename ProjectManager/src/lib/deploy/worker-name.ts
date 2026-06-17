/**
 * Pure helpers for deriving the per-Site Cloudflare Worker name. Kept separate
 * from the API client (which is server-only) so any layer can compute / display
 * the target Worker name without pulling the Cloudflare client or drizzle.
 *
 * A Site is deployed as its OWN Worker; the name must be a valid Cloudflare
 * Worker (script) name: lowercase letters, digits and hyphens, 1..63 chars,
 * not starting/ending with a hyphen. We derive it from the Site slug (already
 * validated as a slug) under a stable prefix so all CMS Workers are grouped and
 * collision-resistant across Sites.
 */

/** Prefix every per-Site CMS Worker shares. */
export const CMS_WORKER_PREFIX = "bizbeecms-cms";

/** Max length Cloudflare allows for a Worker (script) name. */
export const MAX_WORKER_NAME_LEN = 63;

/**
 * Derive the Worker name for a Site from its slug. Assumes `slug` is a valid
 * slug (lowercase, hyphen-separated) — see lib/site/slug.ts. The result is
 * clamped to Cloudflare's length limit and stripped of any trailing hyphen the
 * clamp may have produced.
 */
export function workerNameForSlug(slug: string): string {
  const base = `${CMS_WORKER_PREFIX}-${slug}`;
  const clamped = base.slice(0, MAX_WORKER_NAME_LEN);
  // A mid-slug clamp could leave a trailing hyphen, which is invalid.
  return clamped.replace(/-+$/, "");
}

/** Validate a string as a Cloudflare Worker (script) name. */
export function isValidWorkerName(name: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(name);
}
