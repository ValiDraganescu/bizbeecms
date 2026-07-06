/**
 * sitemap-paths — enumerate published page URLs for the public sitemap.
 * Dep-free node --test (project convention).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { publishedPagePaths, type SitemapPageRow } from "./sitemap-paths.ts";

function row(partial: Partial<SitemapPageRow> & { id: string; slug: string }): SitemapPageRow {
  return { parentPageId: null, publishStatus: "published", ...partial };
}

function segs(rows: SitemapPageRow[]): string[][] {
  return publishedPagePaths(rows).map((p) => p.segments);
}

test("published pages build their parent slug chain", () => {
  const rows = [
    row({ id: "1", slug: "blog" }),
    row({ id: "2", slug: "hello", parentPageId: "1" }),
  ];
  assert.deepEqual(segs(rows), [["blog"], ["blog", "hello"]]);
});

test("top-level HOME_SLUG page maps to the root []", () => {
  assert.deepEqual(segs([row({ id: "1", slug: "home" })]), [[]]);
  // a NESTED "home" is an ordinary slug
  assert.deepEqual(
    segs([row({ id: "1", slug: "docs" }), row({ id: "2", slug: "home", parentPageId: "1" })]),
    [["docs"], ["docs", "home"]],
  );
});

test("draft pages are excluded; published children of unpublished parents stay (leaf-only gate)", () => {
  const rows = [
    row({ id: "1", slug: "blog", publishStatus: "draft" }),
    row({ id: "2", slug: "hello", parentPageId: "1" }),
  ];
  assert.deepEqual(segs(rows), [["blog", "hello"]]);
});

test("wildcard :param chains have no enumerable URL", () => {
  const rows = [
    row({ id: "1", slug: ":city-slug" }),
    row({ id: "2", slug: "offers", parentPageId: "1" }),
    row({ id: "3", slug: "about" }),
  ];
  assert.deepEqual(segs(rows), [["about"]]);
});

test("dangling parent chains are skipped", () => {
  assert.deepEqual(segs([row({ id: "2", slug: "orphan", parentPageId: "gone" })]), []);
});

test("parent cycles do not loop forever", () => {
  const rows = [
    row({ id: "1", slug: "a", parentPageId: "2" }),
    row({ id: "2", slug: "b", parentPageId: "1" }),
  ];
  assert.deepEqual(segs(rows), []);
});

test("lastModified passes through from updatedAt", () => {
  const when = new Date("2026-07-07T00:00:00Z");
  const out = publishedPagePaths([row({ id: "1", slug: "about", updatedAt: when })]);
  assert.equal(out[0].lastModified, when);
  const bare = publishedPagePaths([row({ id: "1", slug: "about" })]);
  assert.equal(bare[0].lastModified, undefined);
});
