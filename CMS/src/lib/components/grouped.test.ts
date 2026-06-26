// Pure test for groupComponentsByKit (page-builder Components-rail GAP-closer).
// node --test does NOT resolve the @/ alias → import via relative .ts path.
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupComponentsByKit, groupComponentsByTag } from "./grouped.ts";

test("groups by kit, in kitOrder, with ungrouped last and names sorted", () => {
  const groups = groupComponentsByKit(
    [
      { name: "PostCard", sourceKit: "blog" },
      { name: "Hero", sourceKit: "landing" },
      { name: "ArticleList", sourceKit: "blog" },
      { name: "MyCustomThing", sourceKit: null },
    ],
    ["blog", "landing", "docs"],
  );
  assert.deepEqual(
    groups.map((g) => g.kit),
    ["blog", "landing", "docs", null], // kitOrder kept, ungrouped last
  );
  assert.deepEqual(groups[0].components, ["ArticleList", "PostCard"]); // sorted
  assert.deepEqual(groups[1].components, ["Hero"]);
  assert.deepEqual(groups[2].components, []); // docs present but empty
  assert.deepEqual(groups[3].components, ["MyCustomThing"]);
});

test("no ungrouped group when every component is kit-tagged", () => {
  const groups = groupComponentsByKit([{ name: "Hero", sourceKit: "landing" }], ["landing"]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kit, "landing");
});

test("stale kit tag not in kitOrder still surfaces (appended, never dropped)", () => {
  const groups = groupComponentsByKit(
    [{ name: "Old", sourceKit: "retired-kit" }],
    ["blog"],
  );
  assert.deepEqual(
    groups.map((g) => g.kit),
    ["blog", "retired-kit"],
  );
  assert.deepEqual(groups[1].components, ["Old"]);
});

test("empty input → empty groups", () => {
  assert.deepEqual(groupComponentsByKit([], ["blog"]), [
    { kit: "blog", components: [] },
  ]);
});

// --- groupComponentsByTag (component-kits Slice 5) -------------------------

test("groups by tag, alphabetical, untagged last, names sorted, overlap allowed", () => {
  const groups = groupComponentsByTag([
    { name: "Hero", tags: ["marketing", "dark"] },
    { name: "Card", tags: ["marketing"] },
    { name: "Footer", tags: [] },
  ]);
  assert.deepEqual(
    groups.map((g) => g.kit),
    ["dark", "marketing", null], // tags sorted, untagged last
  );
  assert.deepEqual(groups[0].components, ["Hero"]); // dark
  assert.deepEqual(groups[1].components, ["Card", "Hero"]); // marketing, sorted + overlap
  assert.deepEqual(groups[2].components, ["Footer"]); // untagged
});

test("no untagged group when every component has a tag", () => {
  const groups = groupComponentsByTag([{ name: "Hero", tags: ["a"] }]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kit, "a");
});

test("blank/whitespace tags are ignored (treated as untagged)", () => {
  const groups = groupComponentsByTag([{ name: "Hero", tags: ["  ", ""] }]);
  assert.deepEqual(groups, [{ kit: null, components: ["Hero"] }]);
});

test("empty input → empty tag groups", () => {
  assert.deepEqual(groupComponentsByTag([]), []);
});
