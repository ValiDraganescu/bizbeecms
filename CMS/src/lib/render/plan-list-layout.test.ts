import { test } from "node:test";
import assert from "node:assert/strict";
import { planList } from "./plan-list.ts";
import { type Block, type ElementPlan } from "./plan-types.ts";

// A trivial planBlock: each stamped row becomes a <span> so we can count them.
const planBlock = (b: Block): ElementPlan => ({
  kind: "element",
  tag: "span",
  props: { "data-tpl": b.component },
  children: [],
});

function listBlock(source: Partial<Block["listSource"]> = {}, rowCount = 3): Block {
  return {
    id: "L1",
    component: "List",
    children: [{ id: "t", component: "Card", listRole: "template" }],
    listRows: Array.from({ length: rowCount }, (_, i) => ({ id: String(i) })),
    listSource: { collection: "content_x", ...source } as Block["listSource"],
  };
}

// Narrow to an element plan (all our list wrappers/tracks are elements).
function el(p: ElementPlan): Extract<ElementPlan, { kind: "element" }> {
  assert.equal(p.kind, "element");
  return p as Extract<ElementPlan, { kind: "element" }>;
}
const style = (p: ElementPlan) =>
  (el(p).props as { style?: Record<string, unknown> }).style ?? {};

test("default (no layout) → bare div, no style", () => {
  const p = el(planList(listBlock(), planBlock));
  assert.equal(p.tag, "div");
  assert.equal((p.props as Record<string, unknown>).style, undefined);
  assert.equal(p.children.length, 3);
});

test("vertical + maxSize → flex column, capped height, scrolls Y", () => {
  const s = style(planList(listBlock({ maxSize: 400 }), planBlock));
  assert.equal(s.flexDirection, "column");
  assert.equal(s.maxHeight, "400px");
  assert.equal(s.overflowY, "auto");
});

test("horizontal → flex row scrolling X; maxSize caps width", () => {
  const s = style(planList(listBlock({ direction: "horizontal", maxSize: 600 }), planBlock));
  assert.equal(s.flexDirection, "row");
  assert.equal(s.overflowX, "auto");
  assert.equal(s.maxWidth, "600px");
});

test("grid → N-column grid; maxSize caps HEIGHT (not width)", () => {
  const s = style(planList(listBlock({ direction: "grid", columns: 3, maxSize: 500 }), planBlock));
  assert.equal(s.display, "grid");
  assert.equal(s["--pb-cols"], 3);
  // grid-template-columns is NOT inline — it lives in .pb-list-grid so @media can win.
  assert.equal(s.gridTemplateColumns, undefined);
  assert.equal(s.maxHeight, "500px");
});

test("grid columns clamps to >= 1", () => {
  const s = style(planList(listBlock({ direction: "grid", columns: 0 }), planBlock));
  assert.equal(s["--pb-cols"], 1);
});

test("grid never sets grid-template-columns inline (inline would beat @media)", () => {
  // Regression: an inline grid-template-columns won over the responsive @media
  // rules, so mobile/tablet column counts never applied in the preview frame.
  const s = style(planList(listBlock({ direction: "grid", columns: 2, columnsMobile: 1 }), planBlock));
  assert.equal(s.gridTemplateColumns, undefined);
  assert.equal(s["--pb-cols"], 2);
  assert.equal(s["--pb-cols-mobile"], 1);
});

test("gap applies in px on every direction", () => {
  assert.equal(style(planList(listBlock({ gap: 24 }), planBlock)).gap, "24px");
  assert.equal(style(planList(listBlock({ direction: "grid", gap: 8 }), planBlock)).gap, "8px");
  assert.equal(
    style(planList(listBlock({ direction: "horizontal", gap: 12 }), planBlock)).gap,
    "12px",
  );
});

test("responsive grid → per-breakpoint column vars + the grid class", () => {
  const p = el(
    planList(
      listBlock({ direction: "grid", columns: 4, columnsTablet: 2, columnsMobile: 1 }),
      planBlock,
    ),
  );
  const s = style(p);
  assert.equal(s["--pb-cols"], 4);
  assert.equal(s["--pb-cols-tablet"], 2);
  assert.equal(s["--pb-cols-mobile"], 1);
  assert.equal((p.props as Record<string, unknown>).className, "pb-list-grid");
});

test("grid with no responsive overrides → only the desktop var (media rules fall back)", () => {
  const s = style(planList(listBlock({ direction: "grid", columns: 3 }), planBlock));
  assert.equal(s["--pb-cols"], 3);
  assert.equal(s["--pb-cols-tablet"], undefined);
  assert.equal(s["--pb-cols-mobile"], undefined);
});

test("autoscroll → duplicated aria-hidden track + data attrs; ships asset once", () => {
  let used = 0;
  const p = el(planList(
    listBlock({ direction: "grid", columns: 2, autoscroll: true, autoscrollSpeed: "fast" }),
    planBlock,
    undefined,
    () => used++,
  ));
  assert.equal(used, 1);
  assert.equal((p.props as Record<string, unknown>)["data-list-autoscroll"], "");
  assert.equal((p.props as Record<string, unknown>)["data-list-speed"], "fast");
  // Two tracks: visible + aria-hidden clone, each carrying the grid layout.
  assert.equal(p.children.length, 2);
  const clone = el(p.children[1]);
  assert.equal((clone.props as Record<string, unknown>)["aria-hidden"], "true");
  assert.equal(style(clone).display, "grid");
  assert.equal(clone.children.length, 3);
});

test("autoscroll with zero rows → no track duplication, no asset", () => {
  let used = 0;
  const empty = { ...listBlock({ autoscroll: true }), listRows: [] };
  const p = el(planList(empty, planBlock, undefined, () => used++));
  assert.equal(used, 0);
  assert.equal((p.props as Record<string, unknown>)["data-list-autoscroll"], undefined);
});
