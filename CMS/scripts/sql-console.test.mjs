/**
 * content-collections (Phase-2): operator raw-SELECT console.
 *
 * Covers the NEW logic the /api/collections/sql route adds on top of the fence:
 *  1. columnsOf — the UI column-list union (pure).
 *  2. The route's safety contract: contentSelect runs the fence (read mode) BEFORE
 *     touching D1, so a console SELECT against a built-in table NEVER executes
 *     (no query reaches the fake D1) — this is what makes the console safe to ship.
 *
 * Run: node --test scripts/sql-console.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { columnsOf } from "../src/lib/content/result-shape.ts";
import { contentSelect } from "../src/lib/content/content-db.ts";

test("columnsOf: union of keys, first-seen order", () => {
  assert.deepEqual(columnsOf([]), []);
  assert.deepEqual(columnsOf([{ id: 1, slug: "a" }]), ["id", "slug"]);
  // sparse rows: later-row-only keys still surface, first row leads order
  assert.deepEqual(
    columnsOf([{ id: 1, slug: "a" }, { id: 2, title: "x" }]),
    ["id", "slug", "title"],
  );
});

// Fake D1 that records every statement it's asked to prepare/run.
function fakeD1(rows) {
  const prepared = [];
  return {
    prepared,
    prepare(sql) {
      prepared.push(sql);
      const result = { results: rows };
      return {
        bind: () => ({ all: async () => result, run: async () => ({ meta: {} }) }),
        all: async () => result,
        run: async () => ({ meta: {} }),
      };
    },
    exec: async () => {},
  };
}

test("console SELECT over content_* runs and returns rows", async () => {
  const db = fakeD1([{ id: 1, slug: "hello" }]);
  const rows = await contentSelect("SELECT id, slug FROM content_posts LIMIT 10", [], db);
  assert.deepEqual(rows, [{ id: 1, slug: "hello" }]);
  assert.equal(db.prepared.length, 1); // it reached D1
  assert.deepEqual(columnsOf(rows), ["id", "slug"]);
});

test("console SELECT against a built-in table is rejected BEFORE D1", async () => {
  const db = fakeD1([{ secret: 1 }]);
  await assert.rejects(
    () => contentSelect("SELECT * FROM page", [], db),
    /content fence rejected/,
  );
  assert.equal(db.prepared.length, 0); // the fence stopped it — D1 never saw it
});

test("console rejects a non-SELECT (mutation) on the read path", async () => {
  const db = fakeD1([]);
  await assert.rejects(
    () => contentSelect("DELETE FROM content_posts WHERE id = 1", [], db),
    /content fence rejected/,
  );
  assert.equal(db.prepared.length, 0);
});
