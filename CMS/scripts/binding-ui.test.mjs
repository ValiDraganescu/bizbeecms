/**
 * content-collections Phase-2 Slice C — tests for the operator-UI PURE helpers:
 *   page-blocks.ts: addListBlock / addListToSection / setBlockField /
 *                   setBlockChildren / isList
 *   binding.ts:     validateListBinding
 *
 * The React panels (BindingPanel/ListSettings/ListSettings) are thin wiring over
 * these — they have no logic worth a DOM test. Dep-free `node --test`; imports
 * the REAL .ts modules via native type-stripping (explicit .ts extension).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  addSection,
  addListBlock,
  addListToSection,
  setBlockField,
  setBlockChildren,
  isList,
  findBlock,
  validateBlocks,
} from "../src/lib/pages/page-blocks.ts";
import { LIST_COMPONENT } from "../src/lib/render/tree.ts";
import { validateListBinding } from "../src/lib/content/binding.ts";

// ── List insert ──────────────────────────────────────────────────────────────

test("addListToSection inserts a built-in List into the section's first column", () => {
  let blocks = addSection([]); // one Section, one column
  const sectionId = blocks[0].id;
  blocks = addListToSection(blocks, sectionId);
  const col = blocks[0].children.find((c) => c.component === "__section_column__");
  const list = col.children[0];
  assert.equal(list.component, LIST_COMPONENT);
  assert.ok(isList(list));
  assert.deepEqual(list.children, []);
  // The whole tree must still be renderable (List is a built-in, not a D1 row).
  const v = validateBlocks(blocks);
  assert.equal(v.ok, true);
  assert.ok(!v.componentNames.includes(LIST_COMPONENT)); // built-in dropped
});

test("addListBlock is a no-op for a non-Section / out-of-range column", () => {
  const blocks = addSection([]);
  assert.deepEqual(addListBlock(blocks, "nope", 0), blocks);
  assert.deepEqual(addListBlock(blocks, blocks[0].id, 5), blocks);
});

// ── setBlockField (bindings / list config, OUTSIDE props) ─────────────────────

test("setBlockField sets binding/list fields and deletes on undefined", () => {
  let blocks = addSection([]);
  blocks = addListToSection(blocks, blocks[0].id);
  const col = blocks[0].children.find((c) => c.component === "__section_column__");
  const listId = col.children[0].id;

  const source = { collection: "content_posts", filter: [{ field: "status", op: "eq", value: "published" }] };
  blocks = setBlockField(blocks, listId, { listSource: source, listMap: { title: "name" } });
  let list = findBlock(blocks, listId);
  assert.deepEqual(list.listSource, source);
  assert.deepEqual(list.listMap, { title: "name" });

  // undefined deletes the key (clear the binding).
  blocks = setBlockField(blocks, listId, { listSource: undefined });
  list = findBlock(blocks, listId);
  assert.ok(!("listSource" in list));
  assert.deepEqual(list.listMap, { title: "name" }); // untouched
});

test("setBlockField on a NESTED component sets single-item bindings (tree-walk)", () => {
  // Build a section with a component nested in a column, then bind it.
  let blocks = addSection([]);
  const sectionId = blocks[0].id;
  // Reuse addListToSection to get a nested block id, then treat it as a component.
  blocks = addListToSection(blocks, sectionId);
  const col = blocks[0].children.find((c) => c.component === "__section_column__");
  const id = col.children[0].id;
  const bindings = { item: { source: { collection: "content_posts" }, map: { title: "name" } } };
  blocks = setBlockField(blocks, id, { bindings });
  assert.deepEqual(findBlock(blocks, id).bindings, bindings);
});

test("setBlockChildren replaces a List's template child and drops on empty", () => {
  let blocks = addSection([]);
  blocks = addListToSection(blocks, blocks[0].id);
  const col = blocks[0].children.find((c) => c.component === "__section_column__");
  const listId = col.children[0].id;

  const tpl = [{ id: `${listId}-tpl`, component: "Card", listRole: "template" }];
  blocks = setBlockChildren(blocks, listId, tpl);
  assert.deepEqual(findBlock(blocks, listId).children, tpl);

  blocks = setBlockChildren(blocks, listId, []);
  assert.ok(!("children" in findBlock(blocks, listId)));
});

// ── validateListBinding ──────────────────────────────────────────────────────

const fields = [
  { name: "name", type: "string" },
  { name: "body", type: "richtext" },
];
const declared = new Set(["title", "text"]);

test("validateListBinding: ok when collection/fields/props all resolve", () => {
  const r = validateListBinding(
    { collection: "content_posts", filter: [{ field: "status", op: "eq", value: "published" }], sort: [{ field: "name" }] },
    { title: "name", text: "body" },
    fields,
    declared,
  );
  assert.deepEqual(r, { ok: true });
});

test("validateListBinding: unknown collection → error", () => {
  const r = validateListBinding({ collection: "content_x" }, {}, null, declared);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /unknown collection/);
});

test("validateListBinding: missing source collection → error", () => {
  const r = validateListBinding(undefined, {}, fields, declared);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /source collection/);
});

test("validateListBinding: unknown field + undeclared prop both reported", () => {
  const r = validateListBinding(
    { collection: "content_posts", filter: [{ field: "ghost", op: "eq" }] },
    { nope: "name", title: "missingfield" },
    fields,
    declared,
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /unknown filter field "ghost"/.test(e)));
  assert.ok(r.errors.some((e) => /prop "nope" is not declared/.test(e)));
  assert.ok(r.errors.some((e) => /unknown field "missingfield"/.test(e)));
});

test("validateListBinding: a system column (created_at) is a valid sort/map target", () => {
  const r = validateListBinding(
    { collection: "content_posts", sort: [{ field: "created_at", dir: "desc" }] },
    { title: "id" },
    fields,
    declared,
  );
  assert.deepEqual(r, { ok: true });
});

// ── i18n parity: Slice C added pageBuilder.layoutList + bind.* + list.* ───────

test("Slice C pageBuilder binding keys parity + non-empty across EN/FI/ET", () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const load = (l) => JSON.parse(readFileSync(join(dir, `../messages/${l}.json`), "utf8")).pageBuilder;
  const flat = (o, p = "") =>
    Object.entries(o).flatMap(([k, v]) =>
      v && typeof v === "object" ? flat(v, `${p}${k}.`) : [`${p}${k}`],
    );
  const cats = { en: load("en"), fi: load("fi"), et: load("et") };
  const newKeys = ["layoutList", ...flat(cats.en.bind, "bind."), ...flat(cats.en.list, "list.")];
  for (const [l, cat] of Object.entries(cats)) {
    for (const path of newKeys) {
      const v = path.split(".").reduce((o, k) => o?.[k], cat);
      assert.ok(typeof v === "string" && v.trim() !== "", `${l}: pageBuilder.${path} missing/empty`);
    }
  }
});
