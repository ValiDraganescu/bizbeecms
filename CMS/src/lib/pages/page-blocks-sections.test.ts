import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SECTION_COMPONENT,
  SECTION_COLUMN_COMPONENT,
  isSection,
  isSectionColumn,
  addSection,
  sectionColumns,
  setSectionColumns,
  addComponentToColumn,
  addComponentToSection,
  targetSectionId,
  validateBlocks,
} from "./page-blocks.ts";
import { planPage, type Block, type ComponentArtifact } from "../render/tree.ts";

test("addSection appends a Section seeded with one column", () => {
  const t0: Block[] = [];
  const t1 = addSection(t0);
  assert.equal(t1.length, 1);
  assert.equal(t1[0].component, SECTION_COMPONENT);
  assert.ok(isSection(t1[0]));
  assert.equal(t1[0].props?.columns, 1);
  const cols = sectionColumns(t1[0]);
  assert.equal(cols.length, 1);
  assert.ok(isSectionColumn(cols[0]));
  assert.deepEqual(cols[0].children, []);
  assert.deepEqual(t0, [], "input is not mutated");

  const t2 = addSection(t1);
  assert.equal(t2.length, 2);
  assert.notEqual(t2[0].id, t2[1].id, "section ids are unique");
  // every id across the tree (sections + columns) is unique
  const ids = t2.flatMap((s) => [s.id, ...(s.children ?? []).map((c) => c.id)]);
  assert.equal(new Set(ids).size, ids.length);
});

test("addComponentToColumn appends a component into the target column", () => {
  const t1 = addSection([]);
  const sid = t1[0].id;
  const t2 = addComponentToColumn(t1, sid, 0, "Hero");
  const col0 = sectionColumns(t2[0])[0];
  assert.equal(col0.children?.length, 1);
  assert.equal(col0.children?.[0].component, "Hero");
  assert.equal(sectionColumns(t1[0])[0].children?.length, 0, "input not mutated");

  // ids stay unique across the whole tree, even same component twice.
  const t3 = addComponentToColumn(t2, sid, 0, "Hero");
  const ids = sectionColumns(t3[0])[0].children!.map((c) => c.id);
  assert.equal(new Set(ids).size, 2);
});

test("addComponentToColumn is a no-op for bad section id or column index", () => {
  const t1 = addSection([]);
  const sid = t1[0].id;
  assert.deepEqual(addComponentToColumn(t1, "nope", 0, "Hero"), t1);
  assert.deepEqual(addComponentToColumn(t1, sid, 1, "Hero"), t1, "out-of-range col");
  assert.deepEqual(addComponentToColumn(t1, sid, -1, "Hero"), t1, "negative col");
});

