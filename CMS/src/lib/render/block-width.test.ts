/**
 * Per-block width wrapper (page-builder "fill column" vs "wrap content").
 *
 * Each component dropped into a Section column is wrapped in a width-controlling
 * div. `props.width` decides: "fill"/absent → width:100% + align-self:stretch;
 * "auto" → width:auto + max-width:100% so the column's content alignment positions
 * it. This pins the only branch in wrapBlockWidth.
 *
 * Relative `.ts` import — `node --test` can't resolve the `@/` alias (CAVEATS).
 * Run: node --test src/lib/render/block-width.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { wrapBlockWidth } from "./tree.ts";
import type { Block } from "./tree.ts";

const leaf = { kind: "element" as const, tag: "div", props: {}, children: [] };
const block = (props?: Record<string, unknown>): Block => ({
  id: "b1",
  component: "Hero",
  ...(props ? { props } : {}),
});

/** wrapBlockWidth always returns an element; narrow it for the assertions. */
function wrapEl(props?: Record<string, unknown>) {
  const w = wrapBlockWidth(block(props), leaf);
  assert.equal(w.kind, "element");
  if (w.kind !== "element") throw new Error("unreachable");
  return w;
}

test("default (no width prop) fills the column", () => {
  const w = wrapEl();
  assert.equal(w.tag, "div");
  assert.equal(w.props["data-block-wrap"], "b1");
  assert.deepEqual(w.props.style, { width: "100%", alignSelf: "stretch" });
  // The original element is nested unchanged.
  assert.deepEqual(w.children, [leaf]);
});

test("width:fill fills the column", () => {
  assert.deepEqual(wrapEl({ width: "fill" }).props.style, { width: "100%", alignSelf: "stretch" });
});

test("width:auto wraps to content", () => {
  assert.deepEqual(wrapEl({ width: "auto" }).props.style, {
    width: "auto",
    maxWidth: "100%",
    alignSelf: "auto",
  });
});

test("an unknown width value falls back to fill", () => {
  assert.deepEqual(wrapEl({ width: "weird" }).props.style, { width: "100%", alignSelf: "stretch" });
});

// --- per-block spacing (standard padding/margin controls on every block) ---

test("padding/margin sides emit only when set, rem default, per-side unit", () => {
  assert.deepEqual(wrapEl({ paddingTop: 2, marginBottom: 4, marginBottomUnit: "px" }).props.style, {
    width: "100%",
    alignSelf: "stretch",
    paddingTop: "2rem",
    marginBottom: "4px",
  });
});

test("a horizontal margin on a fill block drops width:100% (stretch subtracts margins)", () => {
  assert.deepEqual(wrapEl({ marginLeft: 1 }).props.style, {
    alignSelf: "stretch",
    marginLeft: "1rem",
  });
});

test("spacing applies to width:auto blocks too", () => {
  assert.deepEqual(wrapEl({ width: "auto", paddingLeft: 8, paddingLeftUnit: "px" }).props.style, {
    width: "auto",
    maxWidth: "100%",
    alignSelf: "auto",
    paddingLeft: "8px",
  });
});
