/**
 * Node test for filterGroups (page-builder Components rail search).
 * Run: node --test rail-filter.test.ts
 * (node can't resolve `@/` — import the helper via relative `.ts`.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { filterGroups } from "./rail-filter.ts";
import type { ComponentGroup } from "./grouped.ts";

const GROUPS: ComponentGroup[] = [
  { kit: "blog", components: ["PostCard", "PostList"] },
  { kit: "landing", components: ["Hero", "CallToAction"] },
  { kit: null, components: ["MyCustomThing"] },
];

test("empty query returns groups unchanged", () => {
  assert.deepEqual(filterGroups(GROUPS, ""), GROUPS);
  assert.deepEqual(filterGroups(GROUPS, "   "), GROUPS);
});

test("filters component names case-insensitively across groups", () => {
  const r = filterGroups(GROUPS, "post");
  assert.equal(r.length, 1);
  assert.equal(r[0].kit, "blog");
  assert.deepEqual(r[0].components, ["PostCard", "PostList"]);
});

test("drops groups with no matching component", () => {
  const r = filterGroups(GROUPS, "hero");
  assert.equal(r.length, 1);
  assert.equal(r[0].kit, "landing");
  assert.deepEqual(r[0].components, ["Hero"]);
});

test("matches the ungrouped (null) group too", () => {
  const r = filterGroups(GROUPS, "custom");
  assert.equal(r.length, 1);
  assert.equal(r[0].kit, null);
  assert.deepEqual(r[0].components, ["MyCustomThing"]);
});

test("no match yields empty array", () => {
  assert.deepEqual(filterGroups(GROUPS, "zzz"), []);
});
