import { test } from "node:test";
import assert from "node:assert/strict";
import { isVisuallyEmptyRect } from "./preview-overlay.ts";

// A jsonld component renders only a `display:none` placeholder, so its wrap box
// has zero area → it needs an injected builder chip. A real block has area → no chip.
test("isVisuallyEmptyRect: zero-area boxes (invisible blocks) need a chip", () => {
  assert.equal(isVisuallyEmptyRect({ width: 0, height: 0 }), true);
  assert.equal(isVisuallyEmptyRect({ width: 100, height: 0 }), true, "collapsed height");
  assert.equal(isVisuallyEmptyRect({ width: 0, height: 20 }), true, "collapsed width");
});

test("isVisuallyEmptyRect: real boxes are left alone", () => {
  assert.equal(isVisuallyEmptyRect({ width: 320, height: 48 }), false);
  assert.equal(isVisuallyEmptyRect({ width: 1, height: 1 }), false);
});

test("isVisuallyEmptyRect: degenerate rects count as empty (never inject on bad data)", () => {
  assert.equal(isVisuallyEmptyRect({ width: NaN, height: 10 }), true);
  assert.equal(isVisuallyEmptyRect({ width: -5, height: 10 }), true);
});
