/**
 * page-builder-ux — pure tests for the resizable inspector geometry. Runs under
 * `node --test`; inspector-width.ts is runtime dep-free (localStorage helpers
 * are guarded and not exercised here).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INSPECTOR_DEFAULT_W,
  INSPECTOR_MIN_W,
  CANVAS_MIN_W,
  resolvePreset,
  inspectorWidth,
} from "./inspector-width.ts";

const EDITOR = 1440;

test("resolvePreset accepts the three presets, defaults otherwise", () => {
  assert.equal(resolvePreset("default"), "default");
  assert.equal(resolvePreset("quarter"), "quarter");
  assert.equal(resolvePreset("half"), "half");
  assert.equal(resolvePreset("bogus"), "default");
  assert.equal(resolvePreset(null), "default");
  assert.equal(resolvePreset(undefined), "default");
});

test("default preset is the fixed 320px width", () => {
  assert.equal(inspectorWidth("default", EDITOR), INSPECTOR_DEFAULT_W);
});

test("quarter / half scale with editor width", () => {
  assert.equal(inspectorWidth("quarter", EDITOR), 360); // 25% of 1440
  assert.equal(inspectorWidth("half", EDITOR), 720); // 50% of 1440
});

test("canvas keeps its minimum — inspector never eats the whole editor", () => {
  // On a narrow editor, half would be 350 but canvas-min (360) caps it.
  const narrow = 700;
  const w = inspectorWidth("half", narrow);
  assert.ok(w <= narrow - CANVAS_MIN_W || w === INSPECTOR_MIN_W);
  assert.ok(narrow - w >= CANVAS_MIN_W || w === INSPECTOR_MIN_W);
});

test("inspector never goes below its minimum", () => {
  assert.ok(inspectorWidth("half", 200) >= INSPECTOR_MIN_W);
  assert.ok(inspectorWidth("quarter", 100) >= INSPECTOR_MIN_W);
});

test("unknown editor width falls back to the default width", () => {
  assert.equal(inspectorWidth("half", 0), INSPECTOR_DEFAULT_W);
  assert.equal(inspectorWidth("quarter", -5), INSPECTOR_DEFAULT_W);
  assert.equal(inspectorWidth("half", NaN), INSPECTOR_DEFAULT_W);
});