test("setSectionColumns grows by appending empty columns (clamped 1..4)", () => {
  const t1 = addSection([]);
  const sid = t1[0].id;
  const t3 = setSectionColumns(t1, sid, 3);
  assert.equal(t3[0].props?.columns, 3);
  assert.equal(sectionColumns(t3[0]).length, 3);
  assert.ok(sectionColumns(t3[0]).every(isSectionColumn));
  // clamp above 4
  const t4 = setSectionColumns(t3, sid, 9);
  assert.equal(sectionColumns(t4[0]).length, 4);
  // clamp below 1
  const t1b = setSectionColumns(t4, sid, 0);
  assert.equal(sectionColumns(t1b[0]).length, 1);
  // unique ids tree-wide after growth
  const ids = sectionColumns(t4[0]).map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("setSectionColumns shrink reflows removed columns' content into the last kept column", () => {
  let t = addSection([]);
  const sid = t[0].id;
  t = setSectionColumns(t, sid, 3);
  // one component in each column
  t = addComponentToColumn(t, sid, 0, "A");
  t = addComponentToColumn(t, sid, 1, "B");
  t = addComponentToColumn(t, sid, 2, "C");
  // shrink to 2 → column 2's "C" reflows into column 1 (the last kept)
  const t2 = setSectionColumns(t, sid, 2);
  const cols = sectionColumns(t2[0]);
  assert.equal(cols.length, 2);
  assert.deepEqual(cols[0].children?.map((c) => c.component), ["A"]);
  assert.deepEqual(cols[1].children?.map((c) => c.component), ["B", "C"], "C reflowed in");
});

test("setSectionColumns is a no-op for a non-section id", () => {
  const t1 = addSection([]);
  assert.deepEqual(setSectionColumns(t1, "nope", 4), t1);
});

test("addComponentToSection shim inserts into the first column", () => {
  const t1 = addSection([]);
  const t2 = addComponentToSection(t1, t1[0].id, "Hero");
  assert.equal(sectionColumns(t2[0])[0].children?.[0].component, "Hero");
});

test("targetSectionId: selected section wins, else last section, else null", () => {
  assert.equal(targetSectionId([], null), null);

  const two = addSection(addSection([]));
  const [a, b] = two;
  assert.equal(targetSectionId(two, null), b.id, "falls back to last section");
  assert.equal(targetSectionId(two, a.id), a.id, "selected section wins");

  const mixed: Block[] = [{ id: "h1", component: "Hero" }, ...two];
  assert.equal(targetSectionId(mixed, "h1"), b.id);
});

test("validateBlocks excludes Section AND the reserved column from componentNames", () => {
  const t = addSection([]);
  const withChild = addComponentToColumn(t, t[0].id, 0, "Hero");
  const v = validateBlocks(withChild);
  assert.ok(v.ok, "blocks validate");
  if (v.ok) {
    assert.deepEqual(v.componentNames, ["Hero"], "Section + column excluded, Hero kept");
  }
});

test("planPage renders a Section as a grid of columns nesting components", () => {
  let t = addSection([]);
  const sid = t[0].id;
  t = setSectionColumns(t, sid, 2);
  t = addComponentToColumn(t, sid, 0, "Hero");
  const hero: ComponentArtifact = { name: "Hero", tree: { tag: "h1", children: ["Hi"] } };
  const plan = planPage(t, new Map([["Hero", hero]]));

  const section = plan.root[0];
  assert.equal(section.kind, "element");
  if (section.kind !== "element") return;
  assert.equal(section.tag, "div");
  assert.equal(section.props["data-section"], sid);

  // inner <section> grid with two column cells
  const grid = section.children[0];
  assert.equal(grid.kind === "element" && grid.tag, "section");
  if (grid.kind !== "element") return;
  const style = grid.props.style as Record<string, unknown>;
  assert.equal(style.gridTemplateColumns, "repeat(2, 1fr)");
  assert.equal(grid.children.length, 2, "two column cells");

  const col0 = grid.children[0];
  assert.equal(col0.kind === "element" && col0.tag, "div");
  if (col0.kind !== "element") return;
  assert.equal(col0.children.length, 1, "Hero nested in column 0");
  assert.equal(col0.children[0].kind === "element" && col0.children[0].tag, "h1");
});

test("planPage collapse behavior shrinks empty columns to 0fr", () => {
  let t = addSection([]);
  const sid = t[0].id;
  t = setSectionColumns(t, sid, 2);
  t = addComponentToColumn(t, sid, 0, "Hero");
  // mark collapse via props (Block tab will set this; here we patch directly)
  t = t.map((s) => (s.id === sid ? { ...s, props: { ...s.props, columnBehavior: "collapse" } } : s));
  const hero: ComponentArtifact = { name: "Hero", tree: { tag: "h1", children: ["Hi"] } };
  const plan = planPage(t, new Map([["Hero", hero]]));
  const section = plan.root[0];
  if (section.kind !== "element") return;
  const grid = section.children[0];
  if (grid.kind !== "element") return;
  const style = grid.props.style as Record<string, unknown>;
  assert.equal(style.gridTemplateColumns, "1fr 0fr", "filled col 1fr, empty col 0fr");
});
