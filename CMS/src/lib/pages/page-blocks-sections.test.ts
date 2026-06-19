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
  mergeSectionProps,
  targetSectionId,
  moveNode,
  validateBlocks,
} from "./page-blocks.ts";
import {
  planPage,
  MIN_COLUMN_WIDTH,
  type Block,
  type ComponentArtifact,
} from "../render/tree.ts";

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
  // EQUAL columns render responsive (auto-stack on narrow viewports) — built from
  // MIN_COLUMN_WIDTH, not a hardcoded px, so this assertion tracks the const.
  assert.equal(
    style.gridTemplateColumns,
    `repeat(auto-fit, minmax(min(100%, ${MIN_COLUMN_WIDTH}), 1fr))`,
  );
  assert.equal(grid.children.length, 2, "two column cells");

  // Sibling assertion pinning the OTHER branch: columnBehavior:"collapse" yields
  // FIXED 1fr/0fr tracks (no responsive auto-fit) so both branches stay covered here.
  const collapsed = t.map((s) =>
    s.id === sid ? { ...s, props: { ...s.props, columnBehavior: "collapse" } } : s,
  );
  const collapsedPlan = planPage(collapsed, new Map([["Hero", hero]]));
  const collapsedSection = collapsedPlan.root[0];
  assert.equal(collapsedSection.kind, "element");
  if (collapsedSection.kind !== "element") return;
  const collapsedGrid = collapsedSection.children[0];
  if (collapsedGrid.kind !== "element") return;
  const collapsedStyle = collapsedGrid.props.style as Record<string, unknown>;
  assert.equal(collapsedStyle.gridTemplateColumns, "1fr 0fr", "collapse → fixed 1fr/0fr");

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

test("mergeSectionProps merges non-column props, undefined deletes a key", () => {
  const s = addSection([])[0].id;
  let t = addSection([]);
  t = mergeSectionProps(t, s, { backgroundColor: "var(--color-surface)", gap: 24 });
  assert.equal(t[0].props?.backgroundColor, "var(--color-surface)");
  assert.equal(t[0].props?.gap, 24);
  // undefined reverts (deletes) the key
  t = mergeSectionProps(t, s, { backgroundColor: undefined });
  assert.equal("backgroundColor" in (t[0].props ?? {}), false);
  assert.equal(t[0].props?.gap, 24, "other props untouched");
});

test("mergeSectionProps columns patch reflows columns via setSectionColumns", () => {
  let t = addSection([]);
  const s = t[0].id;
  t = addComponentToColumn(t, s, 0, "Hero");
  // grow to 3
  t = mergeSectionProps(t, s, { columns: 3, gap: 8 });
  assert.equal(t[0].props?.columns, 3);
  assert.equal(t[0].props?.gap, 8);
  assert.equal(sectionColumns(t[0]).length, 3);
  // shrink to 1 reflows content back into the kept column (nothing lost)
  t = mergeSectionProps(t, s, { columns: 1 });
  assert.equal(sectionColumns(t[0]).length, 1);
  assert.equal(sectionColumns(t[0])[0].children?.length, 1, "Hero reflowed, not lost");
});

test("moveNode reorders Sections among themselves (before/after)", () => {
  const t = addSection(addSection([])); // [A, B]
  const [a, b] = t;
  // move B before A → [B, A]
  const r1 = moveNode(t, b.id, a.id, "before");
  assert.deepEqual(r1.map((s) => s.id), [b.id, a.id]);
  // move A after B → [B, A]
  const r2 = moveNode(t, a.id, b.id, "after");
  assert.deepEqual(r2.map((s) => s.id), [b.id, a.id]);
  assert.deepEqual(t.map((s) => s.id), [a.id, b.id], "input not mutated");
});

test("moveNode reorders components within a column", () => {
  let t = addSection([]);
  const sid = t[0].id;
  t = addComponentToColumn(t, sid, 0, "A");
  t = addComponentToColumn(t, sid, 0, "B");
  const [ca, cb] = sectionColumns(t[0])[0].children!;
  // move B before A
  const r = moveNode(t, cb.id, ca.id, "before");
  assert.deepEqual(
    sectionColumns(r[0])[0].children!.map((c) => c.component),
    ["B", "A"],
  );
});

test("moveNode moves a component between columns (cross-column, via 'into')", () => {
  let t = addSection([]);
  const sid = t[0].id;
  t = setSectionColumns(t, sid, 2);
  t = addComponentToColumn(t, sid, 0, "Hero");
  const hero = sectionColumns(t[0])[0].children![0];
  const col1 = sectionColumns(t[0])[1];
  const r = moveNode(t, hero.id, col1.id, "into");
  assert.equal(sectionColumns(r[0])[0].children!.length, 0, "left column emptied");
  assert.deepEqual(
    sectionColumns(r[0])[1].children!.map((c) => c.component),
    ["Hero"],
    "Hero moved into column 1",
  );
});

test("moveNode moves a component across Sections (sibling of a component in another section)", () => {
  let t = addSection(addSection([])); // [S1, S2]
  const s1 = t[0].id;
  const s2 = t[1].id;
  t = addComponentToColumn(t, s1, 0, "Hero");
  t = addComponentToColumn(t, s2, 0, "Card");
  const hero = sectionColumns(t.find((s) => s.id === s1)!)[0].children![0];
  const card = sectionColumns(t.find((s) => s.id === s2)!)[0].children![0];
  // drop Hero after Card in S2's column
  const r = moveNode(t, hero.id, card.id, "after");
  assert.equal(sectionColumns(r.find((s) => s.id === s1)!)[0].children!.length, 0);
  assert.deepEqual(
    sectionColumns(r.find((s) => s.id === s2)!)[0].children!.map((c) => c.component),
    ["Card", "Hero"],
  );
});

test("moveNode is a no-op for self, missing ids, into-a-leaf, or target-inside-dragged", () => {
  let t = addSection([]);
  const sid = t[0].id;
  t = addComponentToColumn(t, sid, 0, "Hero");
  const hero = sectionColumns(t[0])[0].children![0];
  // self
  assert.deepEqual(moveNode(t, sid, sid, "before"), t);
  // missing drag / target
  assert.deepEqual(moveNode(t, "nope", sid, "before"), t);
  assert.deepEqual(moveNode(t, sid, "nope", "after"), t);
  // 'into' a leaf component (no children accepted) → no-op
  assert.deepEqual(moveNode(t, sid, hero.id, "into"), t);
  // moving a Section into its own descendant column → no-op
  const col = sectionColumns(t[0])[0];
  assert.deepEqual(moveNode(t, sid, col.id, "into"), t);
});

test("mergeSectionProps is a no-op for a non-Section id and never mutates", () => {
  const t0 = addSection([]);
  const t1 = mergeSectionProps(t0, "nope", { gap: 99 });
  assert.deepEqual(t1, t0);
  const before = JSON.stringify(t0);
  mergeSectionProps(t0, t0[0].id, { gap: 99 });
  assert.equal(JSON.stringify(t0), before, "input not mutated");
});
