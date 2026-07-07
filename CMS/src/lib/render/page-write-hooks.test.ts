/**
 * page-write-hooks — pure purge decision for AI live-write coherence.
 * Dep-free node --test (project convention).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { purgeTagsForPageWrite } from "./page-write-hooks.ts";
import { pageCacheTag, LLMS_CACHE_TAG, SITEMAP_CACHE_TAG } from "./edge-cache.ts";

test("a CREATE has no page-cache yet but still purges /llms.txt + /sitemap.xml (it adds a page)", () => {
  assert.deepEqual(purgeTagsForPageWrite("created", "p1"), [
    LLMS_CACHE_TAG,
    SITEMAP_CACHE_TAG,
  ]);
});

test("an UPDATE purges the page's per-page tag AND /llms.txt + /sitemap.xml", () => {
  assert.deepEqual(purgeTagsForPageWrite("updated", "p2"), [
    pageCacheTag("p2"),
    LLMS_CACHE_TAG,
    SITEMAP_CACHE_TAG,
  ]);
});

test("a translate (always an existing page) purges the per-page tag AND /llms.txt + /sitemap.xml", () => {
  assert.deepEqual(purgeTagsForPageWrite("translated", "p3"), [
    pageCacheTag("p3"),
    LLMS_CACHE_TAG,
    SITEMAP_CACHE_TAG,
  ]);
});
