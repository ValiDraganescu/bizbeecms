/**
 * Unit test for the `component-store.ts` CMS module driven against a MOCKED
 * `Db` port (binding-adapters subgoal). Same payoff as page-store.test.mjs:
 * real component-authoring/import business logic runs with NO Workers runtime
 * and NO live Cloudflare D1 — the store's `injectedDb` seam takes a drizzle
 * client built (via the REAL `cfDb` adapter) over an in-memory SQLite that
 * stands in for the D1 binding.
 *
 * What's under test is the store's REAL branching:
 *   - upsertComponent: insert-vs-update by the UNIQUE `name` (no duplicate row),
 *     and that the AI write path does NOT carry `props_schema` (stays NULL).
 *   - upsertImportedComponent: same insert-vs-update, but DOES persist
 *     `props_schema` (the import path carries it) and JSON-serializes the tree.
 *   - missingComponentNames: returns the subset of names absent from the table
 *     (inArray subset), empty-input short-circuit, all-present → [].
 *
 * Assertions check REAL behavior: the returned `{action,name}` and the persisted
 * row contents read straight from sqlite — NOT "the db was called". If the store
 * regressed (e.g. inserted a dup instead of updating, or dropped props_schema on
 * import), these fail.
 *
 * dep-free node --test; the real `.ts` store is imported via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import {
  upsertComponent,
  upsertImportedComponent,
  missingComponentNames,
} from "../src/db/component-store.ts";
import { cfDb } from "../src/lib/ports/db.ts";

// Real `component` table DDL (from migrations/0000_worried_nextwave.sql). The
// UNIQUE index on `name` is what makes the upsert-by-name branching real.
const COMPONENT_DDL = `
CREATE TABLE component (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  tree text DEFAULT '{}' NOT NULL,
  script text DEFAULT '' NOT NULL,
  css text DEFAULT '' NOT NULL,
  props_schema text,
  created_at integer DEFAULT (unixepoch() * 1000) NOT NULL,
  updated_at integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE UNIQUE INDEX component_name_unique ON component (name);
`;

/**
 * A D1Database-shaped binding backed by in-memory node:sqlite — the surface
 * drizzle-orm/d1 drives: prepare(sql) → {bind(...p)} → {run,all,raw}. Real SQL,
 * real storage. `raw()` returns rows-as-arrays in column order (drizzle selects),
 * `all()` returns `{results}`, `run()` the write meta. (Mirrors page-store.test.)
 */
function fakeD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(COMPONENT_DDL);
  return {
    sqlite,
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      const wrap = (params) => ({
        run: async () => {
          const r = stmt.run(...params);
          return { success: true, meta: { changes: r.changes }, results: [] };
        },
        all: async () => ({ success: true, results: stmt.all(...params) }),
        raw: async () => {
          const cols = stmt.columns().map((c) => c.name);
          return stmt.all(...params).map((row) => cols.map((c) => row[c]));
        },
        first: async () => stmt.get(...params) ?? null,
      });
      return { bind: (...params) => wrap(params), ...wrap([]) };
    },
  };
}

/** Fetch all component rows straight from sqlite (bypasses the store). */
function rows(d1) {
  return d1.sqlite.prepare("SELECT * FROM component").all();
}

function artifact(overrides = {}) {
  return {
    name: "Hero",
    tree: { tag: "section", props: {}, children: [] },
    script: "",
    css: "text-lg",
    ...overrides,
  };
}

function imported(overrides = {}) {
  return {
    name: "PricingCard",
    tree: { tag: "div", props: {}, children: [] },
    script: "console.log(1)",
    css: "p-4",
    propsSchema: '{"price":"number"}',
    ...overrides,
  };
}

