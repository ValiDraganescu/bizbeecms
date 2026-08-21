/**
 * verticalAlign "stretch" — equal-height repeated rows (epic: same-size cards).
 * The mapping, the column style, and the block-wrapper grow flag are pure.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { columnStyle, planColumn, wrapBlockWidth } from "./plan-section.ts";
import type { Block } from "./tree.ts";

const block = (over: Partial<Block> = {}): Block =>
  ({ id: "b1", component: "Card", ...over }) as Block;

test("columnStyle maps verticalAlign stretch for column overrides", () => {
  const style = columnStyle({ verticalAlign: "stretch" }, "flex-start", "flex-start");
  assert.equal(style.alignItems, "stretch");
});

test("wrapBlockWidth grows the wrapper only under stretch + fill", () => {
  const el = { kind: "element", tag: "div", props: {}, children: [] } as never;
  const style = (el2: unknown) =>
    (el2 as { props: { style: Record<string, unknown> } }).props.style;
  const grown = wrapBlockWidth(block(), el, true);
  assert.equal(style(grown).flexGrow, 1);

  const normal = wrapBlockWidth(block(), el, false);
  assert.equal("flexGrow" in style(normal), false);

  // width:"auto" blocks wrap to content — they never grow, even when stretched.
  const auto = wrapBlockWidth(block({ props: { width: "auto" } }), el, true);
  assert.equal("flexGrow" in style(auto), false);
});

test("planColumn under stretch alignment grows its wrapped children", () => {
  const col = block({
    id: "c1",
    component: "__section_column__",
    children: [block({ id: "x1" })],
  });
  const plan = planColumn(
    col,
    () => ({ kind: "element", tag: "div", props: {}, children: [] }) as never,
    "stretch",
    "flex-start",
  );
  const wrap = (plan as unknown as { children: { props: { style: Record<string, unknown> } }[] })
    .children[0];
  assert.equal(wrap.props.style.flexGrow, 1);
});
