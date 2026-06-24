import { strict as assert } from "node:assert";
import { test } from "node:test";
import { nextTabStop } from "./focus-trap.ts";

test("forward advances", () => {
  assert.equal(nextTabStop(4, 1, false), 2);
});

test("forward wraps last → first", () => {
  assert.equal(nextTabStop(4, 3, false), 0);
});

test("backward retreats", () => {
  assert.equal(nextTabStop(4, 2, true), 1);
});

test("backward wraps first → last", () => {
  assert.equal(nextTabStop(4, 0, true), 3);
});

test("focus outside lands on first (forward) / last (backward)", () => {
  assert.equal(nextTabStop(4, -1, false), 0);
  assert.equal(nextTabStop(4, -1, true), 3);
});

test("no focusables → -1", () => {
  assert.equal(nextTabStop(0, -1, false), -1);
});
