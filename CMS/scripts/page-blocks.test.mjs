/**
 * C3 regression: the visual block editor.
 *
 * Covers the two things this slice added that can silently break:
 *   1. The PURE edit/validate logic (`lib/pages/page-blocks.ts`) the editor +
 *      REST route depend on: add/remove/move immutability + bounds, and
 *      validateBlocks gating (shape, dup ids, unrenderable, JSON-string).
 *   2. The `pageBlocks` i18n namespace + the `pages.editBlocks` key must exist
 *      with IDENTICAL keys in all three admin-UI catalogs (a missing key throws
 *      at render).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  addBlock,
  localeFieldValue,
  moveBlock,
  parsePropsSchema,
  removeBlock,
  setLocalizedProp,
  validateBlockProps,
  validateBlocks,
} from "../src/lib/pages/page-blocks.ts";

const here = dirname(fileURLToPath(import.meta.url));
const msgDir = join(here, "..", "messages");
const load = (l) => JSON.parse(readFileSync(join(msgDir, `${l}.json`), "utf8"));

function keys(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...keys(v, path));
    else out.push(path);
  }
  return out;
}

test("parsePropsSchema yields one field per declared prop, type-normalized", () => {
  const fields = parsePropsSchema(
    JSON.stringify({
      title: { type: "string", default: "Hi" },
      body: { type: "richtext", default: "" },
      odd: { type: "weird" },
    }),
  );
  assert.equal(fields.length, 3);
  const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
  // parsePropsSchema returns the full PropField descriptor (widened from the old
  // narrow {name,type,default}) — assert the core shape + the new defaults.
  assert.equal(byName.title.name, "title");
  assert.equal(byName.title.type, "string");
  assert.equal(byName.title.default, "Hi");
  assert.equal(byName.title.required, false, "required defaults to false");
  assert.equal(byName.title.translatable, false, "translatable defaults to false");
  assert.equal(byName.body.type, "richtext");
  assert.equal(byName.odd.type, "string", "unknown type degrades to string");
  assert.deepEqual(parsePropsSchema(null), [], "no schema → no fields");
  assert.deepEqual(parsePropsSchema("{bad json"), [], "bad JSON → no fields");
});

test("validateBlockProps drops undeclared keys and empty strings (renderer allowlist)", () => {
  const out = validateBlockProps(
    { title: "Hello", secret: "leak", blank: "" },
    new Set(["title", "blank"]),
  );
  assert.deepEqual(out, { title: "Hello" }, "undeclared dropped, empty dropped");
});

test("addBlock appends an immutable, uniquely-id'd block", () => {
  const a = [];
  const b = addBlock(a, "Hero");
  assert.equal(a.length, 0, "input not mutated");
  assert.equal(b.length, 1);
  assert.equal(b[0].component, "Hero");
  const c = addBlock(b, "Hero");
  assert.notEqual(c[1].id, b[0].id, "ids unique even for same component");
});

test("removeBlock drops only the matching id (immutable)", () => {
  const blocks = [
    { id: "a", component: "Hero" },
    { id: "b", component: "Footer" },
  ];
  const out = removeBlock(blocks, "a");
  assert.deepEqual(out.map((x) => x.id), ["b"]);
  assert.equal(blocks.length, 2, "input not mutated");
  assert.deepEqual(removeBlock(blocks, "nope").map((x) => x.id), ["a", "b"]);
});

test("moveBlock reorders and clamps to bounds", () => {
  const blocks = [
    { id: "a", component: "A" },
    { id: "b", component: "B" },
    { id: "c", component: "C" },
  ];
  assert.deepEqual(moveBlock(blocks, 0, 1).map((x) => x.id), ["b", "a", "c"]);
  assert.deepEqual(moveBlock(blocks, 2, -1).map((x) => x.id), ["a", "c", "b"]);
  // out-of-range / no-op return same contents
  assert.deepEqual(moveBlock(blocks, 0, -1).map((x) => x.id), ["a", "b", "c"]);
  assert.deepEqual(moveBlock(blocks, 2, 1).map((x) => x.id), ["a", "b", "c"]);
  assert.equal(blocks[0].id, "a", "input not mutated");
});

test("validateBlocks accepts a clean array and collects component names", () => {
  const r = validateBlocks([
    { id: "hero-1", component: "Hero" },
    { id: "grid-1", component: "Grid", children: [{ id: "card-1", component: "Card" }] },
  ]);
  assert.ok(r.ok);
  assert.deepEqual(r.componentNames.sort(), ["Card", "Grid", "Hero"]);
});

test("validateBlocks accepts a JSON string of an array", () => {
  const r = validateBlocks(JSON.stringify([{ id: "a", component: "Hero" }]));
  assert.ok(r.ok);
});

test("validateBlocks rejects bad shape, dup ids, and non-array", () => {
  assert.equal(validateBlocks({ not: "an array" }).ok, false);
  assert.equal(validateBlocks("not json").ok, false);
  assert.equal(validateBlocks([{ id: "a" }]).ok, false, "missing component");
  assert.equal(validateBlocks([{ component: "Hero" }]).ok, false, "missing id");
  const dup = validateBlocks([
    { id: "x", component: "Hero" },
    { id: "x", component: "Footer" },
  ]);
  assert.equal(dup.ok, false, "duplicate ids rejected");
});

test("localeFieldValue reads the right per-locale string", () => {
  // locale object → exactly that locale's entry (no cross-locale fallback in the editor)
  const obj = { en: "Hello", fi: "Moi" };
  assert.equal(localeFieldValue(obj, "en", "en"), "Hello");
  assert.equal(localeFieldValue(obj, "fi", "en"), "Moi");
  assert.equal(localeFieldValue(obj, "et", "en"), "", "missing locale → empty field");
  // bare string belongs to the DEFAULT locale only (legacy / single-locale authoring)
  assert.equal(localeFieldValue("Plain", "en", "en"), "Plain");
  assert.equal(localeFieldValue("Plain", "fi", "en"), "", "non-default locale starts empty");
  assert.equal(localeFieldValue(undefined, "en", "en"), "");
  assert.equal(localeFieldValue(42, "en", "en"), "", "non-string value → empty");
});

test("setLocalizedProp: single locale stores a bare string", () => {
  assert.equal(setLocalizedProp(undefined, "en", "Hi", ["en"]), "Hi");
  assert.equal(setLocalizedProp("old", "en", "", ["en"]), "", "cleared → empty (validateBlockProps drops it)");
});

test("setLocalizedProp: multi-locale builds/updates a locale object, drops empties", () => {
  // first edit on the default locale collapses to a bare string (stays simple)
  assert.equal(setLocalizedProp(undefined, "en", "Hi", ["en", "fi", "et"]), "Hi");
  // editing a non-default locale on a bare-string value promotes to an object,
  // carrying the bare string into the default locale
  assert.deepEqual(
    setLocalizedProp("Hi", "fi", "Moi", ["en", "fi", "et"]),
    { en: "Hi", fi: "Moi" },
    "default carried over + new locale added; empty et omitted",
  );
  // editing an existing object updates one locale, leaves the rest
  assert.deepEqual(
    setLocalizedProp({ en: "Hi", fi: "Moi" }, "et", "Tere", ["en", "fi", "et"]),
    { en: "Hi", fi: "Moi", et: "Tere" },
  );
  // clearing a non-default locale removes just that key
  assert.deepEqual(
    setLocalizedProp({ en: "Hi", fi: "Moi" }, "fi", "", ["en", "fi", "et"]),
    "Hi",
    "only the default remains → collapses back to a bare string",
  );
  // clearing everything → "" so the prop is dropped downstream
  assert.equal(setLocalizedProp({ fi: "Moi" }, "fi", "", ["en", "fi", "et"]), "");
});

test("setLocalizedProp output round-trips through validateBlockProps + resolves", () => {
  const declared = new Set(["title"]);
  const localized = setLocalizedProp("Hi", "fi", "Moi", ["en", "fi"]);
  const props = validateBlockProps({ title: localized }, declared);
  assert.deepEqual(props, { title: { en: "Hi", fi: "Moi" } }, "object value survives validation");
  const emptied = validateBlockProps({ title: setLocalizedProp("Hi", "en", "", ["en"]) }, declared);
  assert.deepEqual(emptied, {}, "emptied prop dropped");
});

test("pageBlocks namespace + pages.editBlocks parity across EN/FI/ET", () => {
  const cats = { en: load("en"), fi: load("fi"), et: load("et") };
  for (const [l, cat] of Object.entries(cats)) {
    assert.ok(cat.pageBlocks, `${l}.json missing pageBlocks namespace`);
    assert.ok(cat.pages?.editBlocks, `${l}.json missing pages.editBlocks`);
  }
  const en = keys(cats.en.pageBlocks).sort();
  assert.ok(en.length > 0);
  for (const l of ["fi", "et"]) {
    assert.deepEqual(keys(cats[l].pageBlocks).sort(), en, `${l} pageBlocks keys differ`);
  }
  for (const [l, cat] of Object.entries(cats)) {
    for (const path of keys(cat.pageBlocks)) {
      const v = path.split(".").reduce((o, k) => o[k], cat.pageBlocks);
      assert.ok(typeof v === "string" && v.trim() !== "", `${l}: ${path} empty`);
    }
  }
});
