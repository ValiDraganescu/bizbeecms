/**
 * component-kits Slice 3 regression: buildKitBundle (export a tag as ONE kit).
 *
 * Asserts the kit envelope shape, that each component is the EXISTING portable
 * envelope (reused serializeComponent), that asset deps are unioned + deduped
 * across the kit, and that nested-component deps satisfied WITHIN the kit are
 * dropped from kit-level componentDeps (only EXTERNAL deps remain).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  KIT_FORMAT,
  KIT_VERSION,
  PORTABLE_FORMAT,
  buildKitBundle,
} from "../src/lib/components/portable.ts";

// A component row as stored in D1 (tree is a JSON string). `card` references
// /media/<a>; `hero` references /media/<a> (shared dep) + the Card component.
const cardKey = "assets/img_1_aa.png";
const card = {
  name: "Card",
  tree: JSON.stringify({
    tag: "img",
    props: { src: `/media/${cardKey}` },
    children: [],
  }),
  script: "",
  css: "",
  propsSchema: null,
  tags: JSON.stringify(["marketing"]),
};
const hero = {
  name: "Hero",
  tree: JSON.stringify({
    tag: "div",
    props: {},
    children: [
      { tag: "Card", props: {}, children: [] }, // in-kit dep → not external
      { tag: "AuthorCard", props: {}, children: [] }, // external dep
      { tag: "img", props: { src: `/media/${cardKey}` }, children: [] }, // shared asset
    ],
  }),
  script: "",
  css: "",
  propsSchema: null,
  tags: JSON.stringify(["marketing"]),
};

test("buildKitBundle: envelope shape + reuses portable component envelope", () => {
  const kit = buildKitBundle([card, hero], "marketing");
  assert.equal(kit.format, KIT_FORMAT);
  assert.equal(kit.version, KIT_VERSION);
  assert.equal(kit.name, "marketing");
  assert.equal(kit.tag, "marketing");
  assert.equal(kit.components.length, 2);
  for (const c of kit.components) {
    assert.equal(c.format, PORTABLE_FORMAT); // reused per-component envelope
    assert.ok(c.component.name);
    assert.deepEqual(c.tags, ["marketing"]); // tags carried per component
  }
});

test("buildKitBundle: asset deps unioned + deduped across the kit", () => {
  const kit = buildKitBundle([card, hero], "marketing");
  // Both reference the SAME key → exactly one entry.
  assert.deepEqual(kit.assets, [cardKey]);
});

test("buildKitBundle: in-kit component dep dropped, external dep kept", () => {
  const kit = buildKitBundle([card, hero], "marketing");
  // Card is in the kit → not external; AuthorCard is missing → external.
  assert.deepEqual(kit.componentDeps, ["AuthorCard"]);
});

test("buildKitBundle: empty selection yields an empty but valid kit", () => {
  const kit = buildKitBundle([], "blog");
  assert.equal(kit.format, KIT_FORMAT);
  assert.deepEqual(kit.components, []);
  assert.deepEqual(kit.assets, []);
  assert.deepEqual(kit.componentDeps, []);
});

test("buildKitBundle: meta is included when passed", () => {
  const kit = buildKitBundle([card], "marketing", { exportedAt: "2026-06-22" });
  assert.equal(kit.meta?.exportedAt, "2026-06-22");
});

test("buildKitBundle: name override + note metadata (kit metadata)", () => {
  const kit = buildKitBundle([card], "marketing", {
    name: "  Growth Pack  ",
    note: "  Hero + Card for landing pages  ",
  });
  // name trimmed, overrides the tag; tag stays as the source tag.
  assert.equal(kit.name, "Growth Pack");
  assert.equal(kit.tag, "marketing");
  assert.equal(kit.meta?.note, "Hero + Card for landing pages");
});

test("buildKitBundle: blank name falls back to the tag, no note → no meta", () => {
  const kit = buildKitBundle([card], "marketing", { name: "   ", note: "  " });
  assert.equal(kit.name, "marketing");
  assert.equal(kit.meta, undefined);
});
