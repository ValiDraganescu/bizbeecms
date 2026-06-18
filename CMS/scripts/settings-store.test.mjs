/**
 * Unit test for a CMS module (`getContentLocales` / `setContentLocales` in
 * `src/db/settings-store.ts`) driven against a MOCKED `Db` port
 * (binding-adapters subgoal). Same payoff as `page-store.test.mjs`: real
 * per-Site settings logic runs with NO Workers runtime and NO live D1 — the
 * store's `injectedDb` seam takes a drizzle client built (via the REAL `cfDb`
 * adapter) over an in-memory SQLite standing in for the `DB` binding.
 *
 * What's under test is the settings module's REAL logic, not "the db was
 * called":
 *  - the upsert is key-keyed: setting twice updates the SAME row, never a dup;
 *  - the get/set JSON round-trip stores normalized JSON and reads it back;
 *  - the defensive read path: a present-but-garbage `value` (bad JSON, or a
 *    non-object) falls back to the SAFE default instead of throwing.
 * Assertions check the persisted row and the returned config; expected shapes
 * come from the REAL `normalizeContentLocales`/`defaultContentLocales` (not
 * hardcoded), so a regression in either the store or the normalizer is caught.
 *
 * dep-free node --test; the real `.ts` store is imported via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import {
  getContentLocales,
  setContentLocales,
} from "../src/db/settings-store.ts";
import { cfDb } from "../src/lib/ports/db.ts";
import {
  defaultContentLocales,
  normalizeContentLocales,
} from "../src/lib/render/localize.ts";

// Real `site_settings` DDL (from migrations/0001_easy_namor.sql). Inline to keep
// the test dep-free; if the table changes, the store queries change too and
// these tests would catch a mismatch.
const SETTINGS_DDL = `
CREATE TABLE site_settings (
  key text PRIMARY KEY NOT NULL,
  value text DEFAULT '{}' NOT NULL,
  updated_at integer DEFAULT (unixepoch() * 1000) NOT NULL
);
`;

/**
 * A D1Database-shaped binding backed by in-memory node:sqlite — exactly the
 * surface drizzle-orm/d1 drives: prepare(sql) → {bind(...p)} → {run,all,raw}.
 * Real SQL, real storage. `raw()` returns rows-as-arrays (drizzle selects),
 * `all()` returns `{results}` objects, `run()` the write meta.
 */
function fakeD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(SETTINGS_DDL);
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

/** Read the raw stored rows straight from sqlite (bypasses the store). */
function rows(db) {
  return db.sqlite.prepare("SELECT * FROM site_settings").all();
}

test("getContentLocales returns the SAFE default when nothing is stored", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1);

  const got = await getContentLocales(db);

  assert.deepEqual(got, defaultContentLocales());
  assert.equal(rows(d1).length, 0, "a read must not write anything");
});

test("setContentLocales normalizes, persists JSON, and getContentLocales reads it back", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1);

  const input = { default: "fi", locales: ["en", "fi", "et"] };
  const expected = normalizeContentLocales(input);

  const returned = await setContentLocales(input, db);
  assert.deepEqual(returned, expected, "setter returns the normalized config");

  // The persisted value is the normalized JSON under the content_locales key.
  const all = rows(d1);
  assert.equal(all.length, 1);
  assert.equal(all[0].key, "content_locales");
  assert.deepEqual(JSON.parse(all[0].value), expected);

  // And the round-trip read yields the same config.
  const got = await getContentLocales(db);
  assert.deepEqual(got, expected);
});

test("setContentLocales UPDATES the same key in place (no duplicate row)", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1);

  await setContentLocales({ default: "en", locales: ["en"] }, db);
  await setContentLocales({ default: "et", locales: ["en", "et"] }, db);

  const all = rows(d1);
  assert.equal(all.length, 1, "same key updates in place, not a second row");

  const got = await getContentLocales(db);
  assert.deepEqual(got, normalizeContentLocales({ default: "et", locales: ["en", "et"] }));
});

test("getContentLocales falls back to the default on present-but-garbage JSON", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1);

  // Seed an invalid JSON string directly (bypassing the store's setter).
  d1.sqlite
    .prepare("INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)")
    .run("content_locales", "{not valid json", Date.now());

  const got = await getContentLocales(db);

  assert.deepEqual(got, defaultContentLocales(), "bad JSON must not throw — safe default");
});

test("getContentLocales falls back to the default on valid-JSON-but-wrong-shape", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1);

  // Valid JSON, but a non-object → normalizeContentLocales returns the default.
  d1.sqlite
    .prepare("INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)")
    .run("content_locales", JSON.stringify("just-a-string"), Date.now());

  const got = await getContentLocales(db);

  assert.deepEqual(got, defaultContentLocales());
});
