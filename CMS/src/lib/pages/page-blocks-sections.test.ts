import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SECTION_COMPONENT,
  SECTION_ROW_COMPONENT,
  SECTION_COLUMN_COMPONENT,
  isSection,
  isSectionRow,
  isSectionColumn,
  addSection,
  addRow,
  deleteRow,
  sectionRows,
  rowColumns,
  rowGridCols,
  sectionColumns,
  setSectionColumns,
  normalizeSectionColumns,
  addComponentToColumn,
  addComponentToSection,
  mergeSectionProps,
  targetSectionId,
  moveNode,
  validateBlocks,
  sectionName,
  listSections,
  renameSection,
} from "./page-blocks.ts";
import {
  planPage,
  MIN_COLUMN_WIDTH,
  type Block,
  type ComponentArtifact,
} from "../render/tree.ts";

test("addSection appends a Section seeded with one row of one column", () => {
  const t0: Block[] = [];
  const t1 = addSection(t0);
  assert.equal(t1.length, 1);
  assert.equal(t1[0].component, SECTION_COMPONENT);
  assert.ok(isSection(t1[0]));
  // Section now holds ONE explicit row; the column count lives on the row.
  const rows = sectionRows(t1[0]);
  assert.equal(rows.length, 1);
  assert.ok(isSectionRow(rows[0]));
  assert.equal(rows[0].props?.columns, 1);
  const cols = rowColumns(rows[0]);
  assert.equal(cols.length, 1);
  assert.ok(isSectionColumn(cols[0]));
  assert.deepEqual(cols[0].children, []);
  // sectionColumns still resolves the column (flattened across rows).
  assert.equal(sectionColumns(t1[0]).length, 1);
  assert.deepEqual(t0, [], "input is not mutated");

  const t2 = addSection(t1);
  assert.equal(t2.length, 2);
  assert.notEqual(t2[0].id, t2[1].id, "section ids are unique");
  // every id across the WHOLE tree (sections + rows + columns) is unique
  const allIds = (b: Block): string[] => [b.id, ...(b.children ?? []).flatMap(allIds)];
  const ids = t2.flatMap(allIds);
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
  assert.equal(sectionRows(t3[0])[0].props?.columns, 3, "count lives on the row");
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

test("validateBlocks rejects a bare non-Section block at the top level", () => {
  const blocks = [{ id: "hero1", component: "Hero" }];
  const v = validateBlocks(blocks);
  assert.equal(v.ok, false, "top-level Hero is rejected");
  if (!v.ok) {
    assert.match(v.errors[0], /only Sections are allowed at the top level/);
  }
});

test("validateBlocks grandfathers an already-persisted top-level stray by id", () => {
  const blocks = [{ id: "hero1", component: "Hero" }];
  // Same id present in the persisted page → allowed through; a new id would not be.
  const v = validateBlocks(blocks, { grandfatheredTopLevelIds: new Set(["hero1"]) });
  assert.ok(v.ok, "grandfathered id passes");
  const vNew = validateBlocks([{ id: "hero2", component: "Hero" }], {
    grandfatheredTopLevelIds: new Set(["hero1"]),
  });
  assert.equal(vNew.ok, false, "a different (new) top-level stray still errors");
});

// The rendered Section is: data-section div → content wrapper div → one
// <section data-section-row> grid per row → column divs. This helper digs out the
// first row's grid so the assertions read the same structure the browser sees.
function firstRowGrid(section: import("../render/tree.ts").ElementPlan) {
  if (section.kind !== "element") throw new Error("section not an element");
  const wrapper = section.children[0];
  if (wrapper.kind !== "element") throw new Error("wrapper not an element");
  const grid = wrapper.children[0];
  if (grid.kind !== "element") throw new Error("grid not an element");
  return grid;
}

test("planPage renders a Section as a per-row grid of columns nesting components", () => {
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

  // the (only) row's <section> grid with two column cells
  const grid = firstRowGrid(section);
  assert.equal(grid.tag, "section");
  const style = grid.props.style as Record<string, unknown>;
  // EQUAL columns render responsive (auto-stack on narrow viewports) — built from
  // MIN_COLUMN_WIDTH, not a hardcoded px, so this assertion tracks the const.
  assert.equal(
    style.gridTemplateColumns,
    `repeat(auto-fit, minmax(min(100%, ${MIN_COLUMN_WIDTH}), 1fr))`,
  );
  assert.equal(grid.children.length, 2, "two column cells");

  // Sibling assertion pinning the OTHER branch: columnBehavior:"collapse" on the
  // ROW yields FIXED 1fr/0fr tracks (no responsive auto-fit).
  const rowId = sectionRows(t[0])[0].id;
  const collapsed = setRowBehavior(t, rowId, "collapse");
  const collapsedGrid = firstRowGrid(planPage(collapsed, new Map([["Hero", hero]])).root[0]);
  const collapsedStyle = collapsedGrid.props.style as Record<string, unknown>;
  assert.equal(collapsedStyle.gridTemplateColumns, "1fr 0fr", "collapse → fixed 1fr/0fr");

  const col0 = grid.children[0];
  assert.equal(col0.kind === "element" && col0.tag, "div");
  if (col0.kind !== "element") return;
  assert.equal(col0.children.length, 1, "one block wrapper in column 0");
  // Each block is wrapped in a width-controlling div (fill/wrap); the component
  // root nests inside it. See wrapBlockWidth.
  const wrap = col0.children[0];
  assert.equal(wrap.kind === "element" && wrap.tag, "div");
  if (wrap.kind !== "element") return;
  // Hero lives in row 0 → column 0 → child 0.
  const heroId = rowColumns(sectionRows(t[0])[0])[0].children![0].id;
  assert.equal(wrap.props["data-block-wrap"], heroId);
  assert.equal(wrap.children[0].kind === "element" && wrap.children[0].tag, "h1");
});

// Patch a row's columnBehavior (rows own the column props now). PURE local helper.
function setRowBehavior(blocks: Block[], rowId: string, behavior: string): Block[] {
  const walk = (list: Block[]): Block[] =>
    list.map((b) =>
      b.id === rowId
        ? { ...b, props: { ...b.props, columnBehavior: behavior } }
        : b.children
          ? { ...b, children: walk(b.children) }
          : b,
    );
  return walk(blocks);
}

test("planPage collapse behavior shrinks empty columns to 0fr", () => {
  let t = addSection([]);
  const sid = t[0].id;
  t = setSectionColumns(t, sid, 2);
  t = addComponentToColumn(t, sid, 0, "Hero");
  // mark collapse on the ROW (rows own column props now)
  t = setRowBehavior(t, sectionRows(t[0])[0].id, "collapse");
  const hero: ComponentArtifact = { name: "Hero", tree: { tag: "h1", children: ["Hi"] } };
  const plan = planPage(t, new Map([["Hero", hero]]));
  const grid = firstRowGrid(plan.root[0]);
  const style = grid.props.style as Record<string, unknown>;
  assert.equal(style.gridTemplateColumns, "1fr 0fr", "filled col 1fr, empty col 0fr");
});

test("planPage honors a row's background, vertical align, and padding", () => {
  let t = addSection([]);
  const sid = t[0].id;
  t = addComponentToColumn(t, sid, 0, "Hero");
  // Patch the (implicit→explicit is not needed; grandfathered row is the section
  // here) — use an explicit row so row props live on a __section_row__.
  t = addRow(t, sid); // migrates to explicit rows; row 0 keeps the Hero
  const row0 = sectionRows(t[0])[0];
  t = setRowBehavior(t, row0.id, "equal"); // no-op behavior, just reach the row
  // Set background + valign + padding directly on the row props.
  t = t.map((s) =>
    s.id === sid
      ? {
          ...s,
          children: (s.children ?? []).map((r) =>
            r.id === row0.id
              ? { ...r, props: { ...r.props, backgroundColor: "var(--color-surface-muted)", verticalAlign: "center", paddingTop: 2, paddingTopUnit: "rem" } }
              : r,
          ),
        }
      : s,
  );
  const hero: ComponentArtifact = { name: "Hero", tree: { tag: "h1", children: ["Hi"] } };
  const grid = firstRowGrid(planPage(t, new Map([["Hero", hero]])).root[0]);
  const style = grid.props.style as Record<string, unknown>;
  assert.equal(style.backgroundColor, "var(--color-surface-muted)", "row band painted");
  assert.equal(style.paddingTop, "2rem", "row padding applied with its unit");
  // vertical align flows into each column cell (alignItems center).
  const col0 = grid.children[0];
  if (col0.kind !== "element") throw new Error("col not element");
  assert.equal((col0.props.style as Record<string, unknown>).alignItems, "center");
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
  // grow to 3 — columns route to the (first) row; gap stays on the section.
  t = mergeSectionProps(t, s, { columns: 3, gap: 8 });
  assert.equal(sectionRows(t[0])[0].props?.columns, 3);
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

test("moveNode never nests a Section into a column or beside an inner component", () => {
  // [S1, S2]; S2 has a component so a section-drag over S2's body targets a
  // column ('into') or the inner component ('after') — both must be no-ops, else
  // the dragged section vanishes into a column and renders at the bottom.
  let t = addSection(addSection([]));
  const s1 = t[0].id;
  const s2 = t[1].id;
  t = addComponentToColumn(t, s2, 0, "Card");
  const col = sectionColumns(t.find((s) => s.id === s2)!)[0];
  const card = col.children![0];
  // 'into' a column → rejected (section stays a top-level sibling)
  assert.deepEqual(moveNode(t, s1, col.id, "into"), t);
  // 'after' a component that lives inside a section → rejected (not a root section)
  assert.deepEqual(moveNode(t, s1, card.id, "after"), t);
  // …but reordering beside the OTHER root section still works.
  const r = moveNode(t, s1, s2, "after");
  assert.deepEqual(r.map((s) => s.id), [s2, s1]);
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

test("sectionName: falls back to 'Section N' (1-based) when unnamed", () => {
  const t = addSection([]);
  assert.equal(sectionName(t[0], 0), "Section 1");
  assert.equal(sectionName(t[0], 2), "Section 3");
});

test("sectionName: uses props.name when set (trimmed)", () => {
  const base = addSection([]);
  const named = renameSection(base, base[0].id, "  Hero  ");
  assert.equal(sectionName(named[0], 0), "Hero");
});

test("listSections: returns {id,name} in order with defaults + custom names", () => {
  let blocks = addSection(addSection([])); // two sections
  blocks = renameSection(blocks, blocks[0].id, "Intro");
  const list = listSections(blocks);
  assert.equal(list.length, 2);
  assert.equal(list[0].name, "Intro");
  assert.equal(list[1].name, "Section 2");
  assert.equal(list[0].id, blocks[0].id);
});

test("renameSection: blank name clears back to the default", () => {
  const b = addSection([]);
  const named = renameSection(b, b[0].id, "Hero");
  const cleared = renameSection(named, b[0].id, "   ");
  assert.equal(cleared[0].props?.name, undefined);
  assert.equal(sectionName(cleared[0], 0), "Section 1");
});

test("renameSection: does not mutate the input", () => {
  const b = addSection([]);
  const before = JSON.stringify(b);
  renameSection(b, b[0].id, "Hero");
  assert.equal(JSON.stringify(b), before);
});

// ── Multi-row sections + grandfathering ─────────────────────────────────────

/** A LEGACY (pre-rows) section: columns DIRECTLY under the Section, no row layer. */
function legacySection(id: string, columns: number): Block {
  const cols: Block[] = [];
  for (let i = 0; i < columns; i++) {
    cols.push({ id: `${id}-c${i}`, component: SECTION_COLUMN_COMPONENT, children: [] });
  }
  return { id, component: SECTION_COMPONENT, props: { name: "Legacy", columns }, children: cols };
}

test("grandfathered section: sectionRows treats a column-direct section as one row", () => {
  const s = legacySection("s1", 3);
  const rows = sectionRows(s);
  assert.equal(rows.length, 1, "one implicit row");
  assert.equal(rows[0].id, "s1", "the section itself acts as the row");
  assert.equal(rowColumns(rows[0]).length, 3, "its columns resolve through the row");
  assert.equal(sectionColumns(s).length, 3, "flattened columns unchanged");
  // The implicit row's grid reads the section's own legacy `columns` prop.
  assert.equal(rowGridCols(s), "repeat(3, 1fr)");
});

test("addRow migrates a grandfathered section to explicit rows, then appends", () => {
  let t = [legacySection("s1", 2)];
  t = addComponentToColumn(t, "s1", 0, "Hero"); // content in the legacy row
  t = addRow(t, "s1", 3); // second row with 3 columns
  const rows = sectionRows(t[0]);
  assert.equal(rows.length, 2, "now two explicit rows");
  assert.ok(rows.every(isSectionRow), "both are __section_row__ blocks");
  // Row 1 kept the original 2 columns + the Hero content.
  assert.equal(rowColumns(rows[0]).length, 2);
  assert.equal(rowColumns(rows[0])[0].children?.[0]?.component, "Hero", "content preserved");
  // Row 2 is the fresh 3-column row.
  assert.equal(rows[1].props?.columns, 3);
  assert.equal(rowColumns(rows[1]).length, 3);
  // The section no longer carries the legacy column props.
  assert.equal(t[0].props?.columns, undefined);
});

test("setSectionColumns targets a specific row via rowId; rows stay independent", () => {
  let t = addSection([]);
  const sid = t[0].id;
  t = addRow(t, sid, 1); // two rows now
  const [r0, r1] = sectionRows(t[0]);
  t = setSectionColumns(t, sid, 4, r0.id);
  t = setSectionColumns(t, sid, 2, r1.id);
  const rows = sectionRows(t[0]);
  assert.equal(rowColumns(rows[0]).length, 4, "row 0 → 4 cols");
  assert.equal(rowColumns(rows[1]).length, 2, "row 1 → 2 cols, independent");
});

test("deleteRow keeps ≥1 row and drops the row's content", () => {
  let t = addSection([]);
  const sid = t[0].id;
  t = addRow(t, sid);
  const [r0, r1] = sectionRows(t[0]);
  const afterOne = deleteRow(t, r1.id);
  assert.equal(sectionRows(afterOne[0]).length, 1, "one row removed");
  // Deleting the last remaining row is a no-op (delete the section instead).
  assert.deepEqual(deleteRow(afterOne, r0.id), afterOne, "can't delete the last row");
});

test("moveNode reorders rows only within their section", () => {
  let t = addSection([]);
  const sid = t[0].id;
  t = addRow(t, sid);
  t = addRow(t, sid); // three rows
  const [r0, r1, r2] = sectionRows(t[0]);
  // reorder r2 before r0 within the section
  const r = moveNode(t, r2.id, r0.id, "before");
  assert.deepEqual(sectionRows(r[0]).map((x) => x.id), [r2.id, r0.id, r1.id]);
  // a row can't be dropped INTO a column, nor moved into another section
  const two = addSection(t); // a second section
  const otherRow = sectionRows(two[1])[0];
  assert.deepEqual(moveNode(two, r0.id, otherRow.id, "before"), clone(two),
    "cross-section row move rejected");

  function clone(b: Block[]): Block[] {
    return JSON.parse(JSON.stringify(b));
  }
});

test("normalizeSectionColumns wraps a stray component under a ROW into a column", () => {
  // A hand-authored/AI tree: component sits directly under a row (should be in a column).
  const tree: Block[] = [
    {
      id: "s1",
      component: SECTION_COMPONENT,
      props: { name: "X" },
      children: [
        {
          id: "r1",
          component: SECTION_ROW_COMPONENT,
          props: { columns: 1 },
          children: [{ id: "hero1", component: "Hero" }],
        },
      ],
    },
  ];
  const fixed = normalizeSectionColumns(tree);
  const row = sectionRows(fixed[0])[0];
  const cols = rowColumns(row);
  assert.equal(cols.length, 1, "stray component wrapped into a column");
  assert.equal(cols[0].children?.[0]?.id, "hero1", "component preserved inside the column");
});
