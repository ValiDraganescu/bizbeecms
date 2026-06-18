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
  moveBlock,
  removeBlock,
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
