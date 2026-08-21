import { test } from "node:test";
import assert from "node:assert/strict";
import { findRepeatedRows, lintRepeatedRow, componentMarkupInfo } from "./lint-repeated-items.mjs";

const col = (comp) => ({ id: "c", component: "__section_column__", children: [{ id: "x", component: comp }] });
const section = (name, rows, props = {}) => ({
  id: "s1", component: "Section", props: { name, ...props }, children: rows,
});
const row = (id, cols, props = {}) => ({ id, component: "__section_row__", props, children: cols });

test("findRepeatedRows spots identical single-component columns and resolves vAlign", () => {
  const blocks = [
    section("Reviews", [row("r1", [col("ReviewQuote"), col("ReviewQuote"), col("ReviewQuote")], { verticalAlign: "stretch" })]),
    section("Mixed", [row("r2", [col("A"), col("B")])]),
    section("Inherit", [row("r3", [col("Card"), col("Card")])], { verticalAlign: "stretch" }),
  ];
  const found = findRepeatedRows(blocks);
  assert.deepEqual(found.map((f) => [f.rowId, f.component, f.count, f.effVAlign]), [
    ["r1", "ReviewQuote", 3, "stretch"],
    ["r3", "Card", 2, "stretch"],
  ]);
});

test("card-like repeats need stretch + h-full; text-only repeats are skipped", () => {
  const r = { sectionName: "S", rowId: "r1", component: "Card", count: 3, effVAlign: "top" };
  const cardInfo = { rootClass: "flex bg-surface border p-4", imgClasses: [] };
  const errors = lintRepeatedRow("/p", r, cardInfo);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /verticalAlign "stretch"/);
  assert.match(errors[1], /h-full/);

  const textInfo = { rootClass: "flex flex-col gap-2", imgClasses: [] };
  assert.deepEqual(lintRepeatedRow("/p", r, textInfo), []);

  const goodCard = { rootClass: "flex bg-surface h-full", imgClasses: [] };
  assert.deepEqual(lintRepeatedRow("/p", { ...r, effVAlign: "stretch" }, goodCard), []);
});

test("repeated images must pin size with object-cover + aspect/h", () => {
  const r = { sectionName: "S", rowId: "r1", component: "Img", count: 3, effVAlign: "top" };
  const bad = { rootClass: "", imgClasses: ["w-full object-cover", "w-full aspect-[4/3]"] };
  assert.equal(lintRepeatedRow("/p", r, bad).length, 2);
  const good = { rootClass: "", imgClasses: ["w-full aspect-[4/3] object-cover", "w-full h-full object-cover"] };
  assert.deepEqual(lintRepeatedRow("/p", r, good), []);
});

test("componentMarkupInfo reads tree and html kinds", () => {
  const tree = componentMarkupInfo({
    tree: { tag: "div", props: { className: "bg-x h-full" }, children: [
      { tag: "img", props: { className: "aspect-square object-cover" }, children: [] },
    ] },
  });
  assert.equal(tree.rootClass, "bg-x h-full");
  assert.deepEqual(tree.imgClasses, ["aspect-square object-cover"]);

  const html = componentMarkupInfo({ html: '<div class="border p-2"><img class="h-40 object-cover" src="x"></div>' });
  assert.equal(html.rootClass, "border p-2");
  assert.deepEqual(html.imgClasses, ["h-40 object-cover"]);
});
