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

/**
 * Request header the worker injects with the incoming pathname so the branded
 * 404 (`not-found.tsx`, which Next gives no params/pathname) can render in the
 * VISITOR's URL locale (`/fi/missing` → 404 in fi). A 404 is never edge-cached
 * (the worker gate is GET-200-only), so this request header can never poison a
 * cached published page — the one place it's safe to read a request path.
 */
export const REQUEST_PATH_HEADER = "x-bizbee-path";

/** Cache-Tag shared by ALL published pages — global-blast writes purge this. */
export const PAGES_CACHE_TAG = "pages";

/**
 * Cache-Tag for the single `/llms.txt` file. It's a curated index of EVERY
 * published page (+ brand identity + the operator template), so its content
 * changes on any page publish/unpublish/delete/rename, a brand-identity save,
 * and an llms-template save — every one of those purge sites also purges THIS
 * tag. Its own tag (not `pages`) because a per-page purge (`page:<id>`) can't
 * clear a global file, and blasting `pages` on every llms-only change would
 * needlessly re-render every cached page.
 *
 * `/llms.txt` is dot-gated out of `isEdgeCacheCandidate` (like sitemap/robots);
 * worker.ts opts it back in with an EXPLICIT carve-out that stamps exactly this
 * tag — never a general loosening of the dot gate (which would reopen the
 * wildcard-page cache-stamping hole).
 */
export const LLMS_CACHE_TAG = "llms";

/**
 * The `/llms.txt` edge-cache carve-out: exactly the dotted-root path `/llms.txt`
 * (and its locale-prefixed forms are N/A — llms.txt is a single default-locale
 * file at the root). Returns the headers to stamp, or null for anything else.
 * Deliberately a FIXED single-path match, NOT a loosening of the dot gate — a
 * top-level wildcard page can never match `/llms.txt` here, so it can't get a
 * page's Cache-Tag stamped on the file (the sitemap-staleness precedent).
 */
export function llmsTxtCacheHeaders(
  pathname: string,
): { cacheControl: string; cacheTag: string } | null {
  if (pathname !== "/llms.txt") return null;
  return {
    cacheControl: `public, max-age=${LLMS_MAX_AGE}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
    cacheTag: LLMS_CACHE_TAG,
  };
}

/** llms.txt fresh window (seconds). Purge covers correctness; this bounds drift. */
export const LLMS_MAX_AGE = 3600;

/**
 * Cache-Tag for the single `/sitemap.xml` file. Its content is EVERY published
 * page's URL × content-locale + per-page lastmod, so it changes on any page
 * publish/unpublish/delete/slug-rename/noindex-flip — every page-write purge
 * site also purges THIS tag. Its own tag (NOT `pages`) because a per-page purge
 * (`page:<id>`) can't clear a global file, and blasting `pages` on every write
 * would needlessly re-render every cached page. Brand-identity and the llms
 * template are NOT sitemap content — those purge sites do NOT touch this tag.
 *
 * `/sitemap.xml` is dot-gated out of `isEdgeCacheCandidate` (like llms/robots);
 * worker.ts opts it back in with an EXPLICIT carve-out stamping exactly this tag
 * — never a general loosening of the dot gate (mirrors the /llms.txt precedent).
 */
export const SITEMAP_CACHE_TAG = "sitemap";

/** sitemap.xml fresh window (seconds). Purge covers correctness; bounds drift. */
export const SITEMAP_MAX_AGE = 3600;

/**
 * The `/sitemap.xml` edge-cache carve-out: exactly the dotted-root path
 * `/sitemap.xml`. Returns the headers to stamp, or null for anything else.
 * A FIXED single-path match, NOT a loosening of the dot gate — a top-level
 * wildcard page can never match `/sitemap.xml`, so it can't get a page's
 * Cache-Tag stamped on the file (the sitemap-staleness precedent this fixes).
 */
export function sitemapXmlCacheHeaders(
  pathname: string,
): { cacheControl: string; cacheTag: string } | null {
  if (pathname !== "/sitemap.xml") return null;
  return {
    cacheControl: `public, max-age=${SITEMAP_MAX_AGE}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
    cacheTag: SITEMAP_CACHE_TAG,
  };
}

