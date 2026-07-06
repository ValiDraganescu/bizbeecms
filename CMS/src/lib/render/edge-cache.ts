/**
 * Edge-cache header decisions for the custom worker entrypoint (`CMS/worker.ts`).
 *
 * Workers Cache (wrangler.jsonc `"cache": {"enabled": true}`) caches responses
 * that carry a public `Cache-Control`. RSC pages can't set response headers, so
 * the worker wrapper stamps them AFTER the OpenNext handler runs — but only on
 * responses these pure helpers approve: GET 200 public-page paths without
 * Set-Cookie, for pages whose `cache_max_age` opt-in is > 0.
 *
 * PURE — no React/D1/CF imports; unit-tested with dep-free `node --test`.
 * The excluded-path list is `SKIP_SEGMENTS` from localize-links (single source,
 * per CAVEATS: the two lists must never drift).
 */

import { SKIP_SEGMENTS } from "./localize-links.ts";

/** Serve-stale window (seconds) appended to every opted-in Cache-Control. */
export const STALE_WHILE_REVALIDATE = 86400;

/** Cache-Tag shared by ALL published pages — global-blast writes purge this. */
export const PAGES_CACHE_TAG = "pages";

/** The per-page Cache-Tag (`page:<id>`) — publish/unpublish/delete purge it. */
export function pageCacheTag(pageId: string): string {
  return `page:${pageId}`;
}

/**
 * URL pathname → decoded slug segments, the same shape Next hands the
 * `[[...slug]]` route as `params.slug` (undecodable segments pass through raw).
 */
export function pathnameSegments(pathname: string): string[] {
  return pathname
    .split("/")
    .filter((s) => s !== "")
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
}

/**
 * Is this request/response pair even a candidate for edge-cache stamping?
 * Gate BEFORE the D1 page lookup so excluded/system/error traffic costs
 * nothing extra. Rules: GET only (Workers Cache only caches GET/HEAD; Next
 * serves HEAD via GET anyway), 200 only (never cache 404s/redirects), no
 * Set-Cookie (a cookie-bearing response is per-visitor by definition — and
 * Workers Cache would refuse it regardless), and the first path segment must
 * not be a system route (media/api/admin/preview/_next).
 */
export function isEdgeCacheCandidate(input: {
  method: string;
  pathname: string;
  status: number;
  hasSetCookie: boolean;
}): boolean {
  if (input.method !== "GET") return false;
  if (input.status !== 200) return false;
  if (input.hasSetCookie) return false;
  const first = pathnameSegments(input.pathname)[0]?.trim().toLowerCase() ?? "";
  if (SKIP_SEGMENTS.has(first)) return false;
  return true;
}

/** Minimal shape of the Workers Cache handle (`ctx.cache`) that purge needs. */
export type TagPurger = {
  purge: (options: { tags: string[] }) => unknown;
};

/**
 * Best-effort tag purge: NEVER throws, never rejects. `cache` may be absent
 * (local dev, plain `next dev`) and `purge` may throw — a purge failure must
 * never fail the admin write that triggered it (goal requirement). Returns
 * whether the purge call completed, for tests/logging only.
 */
export async function purgeCacheTags(cache: unknown, tags: string[]): Promise<boolean> {
  if (tags.length === 0) return false;
  const purge = (cache as Partial<TagPurger> | null | undefined)?.purge;
  if (typeof purge !== "function") return false;
  try {
    await purge.call(cache, { tags });
    return true;
  } catch {
    return false;
  }
}

/**
 * The headers to stamp for an opted-in page, or null when the page's
 * `cache_max_age` is 0/invalid (0 = never cache, the column default).
 */
export function edgeCacheHeaders(
  cacheMaxAge: number,
  pageId: string,
): { cacheControl: string; cacheTag: string } | null {
  if (!Number.isInteger(cacheMaxAge) || cacheMaxAge <= 0) return null;
  return {
    cacheControl: `public, max-age=${cacheMaxAge}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
    cacheTag: `${PAGES_CACHE_TAG},${pageCacheTag(pageId)}`,
  };
}
