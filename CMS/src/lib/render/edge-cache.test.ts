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
  STALE_WHILE_REVALIDATE,
} from "./edge-cache.ts";
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