/** The per-page Cache-Tag (`page:<id>`) — publish/unpublish/delete purge it. */
export function pageCacheTag(pageId: string): string {
  return `page:${pageId}`;
}

/** Markdown page-variant (`/api/md/…`) fresh window (seconds). */
export const MD_MAX_AGE = 3600;

/**
 * Edge-cache headers for a `/<path>.md` page variant, stamped by the `/api/md`
 * route ITSELF (not worker.ts): the worker rewrites `/<path>.md` → `/api/md/…`
 * and returns that response untouched, so the route is the only place to opt in.
 * Tagged with the page's OWN `page:<id>` tag (NOT `pages`) so every existing
 * page-write purge (publish/unpublish/rename/delete/noindex — all purge
 * `pageCacheTag(id)`) already clears the cached `.md` too. Because the route
 * lives under `/api` (SKIP_SEGMENTS), no wildcard page's tag can ever be stamped
 * on it — the sitemap-staleness precedent is sidestepped structurally.
 */
export function mdVariantCacheHeaders(
  pageId: string,
): { cacheControl: string; cacheTag: string } {
  return {
    cacheControl: `public, max-age=${MD_MAX_AGE}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
    cacheTag: pageCacheTag(pageId),
  };
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
 *
 * Dotted ROOT files (/sitemap.xml, /robots.txt, /llms.txt, /favicon.ico, the
 * IndexNow /<key>.txt) are also rejected: SLUG_RE forbids "." so no real page
 * lives at a dotted single-segment URL — but a TOP-LEVEL wildcard page
 * (":param" matches ANY segment) would make worker.ts resolve one and stamp
 * that page's Cache-Control onto e.g. the sitemap XML, edge-caching a stale
 * sitemap that no page-publish purge clears (seo-robots audit, 2026-07-07).
 * Root-level only: deeper dotted segments can be legit wildcard-captured page
 * URLs and stay cacheable.
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
  const segments = pathnameSegments(input.pathname);
  const first = segments[0]?.trim().toLowerCase() ?? "";
  if (SKIP_SEGMENTS.has(first)) return false;
  if (segments.length === 1 && first.includes(".")) return false;
  return true;
}

/**
 * Markdown page-variant rewrite (seo-robots): a public GET for `/<path>.md`
 * (any depth) is served by the INTERNAL `/api/md/<path>` route — the plan build
 * + serialize can't run in the lean worker, and the `(site)` optional catch-all
 * shadows every non-`/api` sibling route. Given a full request URL, returns the
 * rewritten URL (query preserved) when it's a `.md` variant, else null.
 *
 * Only rewrites a REAL page path: never `/sitemap.xml`, never a system prefix
 * (`api`/`media`/`admin`/`preview`/`_next`), never a bare `/.md`. The suffix
 * match is case-insensitive on the LAST segment; the target keeps the `.md`
 * (the internal route peels it defensively) so `/api/md` never collides with a
 * real slug called "md".
 */
export function markdownVariantRewrite(requestUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  const segments = pathnameSegments(url.pathname);
  if (segments.length === 0) return null;
  const first = segments[0].trim().toLowerCase();
  if (SKIP_SEGMENTS.has(first)) return null;
  const last = segments[segments.length - 1];
  if (!last.toLowerCase().endsWith(".md")) return null;
  if (last.length <= 3) return null; // bare ".md" — not a variant
  const target = new URL(url.toString());
  target.pathname = "/api/md/" + segments.map((s) => encodeURIComponent(s)).join("/");
  return target.toString();
}

/**
 * Is this a rewritable HTML document response? Gates the worker's `<html lang>`
 * correction (the root layout stamps the visitor's ADMIN-UI locale — a
 * cookie/Accept-Language value that would poison cached published HTML and
 * mislabel content for SEO; the worker rewrites it to the URL's content
 * locale). RSC flight responses (`text/x-component`), JSON, etc. must pass
 * through untouched.
 */
export function isHtmlContentType(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().toLowerCase().startsWith("text/html");
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
