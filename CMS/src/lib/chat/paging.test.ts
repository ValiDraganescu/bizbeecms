/**
 * Shared lister paging (node --test; no @/ imports): arg coercion + the paged
 * result shape every list-a-resource tool returns.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { coercePageArgs, pagedResult } from "./paging.ts";

test("coercePageArgs: defaults when args missing/garbage", () => {
  assert.deepEqual(coercePageArgs(undefined), { limit: 20, offset: 0 });
  assert.deepEqual(coercePageArgs(null), { limit: 20, offset: 0 });
  assert.deepEqual(coercePageArgs({}), { limit: 20, offset: 0 });
  assert.deepEqual(coercePageArgs({ limit: "abc", offset: {} }), { limit: 20, offset: 0 });
  assert.deepEqual(coercePageArgs({ limit: 0, offset: -3 }), { limit: 20, offset: 0 });
});

test("coercePageArgs: numbers + numeric strings accepted, limit clamped to max", () => {
  assert.deepEqual(coercePageArgs({ limit: 5, offset: 10 }), { limit: 5, offset: 10 });
  assert.deepEqual(coercePageArgs({ limit: "7", offset: "3" }), { limit: 7, offset: 3 });
  assert.deepEqual(coercePageArgs({ limit: 9999 }), { limit: 100, offset: 0 });
  assert.deepEqual(coercePageArgs({ limit: 500 }, 50, 200), { limit: 200, offset: 0 });
  assert.deepEqual(coercePageArgs({}, 50, 200), { limit: 50, offset: 0 });
  assert.deepEqual(coercePageArgs({ limit: 4.9, offset: 2.9 }), { limit: 4, offset: 2 });
});

test("pagedResult: first page carries total + a more-available hint", () => {
  const rows = Array.from({ length: 50 }, (_, i) => i);
  const res = pagedResult("things", rows, { limit: 20, offset: 0 });
  assert.equal(res.ok, true);
  assert.deepEqual(res.things, rows.slice(0, 20));
  assert.equal(res.total, 50);
  assert.equal(res.limit, 20);
  assert.equal(res.offset, 0);
  assert.equal(res.hint, "showing 20 of 50 — more available; call again with offset=20");
});

test("pagedResult: last page has no hint", () => {
  const rows = Array.from({ length: 50 }, (_, i) => i);
  const res = pagedResult("things", rows, { limit: 20, offset: 40 });
  assert.deepEqual(res.things, rows.slice(40));
  assert.equal(res.total, 50);
  assert.equal("hint" in res, false);
});

test("pagedResult: offset past the end self-corrects", () => {
  const res = pagedResult("things", [1, 2, 3], { limit: 20, offset: 10 });
  assert.deepEqual(res.things, []);
  assert.equal(res.total, 3);
  assert.equal(res.hint, "offset 10 is past the end (total 3) — use an offset below 3");
});

test("pagedResult: empty store — no hint, total 0", () => {
  const res = pagedResult("things", [], { limit: 20, offset: 0 });
  assert.deepEqual(res.things, []);
  assert.equal(res.total, 0);
  assert.equal("hint" in res, false);
});
