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
  addSection,
  setSectionColumns,
  addComponentToColumn,
  deleteColumn,
  sectionGridCols,
  localeFieldValue,
  moveBlock,
  parsePropsSchema,
  removeBlock,
  removeNode,
  setLocalizedProp,
  collectTranslatableSource,
  mergeTranslations,
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

test("parsePropsSchema accepts date/time types; they are never translatable", () => {
  const fields = parsePropsSchema(
    JSON.stringify({
      d: { type: "date", default: "2026-01-01", translatable: true },
      t: { type: "time", default: "09:30" },
    }),
  );
  const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
  assert.equal(byName.d.type, "date");
  assert.equal(byName.d.default, "2026-01-01");
  assert.equal(byName.d.translatable, false, "date is never per-locale");
  assert.equal(byName.t.type, "time");
  assert.equal(byName.t.default, "09:30");
});

test("validateBlockProps coerces date/time — keeps valid ISO, drops malformed", () => {
  const schema = parsePropsSchema(
    JSON.stringify({
      d: { type: "date" },
      t: { type: "time" },
      dreq: { type: "date", required: true, default: "2026-12-25" },
    }),
  );
  // valid values pass through
  assert.deepEqual(
    validateBlockProps({ d: "2026-06-19", t: "23:59", dreq: "2026-01-02" }, schema),
    { d: "2026-06-19", t: "23:59", dreq: "2026-01-02" },
  );
  // malformed are dropped (optional) / substituted by default (required)
  const out = validateBlockProps({ d: "June 1, 2026", t: "25:00", dreq: "nope" }, schema);
  assert.equal(out.d, undefined, "bad date dropped");
  assert.equal(out.t, undefined, "bad time (hour > 23) dropped");
  assert.equal(out.dreq, "2026-12-25", "required bad date → declared default");
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

test("sectionGridCols mirrors the render: N equal tracks (Layers row, not stacked)", () => {
  // A 2-column Section must produce a 2-track grid so the Layers tree lays its
  // columns side-by-side as a ROW (regression: was stacked vertically).
  let blocks = addSection([]);
  const sectionId = blocks[0].id;
  blocks = setSectionColumns(blocks, sectionId, 2);
  assert.equal(sectionGridCols(blocks[0]), "repeat(2, 1fr)");

  blocks = setSectionColumns(blocks, sectionId, 3);
  assert.equal(sectionGridCols(blocks[0]), "repeat(3, 1fr)");
});

test("deleteColumn drops a specific column + its components, decrements columns", () => {
  // 2-col Section: col 0 has a Hero, col 1 has a Cta. Delete col 0 (discard its
  // Hero); col 1's Cta survives as the SOLE column, columns==1.
  let blocks = addSection([]);
  const sectionId = blocks[0].id;
  blocks = setSectionColumns(blocks, sectionId, 2);
  blocks = addComponentToColumn(blocks, sectionId, 0, "Hero");
  blocks = addComponentToColumn(blocks, sectionId, 1, "Cta");
  const cols = blocks[0].children.filter((c) => c.component === "__section_column__");
  const col0Id = cols[0].id;

  blocks = deleteColumn(blocks, col0Id);
  const after = blocks[0].children.filter((c) => c.component === "__section_column__");
  assert.equal(after.length, 1, "one column remains");
  assert.equal(blocks[0].props.columns, 1, "columns prop decremented");
  // The surviving column is the old col 1 (its Cta is intact); the Hero is gone.
  assert.equal(after[0].children[0].component, "Cta");
  const allComponents = JSON.stringify(blocks);
  assert.ok(!allComponents.includes('"Hero"'), "deleted column's component discarded");
});

test("deleteColumn refuses to delete the only column (no-op)", () => {
  let blocks = addSection([]); // 1 column by default
  const sectionId = blocks[0].id;
  blocks = addComponentToColumn(blocks, sectionId, 0, "Hero");
  const onlyCol = blocks[0].children.find((c) => c.component === "__section_column__");

  const after = deleteColumn(blocks, onlyCol.id);
  const cols = after[0].children.filter((c) => c.component === "__section_column__");
  assert.equal(cols.length, 1, "last column is NOT deleted");
  assert.equal(cols[0].children[0].component, "Hero", "content untouched");
});

test("removeNode deletes a whole Section incl. its columns + components", () => {
  // Two Sections; the first has a Hero + Cta across two columns. Removing the
  // first Section drops everything inside it; the second Section is untouched.
  let blocks = addSection([]);
  const s1 = blocks[0].id;
  blocks = setSectionColumns(blocks, s1, 2);
  blocks = addComponentToColumn(blocks, s1, 0, "Hero");
  blocks = addComponentToColumn(blocks, s1, 1, "Cta");
  blocks = addSection(blocks);
  const s2 = blocks[1].id;
  blocks = addComponentToColumn(blocks, s2, 0, "Gallery");

  const after = removeNode(blocks, s1);
  assert.equal(after.length, 1, "only the second Section remains");
  assert.equal(after[0].id, s2);
  const json = JSON.stringify(after);
  assert.ok(!json.includes('"Hero"') && !json.includes('"Cta"'), "section's components gone");
  assert.ok(json.includes('"Gallery"'), "other Section's content kept");
});

test("removeNode deletes a single nested component leaf, leaving the rest", () => {
  let blocks = addSection([]);
  const s1 = blocks[0].id;
  blocks = addComponentToColumn(blocks, s1, 0, "Hero");
  blocks = addComponentToColumn(blocks, s1, 0, "Cta");
  const col = blocks[0].children.find((c) => c.component === "__section_column__");
  const heroId = col.children[0].id;

  const after = removeNode(blocks, heroId);
  const colAfter = after[0].children.find((c) => c.component === "__section_column__");
  assert.equal(colAfter.children.length, 1, "one component removed, one left");
  assert.equal(colAfter.children[0].component, "Cta", "the right leaf survived");
});

test("removeNode is a no-op for a missing id (immutable, structurally equal)", () => {
  let blocks = addSection([]);
  blocks = addComponentToColumn(blocks, blocks[0].id, 0, "Hero");
  const after = removeNode(blocks, "does-not-exist");
  assert.deepEqual(after, blocks, "tree unchanged when id absent");
});

test("pageBuilder.deleteNode keys parity + non-empty across EN/FI/ET", () => {
  const cats = { en: load("en"), fi: load("fi"), et: load("et") };
  for (const [l, cat] of Object.entries(cats)) {
    assert.ok(cat.pageBuilder?.deleteNode, `${l}.json missing pageBuilder.deleteNode`);
  }
  const en = keys(cats.en.pageBuilder.deleteNode).sort();
  assert.ok(en.length > 0);
  for (const l of ["fi", "et"]) {
    assert.deepEqual(keys(cats[l].pageBuilder.deleteNode).sort(), en, `${l} deleteNode keys differ`);
  }
  for (const [l, cat] of Object.entries(cats)) {
    for (const k of keys(cat.pageBuilder.deleteNode)) {
      const v = k.split(".").reduce((o, p) => o[p], cat.pageBuilder.deleteNode);
      assert.ok(typeof v === "string" && v.trim() !== "", `${l}: deleteNode.${k} empty`);
    }
  }
});

test("sectionGridCols collapse behavior shrinks empty columns to 0fr", () => {
  let blocks = addSection([]);
  const sectionId = blocks[0].id;
  blocks = setSectionColumns(blocks, sectionId, 2);
  blocks = blocks.map((b) =>
    b.id === sectionId ? { ...b, props: { ...b.props, columnBehavior: "collapse" } } : b,
  );
  // col 0 gets a component, col 1 stays empty → "1fr 0fr".
  blocks = addComponentToColumn(blocks, sectionId, 0, "Hero");
  assert.equal(sectionGridCols(blocks[0]), "1fr 0fr");
});

// ── AI-translate helpers (collect source + merge results) ───────────────────

const TRANSLATE_SCHEMA = [
  { name: "title", type: "string", translatable: true, default: "" },
  { name: "body", type: "richtext", translatable: true, default: "" },
  { name: "href", type: "string", translatable: false, default: "" },
  { name: "count", type: "number", translatable: true, default: 0 },
];

test("collectTranslatableSource: only translatable text props with non-empty source", () => {
  const props = {
    title: { en: "Pricing", fi: "" },
    body: "Body text", // bare string = default-locale value
    href: { en: "/x" }, // not translatable → skipped
    count: 3, // number, not text → skipped
  };
  const out = collectTranslatableSource(props, TRANSLATE_SCHEMA, "en", "en");
  assert.deepEqual(out, { title: "Pricing", body: "Body text" });
});

test("collectTranslatableSource: empty/whitespace source fields are skipped", () => {
  const out = collectTranslatableSource(
    { title: { en: "   " }, body: { en: "Hi" } },
    TRANSLATE_SCHEMA,
    "en",
    "en",
  );
  assert.deepEqual(out, { body: "Hi" });
});

test("mergeTranslations: merges per-locale maps via setLocalizedProp + re-validates", () => {
  const locales = ["en", "fi", "et"];
  const props = { title: { en: "Pricing" }, href: { en: "/p" } };
  const translations = {
    title: { en: "Pricing", fi: "Hinnoittelu", et: "Hinnakiri" },
  };
  const next = mergeTranslations(props, translations, TRANSLATE_SCHEMA, locales);
  assert.deepEqual(next.title, { en: "Pricing", fi: "Hinnoittelu", et: "Hinnakiri" });
  // untouched non-translatable prop survives validation (it's declared)
  assert.deepEqual(next.href, { en: "/p" });
});

test("mergeTranslations: ignores locales not in the Site list and empty strings", () => {
  const locales = ["en", "fi"];
  const props = { title: { en: "Hi" } };
  const next = mergeTranslations(
    props,
    { title: { en: "Hi", fi: "Moi", de: "Hallo" } }, // de not configured
    TRANSLATE_SCHEMA,
    locales,
  );
  assert.deepEqual(next.title, { en: "Hi", fi: "Moi" });
});
