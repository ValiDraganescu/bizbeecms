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

test("nextPreset toggles default<->half; custom -> half", () => {
  assert.equal(nextPreset("default"), "half");
  assert.equal(nextPreset("half"), "default");
  assert.equal(nextPreset("custom"), "half");
});
