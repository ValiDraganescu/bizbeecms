/**
 * component-kits (preview-before-install) regression: summarizeKitBundle —
 * a READ-ONLY preview of what installing a kit would do (no D1 write).
 *
 * Asserts: a good bundle previews per-component create-vs-update against the
 * existing names, unions tags, narrows external deps to the ones the site is
 * missing, and a bad envelope returns ok:false with the parse errors.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildKitBundle, summarizeKitBundle } from "../src/lib/components/portable.ts";

const cardKey = "assets/img_1_aa.png";
const card = {
  name: "Card",
  tree: JSON.stringify({ tag: "img", props: { src: `/media/${cardKey}` }, children: [] }),
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
      { tag: "Card", props: {}, children: [] },
      { tag: "AuthorCard", props: {}, children: [] },
    ],
  }),
  script: "",
  css: "",
  propsSchema: null,
  tags: JSON.stringify(["marketing", "blog"]),
};

const bundle = buildKitBundle([card, hero], "marketing");

test("summarizeKitBundle: create vs update against existing names", () => {
  const p = summarizeKitBundle(bundle, ["Card"]); // Card exists, Hero doesn't
  assert.equal(p.ok, true);
  assert.equal(p.name, "marketing");
  const byName = Object.fromEntries(p.components.map((c) => [c.name, c.action]));
  assert.equal(byName.Card, "update");
  assert.equal(byName.Hero, "create");
});

test("summarizeKitBundle: unions tags, sorted", () => {
  const p = summarizeKitBundle(bundle, []);
  assert.deepEqual(p.tags, ["blog", "marketing"]);
});

test("summarizeKitBundle: external dep is missing unless the site has it", () => {
  // AuthorCard is an external dep (Card is in-kit). Site lacks it → missing.
  const miss = summarizeKitBundle(bundle, ["Card"]);
  assert.deepEqual(miss.missingComponents, ["AuthorCard"]);
  // Site already has AuthorCard → not missing.
  const ok = summarizeKitBundle(bundle, ["Card", "AuthorCard"]);
  assert.deepEqual(ok.missingComponents, []);
});

test("summarizeKitBundle: bad envelope → ok:false with errors", () => {
  const p = summarizeKitBundle({ ...bundle, format: "nope" }, []);
  assert.equal(p.ok, false);
  assert.ok(p.errors.length > 0);
  assert.deepEqual(p.components, []);
});
