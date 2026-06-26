/**
 * component-kits hardening: the FOUNDATION tag helpers in lib/components/tags.ts
 * (normalizeTags / parseTags / serializeTags / distinctTags / filterByTag).
 *
 * normalizeTags is reused by every other tag helper (parse/serialize/distinct/
 * filter/applyBulkTag) AND is the trust boundary for tags arriving in an import
 * envelope, so its edge cases (untrusted non-string entries, over-long labels,
 * the count cap, case-insensitive dedupe, sorting) are the ones worth pinning.
 * applyBulkTag is covered by bulk-tag.test.mjs; this covers the rest.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTags,
  parseTags,
  serializeTags,
  distinctTags,
  filterByTag,
} from "../src/lib/components/tags.ts";

test("normalizeTags: trims, drops empties/whitespace, sorts", () => {
  assert.deepEqual(normalizeTags(["  blog ", "marketing", "", "   "]), ["blog", "marketing"]);
});

test("normalizeTags: case-insensitive dedupe keeps the FIRST spelling", () => {
  assert.deepEqual(normalizeTags(["Marketing", "marketing", "MARKETING"]), ["Marketing"]);
});

test("normalizeTags: untrusted non-string entries are ignored (import safety)", () => {
  // e.g. JSON.parse of a malicious envelope: ["ok", 1, null, {}, ["x"], true]
  assert.deepEqual(normalizeTags(["ok", 1, null, {}, ["x"], true]), ["ok"]);
});

test("normalizeTags: non-array input → []", () => {
  for (const bad of [null, undefined, "marketing", 42, {}]) {
    assert.deepEqual(normalizeTags(bad), []);
  }
});

test("normalizeTags: over-long tag (>40 chars) is dropped", () => {
  const ok = "a".repeat(40);
  const tooLong = "a".repeat(41);
  assert.deepEqual(normalizeTags([ok, tooLong]), [ok]);
});

test("normalizeTags: caps the count at 50 (sanity bound)", () => {
  const many = Array.from({ length: 60 }, (_, i) => `t${i}`);
  assert.equal(normalizeTags(many).length, 50);
});

test("parseTags: bad/empty JSON never throws → []", () => {
  assert.deepEqual(parseTags(null), []);
  assert.deepEqual(parseTags(undefined), []);
  assert.deepEqual(parseTags(""), []);
  assert.deepEqual(parseTags("not json"), []);
  assert.deepEqual(parseTags('{"not":"an array"}'), []);
});

test("parseTags ↔ serializeTags round-trips through the canonical form", () => {
  const raw = ["  Blog ", "blog", "marketing", 7];
  const json = serializeTags(raw);
  assert.equal(json, JSON.stringify(["Blog", "marketing"]));
  assert.deepEqual(parseTags(json), ["Blog", "marketing"]);
});

test("distinctTags: union across components, case-insensitive, sorted", () => {
  const comps = [
    { tags: ["marketing", "Blog"] },
    { tags: ["blog", "dark"] },
    { tags: undefined },
    { tags: "garbage" }, // non-array on one row is tolerated
  ];
  assert.deepEqual(distinctTags(comps), ["Blog", "dark", "marketing"]);
});

test("filterByTag: case-insensitive match; blank tag returns the list unchanged", () => {
  const comps = [
    { name: "Hero", tags: ["Marketing"] },
    { name: "Card", tags: ["blog"] },
    { name: "Footer", tags: [] },
  ];
  assert.deepEqual(filterByTag(comps, "marketing").map((c) => c.name), ["Hero"]);
  assert.equal(filterByTag(comps, "   "), comps); // same ref, no filter
  assert.deepEqual(filterByTag(comps, "nope"), []);
});
