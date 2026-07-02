/**
 * Regression test: `contentSelectAll` must not silently truncate a collection
 * with more rows than `MAX_READ_ROWS` (the single-call cap). Plain
 * `contentSelect` on its own DOES cap at 1000 (by design, for ordinary app
 * reads) — this test proves the paging helper built for export/dry-run counts
 * gets every row instead.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { contentSelect, contentSelectAll, MAX_READ_ROWS, type D1Like } from "./content-db.ts";

/** A fake D1 whose `content_x` table has `total` rows, honoring LIMIT/OFFSET. */
function fakeD1(total: number): D1Like {
  return {
    prepare(sql: string) {
      const run = async () => {
        const limitMatch = sql.match(/LIMIT (\d+)/i);
        const offsetMatch = sql.match(/OFFSET (\d+)/i);
        const limit = limitMatch ? Number(limitMatch[1]) : total;
        const offset = offsetMatch ? Number(offsetMatch[1]) : 0;
        const results = [];
        for (let i = offset; i < Math.min(offset + limit, total); i++) {
          results.push({ id: String(i) });
        }
        return { results };
      };
      return { bind: () => ({ all: run, run: async () => ({}) }), all: run, run: async () => ({}) };
    },
    async exec() {
      return undefined;
    },
  };
}

test("contentSelect alone caps a >1000-row table at MAX_READ_ROWS", async () => {
  const db = fakeD1(2500);
  const rows = await contentSelect("SELECT * FROM content_big", [], db);
  assert.equal(rows.length, MAX_READ_ROWS);
});

test("contentSelectAll pages past the cap and returns every row", async () => {
  const db = fakeD1(2500);
  const rows = await contentSelectAll("SELECT * FROM content_big", db);
  assert.equal(rows.length, 2500);
  // spot-check no duplicates/gaps across the page boundary
  const ids = new Set(rows.map((r) => (r as { id: string }).id));
  assert.equal(ids.size, 2500);
});

test("contentSelectAll on a table under the cap does one page, no truncation", async () => {
  const db = fakeD1(3);
  const rows = await contentSelectAll("SELECT * FROM content_small", db);
  assert.equal(rows.length, 3);
});

test("contentSelectAll on an empty table returns []", async () => {
  const db = fakeD1(0);
  const rows = await contentSelectAll("SELECT * FROM content_empty", db);
  assert.deepEqual(rows, []);
});
