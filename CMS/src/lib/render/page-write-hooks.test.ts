/**
 * page-write-hooks — pure purge decision for AI live-write coherence.
 * Dep-free node --test (project convention).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { purgeTagsForPageWrite } from "./page-write-hooks.ts";
import { pageCacheTag } from "./edge-cache.ts";

test("a CREATE has nothing cached yet → no purge", () => {
  assert.deepEqual(purgeTagsForPageWrite("created", "p1"), []);
});

test("an UPDATE purges the page's per-page tag", () => {
  assert.deepEqual(purgeTagsForPageWrite("updated", "p2"), [pageCacheTag("p2")]);
});

test("a translate (always an existing page) purges the per-page tag", () => {
  assert.deepEqual(purgeTagsForPageWrite("translated", "p3"), [pageCacheTag("p3")]);
});
