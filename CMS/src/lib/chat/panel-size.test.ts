/**
 * ai-widget-ux — pure tests for the resizable panel geometry. Runs under
 * `node --test`; panel-size.ts is runtime dep-free (localStorage helpers are
 * only exercised indirectly and guarded, not called here).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PANEL_MIN_W,
  PANEL_MIN_H,
  defaultSize,
  halfSize,
  clamp,
  resolveSize,
  nextPreset,
  isLarge,
  sizeFromDrag,
} from "./panel-size.ts";

const VW = 1440;
const VH = 900;

test("default preset matches legacy compact bounds", () => {
  const d = defaultSize(VW, VH);
  assert.equal(d.width, 380); // min(380, 92% of 1440)
  assert.equal(d.height, 560); // min(560, 70% of 900 = 630)
});

test("half preset is ~half viewport, clamped", () => {
  const h = halfSize(VW, VH);
  assert.equal(h.width, 720); // 50% of 1440
  assert.equal(h.height, 720); // 80% of 900
});

test("clamp never goes below the minimums, never overflows viewport", () => {
  const tiny = clamp(10, 10, 400, 500);
  assert.equal(tiny.width, PANEL_MIN_W);
  assert.equal(tiny.height, PANEL_MIN_H);

  const huge = clamp(99999, 99999, 1000, 800);
  assert.equal(huge.width, 1000 - 32);
  assert.equal(huge.height, 800 - 32);
});

test("clamp on a tiny viewport keeps min size (panel can't vanish)", () => {
  const c = clamp(380, 560, 320, 300);
  assert.equal(c.width, PANEL_MIN_W);
  assert.equal(c.height, PANEL_MIN_H);
});

test("resolveSize: stored custom restored & clamped to current viewport", () => {
  // dragged big on a wide screen, restored on a narrow one
  const r = resolveSize("custom", { width: 900, height: 700 }, 700, 600);
  assert.equal(r.preset, "custom");
  assert.equal(r.width, 700 - 32);
  assert.equal(r.height, 600 - 32);
});

test("resolveSize: half preset ignores stored px", () => {
  const r = resolveSize("half", { width: 999, height: 999 }, VW, VH);
  assert.equal(r.width, 720);
  assert.equal(r.height, 720);
});

test("resolveSize: default when no stored / unknown", () => {
  const r = resolveSize("default", null, VW, VH);
  assert.equal(r.width, 380);
  assert.equal(r.height, 560);
});

test("nextPreset toggles default<->half by raw preset (no isLarge given)", () => {
  assert.equal(nextPreset("default"), "half");
  assert.equal(nextPreset("half"), "default");
  // legacy bug: bare custom defaulted to "half" (never shrank) — kept for the
  // no-isLarge call path, but the widget always passes isLarge now.
  assert.equal(nextPreset("custom"), "half");
});

test("nextPreset honours isLarge so the expand toggle is a true 2-state cycle", () => {
  // A custom (free-dragged) size that's currently LARGE must shrink to default.
  assert.equal(nextPreset("custom", true), "default");
  // A custom size that's small must enlarge to half.
  assert.equal(nextPreset("custom", false), "half");
  // Even a "half" preset reads enlarged → shrinks; a small preset enlarges.
  assert.equal(nextPreset("half", true), "default");
  assert.equal(nextPreset("default", false), "half");
});

test("isLarge: default size reads small, half/dragged reads large", () => {
  // The compact default is NOT large (within tolerance).
  assert.equal(isLarge(defaultSize(VW, VH), VW, VH), false);
  // Half preset is clearly larger than default.
  assert.equal(isLarge(halfSize(VW, VH), VW, VH), true);
  // A custom drag a touch above default+tol reads large (drives the toggle back).
  assert.equal(isLarge({ width: 380 + 9 }, VW, VH), true);
  // Within tolerance still reads small.
  assert.equal(isLarge({ width: 380 + 4 }, VW, VH), false);
});

test("sizeFromDrag: drag left/up grows (panel anchored bottom-right)", () => {
  const start = { width: 400, height: 500 };
  // cursor moves 100px left + 80px up → width +100, height +80
  const r = sizeFromDrag(start, -100, -80, VW, VH);
  assert.equal(r.width, 500);
  assert.equal(r.height, 580);
});

test("sizeFromDrag: drag right/down shrinks, clamped to minimums", () => {
  const start = { width: 320, height: 340 };
  const r = sizeFromDrag(start, 200, 200, VW, VH);
  assert.equal(r.width, PANEL_MIN_W); // 320-200=120 → min 300
  assert.equal(r.height, PANEL_MIN_H); // 340-200=140 → min 320
});

test("sizeFromDrag: single-axis (edge handle passes 0 on the other axis)", () => {
  const start = { width: 400, height: 500 };
  const r = sizeFromDrag(start, -50, 0, VW, VH);
  assert.equal(r.width, 450);
  assert.equal(r.height, 500);
});

test("sizeFromDrag: clamped to viewport so a huge drag can't overflow", () => {
  const start = { width: 400, height: 500 };
  const r = sizeFromDrag(start, -99999, -99999, 1000, 800);
  assert.equal(r.width, 1000 - 32);
  assert.equal(r.height, 800 - 32);
});

// Regression for the one-way toggle bug: expand → (mouseup captures custom) →
// click again must SHRINK, not re-expand. Simulate the captured custom state.
test("expand toggle cycle survives a custom re-capture (one-way bug regression)", () => {
  // Start compact.
  let preset = nextPreset("default", isLarge(defaultSize(VW, VH), VW, VH));
  assert.equal(preset, "half"); // grew
  const grown = halfSize(VW, VH);
  // Native resize fires onMouseUp → state becomes "custom" at the grown size.
  // Next click must shrink because the panel is currently large.
  preset = nextPreset("custom", isLarge(grown, VW, VH));
  assert.equal(preset, "default"); // shrank — bug would have returned "half"
});
