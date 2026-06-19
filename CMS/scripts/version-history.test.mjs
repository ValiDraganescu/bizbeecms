/**
 * PAGE VERSIONING slice 4 — pure history selection/sort tests (node --test).
 * Imports the REAL .ts (node strips types; `@/` won't resolve, so relative).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { buildHistory } from "../src/lib/pages/version-history.ts";

function ver(id, status, versionNo, createdAt) {
  return { id, pageId: "p", blocks: "[]", meta: "{}", status, versionNo, createdAt };
}

test("buildHistory keeps only published versions, newest version_no first", () => {
  const versions = [
    ver("d2", "draft", 0, 500),
    ver("p1", "published", 1, 100),
    ver("d1", "draft", 0, 50),
    ver("p2", "published", 2, 300),
  ];
  const h = buildHistory(versions, "p2");
  assert.deepEqual(
    h.map((e) => e.versionNo),
    [2, 1],
  );
  assert.equal(h.length, 2, "drafts excluded");
});

test("buildHistory flags the current published pointer", () => {
  const versions = [ver("p1", "published", 1, 100), ver("p2", "published", 2, 300)];
  const h = buildHistory(versions, "p1");
  assert.equal(h.find((e) => e.id === "p1").isCurrent, true);
  assert.equal(h.find((e) => e.id === "p2").isCurrent, false);
});

test("buildHistory with no published pointer flags nothing current", () => {
  const versions = [ver("p1", "published", 1, 100)];
  const h = buildHistory(versions, null);
  assert.equal(h.every((e) => !e.isCurrent), true);
});

test("buildHistory on a page with only a draft returns empty", () => {
  assert.deepEqual(buildHistory([ver("d1", "draft", 0, 1)], null), []);
});
