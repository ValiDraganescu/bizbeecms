/**
 * component-kits Slice 10: applyBulkTag (bulk add/remove a tag across N components).
 * Pure logic — only the components whose tag set actually changes come back, the
 * result is normalized, and the source list is untouched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyBulkTag } from "../src/lib/components/tags.ts";

const comps = [
  { name: "Hero", tags: ["marketing"] },
  { name: "Card", tags: ["marketing", "blog"] },
  { name: "Footer", tags: [] },
];

test("add: only components missing the tag change, result normalized + sorted", () => {
  const out = applyBulkTag(comps, "dark", "add");
  assert.equal(out.length, 3);
  assert.deepEqual(
    out.find((c) => c.name === "Card").tags,
    ["blog", "dark", "marketing"], // sorted
  );
  assert.deepEqual(out.find((c) => c.name === "Footer").tags, ["dark"]);
});

test("add: a component already carrying the tag is a no-op (omitted)", () => {
  const out = applyBulkTag(comps, "marketing", "add");
  // Only Footer lacks "marketing"; Hero + Card are skipped.
  assert.deepEqual(out.map((c) => c.name), ["Footer"]);
  assert.deepEqual(out[0].tags, ["marketing"]);
});

test("add is case-insensitive — MARKETING doesn't duplicate marketing", () => {
  const out = applyBulkTag([{ name: "Hero", tags: ["marketing"] }], "MARKETING", "add");
  assert.deepEqual(out, []); // already has it (case-insensitive)
});

test("remove: only components carrying the tag change", () => {
  const out = applyBulkTag(comps, "marketing", "remove");
  assert.deepEqual(out.map((c) => c.name).sort(), ["Card", "Hero"]);
  assert.deepEqual(out.find((c) => c.name === "Card").tags, ["blog"]);
  assert.deepEqual(out.find((c) => c.name === "Hero").tags, []);
});

test("remove is case-insensitive", () => {
  const out = applyBulkTag([{ name: "Hero", tags: ["Marketing"] }], "marketing", "remove");
  assert.deepEqual(out, [{ name: "Hero", tags: [] }]);
});

test("blank tag → no changes; source list never mutated", () => {
  const snapshot = JSON.stringify(comps);
  assert.deepEqual(applyBulkTag(comps, "   ", "add"), []);
  assert.equal(JSON.stringify(comps), snapshot);
});