test("upsertComponent CREATES a component and persists the real row (props_schema stays NULL)", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1);

  const res = await upsertComponent(artifact({ name: "Hero", css: "text-lg" }), db);

  assert.deepEqual(res, { action: "created", name: "Hero" });
  const all = rows(d1);
  assert.equal(all.length, 1);
  const r = all[0];
  assert.equal(r.name, "Hero");
  assert.equal(r.css, "text-lg");
  // The AI write path does NOT carry props_schema — it must remain NULL.
  assert.equal(r.props_schema, null);
  // tree is JSON-serialized before write.
  assert.deepEqual(JSON.parse(r.tree), { tag: "section", props: {}, children: [] });
  assert.ok(typeof r.id === "string" && r.id.length > 0);
});

test("upsertComponent UPDATES an existing name in place (no duplicate row)", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1);

  await upsertComponent(artifact({ name: "Hero", css: "text-lg" }), db);
  const firstId = rows(d1)[0].id;

  const res = await upsertComponent(artifact({ name: "Hero", css: "text-xl" }), db);

  assert.deepEqual(res, { action: "updated", name: "Hero" });
  const all = rows(d1);
  assert.equal(all.length, 1, "UNIQUE name → update in place, not a second row");
  assert.equal(all[0].id, firstId, "same row, not a new one");
  assert.equal(all[0].css, "text-xl", "the new value was written");
});

test("upsertImportedComponent CREATES and DOES persist props_schema (the import path carries it)", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1);

  const res = await upsertImportedComponent(
    imported({ name: "PricingCard", propsSchema: '{"price":"number"}' }),
    db,
  );

  assert.deepEqual(res, { action: "created", name: "PricingCard" });
  const all = rows(d1);
  assert.equal(all.length, 1);
  const r = all[0];
  assert.equal(r.name, "PricingCard");
  assert.equal(r.props_schema, '{"price":"number"}', "import path persists props_schema");
  assert.equal(r.script, "console.log(1)");
  assert.deepEqual(JSON.parse(r.tree), { tag: "div", props: {}, children: [] });
});

test("upsertImportedComponent UPDATES an existing name in place and rewrites props_schema", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1);

  await upsertImportedComponent(imported({ name: "PricingCard", propsSchema: '{"a":1}' }), db);
  const firstId = rows(d1)[0].id;

  const res = await upsertImportedComponent(
    imported({ name: "PricingCard", propsSchema: '{"b":2}', css: "m-8" }),
    db,
  );

  assert.deepEqual(res, { action: "updated", name: "PricingCard" });
  const all = rows(d1);
  assert.equal(all.length, 1, "update in place, not a duplicate");
  assert.equal(all[0].id, firstId, "same row");
  assert.equal(all[0].props_schema, '{"b":2}', "props_schema rewritten on update");
  assert.equal(all[0].css, "m-8");
});

test("a name can be authored by AI then re-imported: upsert keys on name, never duplicates", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1);

  await upsertComponent(artifact({ name: "Card" }), db); // AI write, props_schema NULL
  const res = await upsertImportedComponent(
    imported({ name: "Card", propsSchema: '{"x":1}' }),
    db,
  );

  assert.deepEqual(res, { action: "updated", name: "Card" });
  const all = rows(d1);
  assert.equal(all.length, 1, "same UNIQUE name → one row, updated");
  assert.equal(all[0].props_schema, '{"x":1}', "import filled in the previously-NULL props_schema");
});

test("missingComponentNames returns the subset absent from the table", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1);

  await upsertComponent(artifact({ name: "Hero" }), db);
  await upsertComponent(artifact({ name: "Footer" }), db);

  const missing = await missingComponentNames(["Hero", "Nav", "Footer", "Sidebar"], db);

  assert.deepEqual(missing, ["Nav", "Sidebar"], "only the names with no row are missing");
});

test("missingComponentNames returns [] when all names are present", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1);

  await upsertComponent(artifact({ name: "Hero" }), db);

  assert.deepEqual(await missingComponentNames(["Hero"], db), []);
});

test("missingComponentNames short-circuits on empty input (no query)", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1);

  assert.deepEqual(await missingComponentNames([], db), []);
});
