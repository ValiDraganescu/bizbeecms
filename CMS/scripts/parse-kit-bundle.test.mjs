/**
 * component-kits Slice 4 regression: parseKitBundle (import a kit as ONE step).
 *
 * Asserts: a good bundle round-trips (build → parse) with all components valid;
 * a bad envelope (format/version/non-array components) fails the WHOLE bundle;
 * ONE bad component is SKIPPED (recorded in errors) while the rest install; deps
 * are unioned/deduped and in-kit deps are dropped from the external list.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  KIT_FORMAT,
  KIT_VERSION,
  buildKitBundle,
  parseKitBundle,
} from "../src/lib/components/portable.ts";

// Stored D1 rows (tree is a JSON string). Card → /media/<key>; Hero → Card (in-kit
// dep), AuthorCard (external dep) + the shared media key.
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
      { tag: "img", props: { src: `/media/${cardKey}` }, children: [] },
    ],
  }),
  script: "",
  css: "",
  propsSchema: null,
  tags: JSON.stringify(["marketing"]),
};

const goodBundle = buildKitBundle([card, hero], "marketing");

test("parseKitBundle: good bundle round-trips, all components valid", () => {
  const r = parseKitBundle(goodBundle);
  assert.equal(r.ok, true);
  assert.equal(r.name, "marketing");
  assert.equal(r.tag, "marketing");
  assert.equal(r.components.length, 2);
  assert.deepEqual(r.errors, []);
  // Tags round-trip onto each imported component.
  for (const c of r.components) assert.deepEqual(c.tags, ["marketing"]);
});

test("parseKitBundle: accepts a JSON string", () => {
  const r = parseKitBundle(JSON.stringify(goodBundle));
  assert.equal(r.ok, true);
  assert.equal(r.components.length, 2);
});

test("parseKitBundle: deps unioned/deduped, in-kit dep dropped", () => {
  const r = parseKitBundle(goodBundle);
  assert.equal(r.ok, true);
  assert.deepEqual(r.assets, [cardKey]); // shared key deduped
  assert.deepEqual(r.componentDeps, ["AuthorCard"]); // Card is in-kit → not external
});

test("parseKitBundle: wrong format fails the whole bundle", () => {
  const r = parseKitBundle({ ...goodBundle, format: "bizbeecms.component" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes(KIT_FORMAT)));
});

test("parseKitBundle: wrong version fails the whole bundle", () => {
  const r = parseKitBundle({ ...goodBundle, version: KIT_VERSION + 1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("version")));
});

test("parseKitBundle: non-array components fails the whole bundle", () => {
  const r = parseKitBundle({ format: KIT_FORMAT, version: KIT_VERSION, components: {} });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("components")));
});

test("parseKitBundle: one bad component is skipped, the rest install", () => {
  // Corrupt the Card component's name (lowercase → fails validateComponentArtifact).
  const broken = structuredClone(goodBundle);
  broken.components[0].component.name = "not a valid name!";
  const r = parseKitBundle(broken);
  assert.equal(r.ok, true);
  assert.equal(r.components.length, 1); // only Hero installs
  assert.equal(r.components[0].name, "Hero");
  assert.equal(r.errors.length, 1);
  assert.ok(r.errors[0].startsWith("component #0"));
});

test("parseKitBundle: non-object input rejected", () => {
  assert.equal(parseKitBundle("not json").ok, false);
  assert.equal(parseKitBundle(42).ok, false);
  assert.equal(parseKitBundle(null).ok, false);
});
