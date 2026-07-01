/**
 * validateBindList — the combobox/presentation patch fields (the AI tool path).
 *
 * Regression for: the AI couldn't set a select's label expression because bind_list
 * had no parameter for it (it edited the wrong thing — update_component). These pin
 * that the combobox config now parses through bind_list and that bad enums reject.
 *
 * Relative `.ts` import — `node --test` can't resolve the `@/` alias (CAVEAT).
 * Run: node --test src/lib/chat/bind-list-combobox.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateBindList } from "./binding-tools.ts";

test("bind_list: combobox + label fields parse through (PATCH)", () => {
  const r = validateBindList({
    page: "p1",
    block: "b1",
    presentation: "combobox",
    select: "single",
    min: 1,
    max: 3,
    searchable: false,
    valueField: "id",
    labelField: "name",
    labelExpr: "`${name} · ${location}`",
    name: "picked",
    placeholder: "Choose…",
  });
  // labelExpr is stored as a bare template body — surrounding backticks stripped.
  assert.ok(r.ok);
  assert.equal(r.value.presentation, "combobox");
  assert.equal(r.value.select, "single");
  assert.equal(r.value.min, 1);
  assert.equal(r.value.max, 3);
  assert.equal(r.value.searchable, false);
  assert.equal(r.value.valueField, "id");
  assert.equal(r.value.labelField, "name");
  assert.equal(r.value.labelExpr, "${name} · ${location}");
  assert.equal(r.value.name, "picked");
  assert.equal(r.value.placeholder, "Choose…");
});

test("bind_list: a label-only patch carries just labelExpr (nothing else invented)", () => {
  const r = validateBindList({ page: "p1", block: "b1", labelExpr: "`${name}`" });
  assert.ok(r.ok);
  assert.equal(r.value.labelExpr, "${name}", "surrounding backticks stripped");
  assert.equal(r.value.presentation, undefined);
  assert.equal(r.value.select, undefined);
  assert.equal(r.value.collection, undefined);
});

test("bind_list: bad presentation / select enums are rejected with a reason", () => {
  const bad1 = validateBindList({ page: "p", block: "b", presentation: "grid" });
  assert.equal(bad1.ok, false);
  const bad2 = validateBindList({ page: "p", block: "b", select: "many" });
  assert.equal(bad2.ok, false);
});

test("bind_list: still requires page + block", () => {
  assert.equal(validateBindList({ block: "b" }).ok, false);
  assert.equal(validateBindList({ page: "p" }).ok, false);
});

test("bind_list: plain-list layout (grid + scroll + autoscroll) parses through", () => {
  const r = validateBindList({
    page: "p1",
    block: "b1",
    direction: "grid",
    columns: 3,
    maxSize: 480,
    autoscroll: true,
    autoscrollSpeed: "fast",
  });
  assert.ok(r.ok);
  assert.equal(r.value.direction, "grid");
  assert.equal(r.value.columns, 3);
  assert.equal(r.value.maxSize, 480);
  assert.equal(r.value.autoscroll, true);
  assert.equal(r.value.autoscrollSpeed, "fast");
});

test("bind_list: columns clamps to >= 1", () => {
  const r = validateBindList({ page: "p", block: "b", direction: "grid", columns: 0 });
  assert.ok(r.ok);
  assert.equal(r.value.columns, 1);
});

test("bind_list: per-screen columns + gap parse through", () => {
  const r = validateBindList({
    page: "p",
    block: "b",
    direction: "grid",
    columns: 4,
    columnsTablet: 2,
    columnsMobile: 1,
    gap: 16,
  });
  assert.ok(r.ok);
  assert.equal(r.value.columns, 4);
  assert.equal(r.value.columnsTablet, 2);
  assert.equal(r.value.columnsMobile, 1);
  assert.equal(r.value.gap, 16);
});

test("bind_list: gap clamps to >= 0, per-screen columns to >= 1", () => {
  const r = validateBindList({ page: "p", block: "b", gap: -5, columnsMobile: 0 });
  assert.ok(r.ok);
  assert.equal(r.value.gap, 0);
  assert.equal(r.value.columnsMobile, 1);
});

test("bind_list: bad direction / autoscrollSpeed enums are rejected", () => {
  assert.equal(validateBindList({ page: "p", block: "b", direction: "diagonal" }).ok, false);
  assert.equal(validateBindList({ page: "p", block: "b", autoscrollSpeed: "warp" }).ok, false);
});
