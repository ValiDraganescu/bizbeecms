/**
 * edge-cache — header decisions for the custom worker entrypoint.
 * Dep-free node --test (project convention).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  pathnameSegments,
  isEdgeCacheCandidate,
  edgeCacheHeaders,
  pageCacheTag,
  purgeCacheTags,
  isHtmlContentType,
  STALE_WHILE_REVALIDATE,
  markdownVariantRewrite,
  llmsTxtCacheHeaders,
  LLMS_CACHE_TAG,
  LLMS_MAX_AGE,
  sitemapXmlCacheHeaders,
  SITEMAP_CACHE_TAG,
  SITEMAP_MAX_AGE,
  mdVariantCacheHeaders,
  MD_MAX_AGE,
  REQUEST_PATH_HEADER,
} from "./edge-cache.ts";
import { peelLocaleSegment } from "./slug.ts";
import { SKIP_SEGMENTS } from "./localize-links.ts";

// ── pathnameSegments ─────────────────────────────────────────────────────────

test("splits and decodes a pathname like Next's params.slug", () => {
  assert.deepEqual(pathnameSegments("/"), []);
  assert.deepEqual(pathnameSegments("/about"), ["about"]);
  assert.deepEqual(pathnameSegments("/fi/blog/hello"), ["fi", "blog", "hello"]);
  assert.deepEqual(pathnameSegments("/caf%C3%A9"), ["café"]);
  assert.deepEqual(pathnameSegments("//double//slash/"), ["double", "slash"]);
});

test("undecodable segments pass through raw instead of throwing", () => {
  assert.deepEqual(pathnameSegments("/bad%zz"), ["bad%zz"]);
});

// ── isEdgeCacheCandidate ─────────────────────────────────────────────────────

const OK = { method: "GET", pathname: "/about", status: 200, hasSetCookie: false };

test("a GET 200 page path without Set-Cookie is a candidate", () => {
  assert.equal(isEdgeCacheCandidate(OK), true);
  assert.equal(isEdgeCacheCandidate({ ...OK, pathname: "/" }), true);
  assert.equal(isEdgeCacheCandidate({ ...OK, pathname: "/fi/blog/hello" }), true);
});

test("non-GET, non-200, and Set-Cookie responses are rejected", () => {
  assert.equal(isEdgeCacheCandidate({ ...OK, method: "POST" }), false);
  assert.equal(isEdgeCacheCandidate({ ...OK, method: "HEAD" }), false);
  assert.equal(isEdgeCacheCandidate({ ...OK, status: 404 }), false);
  assert.equal(isEdgeCacheCandidate({ ...OK, status: 308 }), false);
  assert.equal(isEdgeCacheCandidate({ ...OK, hasSetCookie: true }), false);
});

test("every SKIP_SEGMENT system path is rejected (list shared with localize-links)", () => {
  for (const seg of SKIP_SEGMENTS) {
    assert.equal(
      isEdgeCacheCandidate({ ...OK, pathname: `/${seg}/x` }),
      false,
      `expected /${seg}/x to be excluded`,
    );
  }
  // Case/encoding-insensitive, like localize-links' firstSegment.
  assert.equal(isEdgeCacheCandidate({ ...OK, pathname: "/Admin/pages" }), false);
  assert.equal(isEdgeCacheCandidate({ ...OK, pathname: "/%61dmin" }), false);
});

test("a page slug merely CONTAINING a system word is still a candidate", () => {
  assert.equal(isEdgeCacheCandidate({ ...OK, pathname: "/mediakit" }), true);
  assert.equal(isEdgeCacheCandidate({ ...OK, pathname: "/blog/api" }), true);
});

// ── reserved root files (sitemap.xml, robots.txt, …) ─────────────────────────
// seo-robots audit finding: /sitemap.xml passed the gate, and a TOP-LEVEL
// wildcard page (":param" matches ANY segment) with cache_max_age > 0 made
// worker.ts stamp THAT page's Cache-Control/Cache-Tag onto the sitemap XML
// response — an edge-cached stale sitemap that no page-publish purge clears
// (publish purges page:<publishedId>, not the wildcard's tag). SLUG_RE forbids
// "." in slugs, so a dotted SINGLE-segment path can never be a real page URL —
// reject them all (also future-proofs robots.txt, llms.txt, /<indexnow-key>.txt).

test("dotted root files are never cache candidates (stale-sitemap regression)", () => {
  assert.equal(isEdgeCacheCandidate({ ...OK, pathname: "/sitemap.xml" }), false);
  assert.equal(isEdgeCacheCandidate({ ...OK, pathname: "/robots.txt" }), false);
  assert.equal(isEdgeCacheCandidate({ ...OK, pathname: "/llms.txt" }), false);
  assert.equal(isEdgeCacheCandidate({ ...OK, pathname: "/favicon.ico" }), false);
  assert.equal(isEdgeCacheCandidate({ ...OK, pathname: "/a1b2c3.txt" }), false); // IndexNow key file
});

test("dot exclusion is root-files only — deeper wildcard-captured paths stay cacheable", () => {
  // /fi/sitemap.xml is NOT the metadata route (only /sitemap.xml is) — if a
  // wildcard page answers it, that's a real page render and may cache.
  assert.equal(isEdgeCacheCandidate({ ...OK, pathname: "/fi/sitemap.xml" }), true);
  assert.equal(isEdgeCacheCandidate({ ...OK, pathname: "/products/v2.0" }), true);
});

// ── query strings ────────────────────────────────────────────────────────────
// Workers Cache keys by the FULL URL incl. the query string (CAVEATS), so a
// `?utm=` variant caches SEPARATELY and never cross-serves another page's HTML.
// The gate must decide identically regardless of the query — worker.ts feeds it
// `new URL(url).pathname` (query already stripped), so a query can never leak
// into `pathname`/segments nor flip the skip decision. Fence both facts.

test("pathnameSegments never contains the query string (worker.ts strips it via URL.pathname)", () => {
  // worker.ts always passes new URL(url).pathname — the query is already gone.
  const pathname = new URL("https://x.tld/about?utm=nl&ref=twitter").pathname;
  assert.equal(pathname, "/about");
  assert.deepEqual(pathnameSegments(pathname), ["about"]);
  // Defense in depth: even a raw `?` in a segment doesn't spawn a fake segment.
  assert.deepEqual(pathnameSegments("/about?utm=nl"), ["about?utm=nl"]);
});

test("the cache decision is identical with or without a query string", () => {
  // Same pathname → same verdict; the query is not part of the candidate input.
  assert.equal(
    isEdgeCacheCandidate({ ...OK, pathname: new URL("https://x.tld/about?utm=nl").pathname }),
    isEdgeCacheCandidate({ ...OK, pathname: "/about" }),
  );
  // A system path stays excluded regardless of its query.
  assert.equal(
    isEdgeCacheCandidate({ ...OK, pathname: new URL("https://x.tld/api/x?y=1").pathname }),
    false,
  );
});

// ── edgeCacheHeaders ─────────────────────────────────────────────────────────

test("opted-in page gets public max-age + SWR and the pages,page:<id> tags", () => {
  const h = edgeCacheHeaders(3600, "p-1");
  assert.deepEqual(h, {
    cacheControl: `public, max-age=3600, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
    cacheTag: "pages,page:p-1",
  });
  assert.equal(pageCacheTag("p-1"), "page:p-1");
});

// ── purgeCacheTags ───────────────────────────────────────────────────────────

test("purgeCacheTags calls purge with the tags and reports success", async () => {
  const calls: string[][] = [];
  const cache = { purge: (o: { tags: string[] }) => void calls.push(o.tags) };
  assert.equal(await purgeCacheTags(cache, ["pages", "page:p-1"]), true);
  assert.deepEqual(calls, [["pages", "page:p-1"]]);
});

test("purgeCacheTags is best-effort: every failure mode returns false, never throws", async () => {
  assert.equal(await purgeCacheTags(undefined, ["pages"]), false); // no ctx.cache (local dev)
  assert.equal(await purgeCacheTags(null, ["pages"]), false);
  assert.equal(await purgeCacheTags({}, ["pages"]), false); // cache without purge
  assert.equal(
    await purgeCacheTags({ purge: () => { throw new Error("boom"); } }, ["pages"]),
    false,
  );
  assert.equal(
    await purgeCacheTags({ purge: () => Promise.reject(new Error("boom")) }, ["pages"]),
    false,
  );
  assert.equal(await purgeCacheTags({ purge: () => {} }, []), false); // nothing to purge
});

test("cache_max_age 0 (the default) and invalid values yield null (never cache)", () => {
  assert.equal(edgeCacheHeaders(0, "p-1"), null);
  assert.equal(edgeCacheHeaders(-300, "p-1"), null);
  assert.equal(edgeCacheHeaders(NaN, "p-1"), null);
  assert.equal(edgeCacheHeaders(300.5, "p-1"), null);
});

// ── isHtmlContentType (gates the worker's <html lang> rewrite) ──────────────

test("HTML documents (with charset/case/whitespace variants) are rewritable", () => {
  assert.equal(isHtmlContentType("text/html"), true);
  assert.equal(isHtmlContentType("text/html; charset=utf-8"), true);
  assert.equal(isHtmlContentType("  Text/HTML; charset=UTF-8"), true);
});

test("non-document responses pass through untouched (RSC flight, JSON, absent)", () => {
  assert.equal(isHtmlContentType("text/x-component"), false); // RSC flight payload
  assert.equal(isHtmlContentType("application/json"), false);
  assert.equal(isHtmlContentType("text/plain"), false);
  assert.equal(isHtmlContentType(""), false);
  assert.equal(isHtmlContentType(null), false);
  assert.equal(isHtmlContentType(undefined), false);
});

// ── markdownVariantRewrite (seo-robots .md page variants) ────────────────────

test("rewrites a .md page path to the internal /api/md route", () => {
  assert.equal(
    markdownVariantRewrite("https://x.com/about.md"),
    "https://x.com/api/md/about.md",
  );
  assert.equal(
    markdownVariantRewrite("https://x.com/blog/hello.md?ref=1"),
    "https://x.com/api/md/blog/hello.md?ref=1",
  );
});

test("locale-prefixed .md variants rewrite (locale peeled by the internal route)", () => {
  assert.equal(
    markdownVariantRewrite("https://x.com/fi/tietoa.md"),
    "https://x.com/api/md/fi/tietoa.md",
  );
});

test("non-.md paths are not rewritten", () => {
  assert.equal(markdownVariantRewrite("https://x.com/about"), null);
  assert.equal(markdownVariantRewrite("https://x.com/"), null);
  assert.equal(markdownVariantRewrite("https://x.com/blog/hello"), null);
});

test("system-prefixed and dotted-root paths are never rewritten", () => {
  assert.equal(markdownVariantRewrite("https://x.com/api/md/about.md"), null);
  assert.equal(markdownVariantRewrite("https://x.com/media/x.md"), null);
  assert.equal(markdownVariantRewrite("https://x.com/admin/x.md"), null);
  assert.equal(markdownVariantRewrite("https://x.com/sitemap.xml"), null);
  assert.equal(markdownVariantRewrite("https://x.com/.md"), null);
});

test("case-insensitive suffix; query preserved", () => {
  assert.equal(
    markdownVariantRewrite("https://x.com/About.MD?a=1&b=2"),
    "https://x.com/api/md/About.MD?a=1&b=2",
  );
});

test("garbage input returns null (best-effort)", () => {
  assert.equal(markdownVariantRewrite("not a url"), null);
});

test("/llms.txt gets an explicit cache carve-out with its OWN tag", () => {
  const h = llmsTxtCacheHeaders("/llms.txt");
  assert.ok(h);
  assert.equal(h.cacheTag, LLMS_CACHE_TAG);
  assert.equal(
    h.cacheControl,
    `public, max-age=${LLMS_MAX_AGE}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
  );
});

test("the /llms.txt carve-out is a FIXED single path — nothing else opts in", () => {
  // Crucially NOT a dot-gate loosening: a top-level wildcard-like path that a
  // page could occupy must never match, or it'd get the llms tag stamped on it.
  for (const p of [
    "/robots.txt",
    "/sitemap.xml",
    "/llms.txt/",
    "/fi/llms.txt",
    "/anything.txt",
    "/llms.txt.md",
    "/",
    "/about",
  ]) {
    assert.equal(llmsTxtCacheHeaders(p), null, p);
  }
});

test("/sitemap.xml gets an explicit cache carve-out with its OWN tag", () => {
  const h = sitemapXmlCacheHeaders("/sitemap.xml");
  assert.ok(h);
  assert.equal(h.cacheTag, SITEMAP_CACHE_TAG);
  assert.notEqual(SITEMAP_CACHE_TAG, LLMS_CACHE_TAG); // distinct tags
  assert.equal(
    h.cacheControl,
    `public, max-age=${SITEMAP_MAX_AGE}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
  );
});

test("the /sitemap.xml carve-out is a FIXED single path — nothing else opts in", () => {
  // Same reasoning as the llms carve-out: NOT a dot-gate loosening, so a
  // top-level wildcard-like path a page could occupy must never match.
  for (const p of [
    "/robots.txt",
    "/llms.txt",
    "/sitemap.xml/",
    "/fi/sitemap.xml",
    "/sitemap-index.xml",
    "/anything.xml",
    "/",
    "/about",
  ]) {
    assert.equal(sitemapXmlCacheHeaders(p), null, p);
  }
});

// ── mdVariantCacheHeaders (.md page variants) ────────────────────────────────

test(".md variant gets public max-age + SWR tagged with the page's OWN tag", () => {
  const h = mdVariantCacheHeaders("p-42");
  // OWN page tag (not `pages`) so existing per-page purges cover it, and no
  // wildcard-page tag can ever land here (route is under /api → SKIP_SEGMENTS).
  assert.equal(h.cacheTag, pageCacheTag("p-42"));
  assert.equal(
    h.cacheControl,
    `public, max-age=${MD_MAX_AGE}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
  );
});

test(".md variant tag matches the tag the page-write purges already clear", () => {
  // Regression: publish/unpublish/rename/delete/noindex all purge pageCacheTag(id);
  // the cached .md must carry EXACTLY that tag or those purges miss it.
  assert.equal(mdVariantCacheHeaders("abc").cacheTag, pageCacheTag("abc"));
});

// ── branded 404 URL-locale (REQUEST_PATH_HEADER) ─────────────────────────────
// The worker injects the incoming pathname under REQUEST_PATH_HEADER; not-found.tsx
// peels the content locale from it via pathnameSegments + peelLocaleSegment. These
// pin the exact composition those two files depend on (real peel is D1-bound).

const LOCALES = ["en", "fi", "et"];
const peelPath = (p: string | null) =>
  peelLocaleSegment(pathnameSegments(p ?? ""), LOCALES, "en").locale;

test("REQUEST_PATH_HEADER is a fixed lowercase custom header", () => {
  assert.equal(REQUEST_PATH_HEADER, "x-bizbee-path");
  assert.equal(REQUEST_PATH_HEADER, REQUEST_PATH_HEADER.toLowerCase());
});

test("branded 404 renders in the visitor's URL locale (/fi/missing → fi)", () => {
  assert.equal(peelPath("/fi/missing"), "fi");
  assert.equal(peelPath("/et/no/such/page"), "et");
});

test("branded 404 falls back to site default for default-locale & absent paths", () => {
  assert.equal(peelPath("/missing"), "en"); // default locale, no prefix
  assert.equal(peelPath("/en/missing"), "en"); // explicit default prefix
  assert.equal(peelPath("/"), "en"); // root
  assert.equal(peelPath(""), "en"); // header absent (pre-release worker)
  assert.equal(peelPath(null), "en");
});
