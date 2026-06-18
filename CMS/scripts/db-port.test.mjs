/**
 * Tests for the `Db` port + `cfDb` adapter (binding-adapters subgoal).
 * Dep-free node --test; imports the REAL .ts adapter via native type-stripping
 * (the `getDb` factory imports `@opennextjs/cloudflare` but only invokes it when
 * called, so importing the module under node is fine — we exercise `cfDb`).
 *
 * The adapter's contract is: given a D1 binding, hand back a drizzle client
 * bound to the REAL CMS schema, so queries compile to correct SQLite SQL and
 * bound params and dispatch through the D1 binding. We drive `cfDb` against an
 * in-memory fake D1 that records what `prepare`/`bind` actually receive, then
 * assert the real SQL drizzle emits for real-schema queries. That's the seam
 * earning its keep — not "was drizzle called", but the real schema → real SQL
 * → real binding wiring that callers depend on and that would break if the
 * adapter regressed (wrong table, no schema, raw binding).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { cfDb, schema } from "../src/lib/ports/db.ts";

/** In-memory fake D1Database: records every prepared SQL + bound params. */
function fakeD1() {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const stmt = { sql, params: [] };
      stmt.bind = (...p) => {
        stmt.params = p;
        return stmt;
      };
      stmt.all = async () => {
        calls.push({ sql: stmt.sql, params: stmt.params });
        return { results: [] };
      };
      stmt.run = async () => {
        calls.push({ sql: stmt.sql, params: stmt.params });
        return { results: [], meta: {} };
      };
      stmt.first = async () => {
        calls.push({ sql: stmt.sql, params: stmt.params });
        return null;
      };
      // drizzle-d1 uses `.raw()` for selects (returns rows as arrays).
      stmt.raw = async () => {
        calls.push({ sql: stmt.sql, params: stmt.params });
        return [];
      };
      return stmt;
    },
  };
}

test("cfDb returns a drizzle client wired to the real schema and D1 binding", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1);

  // A real-schema select with a where — what page-store actually does.
  await db.select().from(schema.page).where(eq(schema.page.slug, "home"));

  assert.equal(d1.calls.length, 1);
  const { sql, params } = d1.calls[0];
  // Hits the real "page" table (proves the schema is bound, not a bare client).
  assert.match(sql, /from "page"/);
  // Compiles the where into parameterised SQL (proves it's a working query path).
  assert.match(sql, /"page"\."slug"\s*=\s*\?/);
  assert.deepEqual(params, ["home"]);
});

test("cfDb compiles an insert against the real schema columns", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1);

  await db.insert(schema.page).values({ id: "p1", slug: "about" });

  assert.equal(d1.calls.length, 1);
  const { sql, params } = d1.calls[0];
  assert.match(sql, /insert into "page"/i);
  // Real columns + values flow through the binding as bound params.
  assert.ok(params.includes("p1"));
  assert.ok(params.includes("about"));
});
