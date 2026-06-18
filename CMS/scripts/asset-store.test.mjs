/**
 * Unit test for the asset-store CMS module (`src/db/asset-store.ts`) driven
 * against MOCKED ports (binding-adapters subgoal). asset-store is the one
 * business module that spans BOTH ports: it writes bytes through the `Storage`
 * (R2) port AND a metadata row through the `Db` (D1) port. This broadens the
 * proven seam coverage beyond D1 to R2.
 *
 * Both ports are injected: an in-memory fake `Storage` (a Map shaped like the
 * port — put/get/delete) and a real `cfDb` adapter over an in-memory `node:sqlite`
 * (the same fake-D1 shim the page-store test uses). So the REAL asset-store logic
 * runs with no Workers runtime, no live R2/D1.
 *
 * Assertions are honest — they check what the store actually returned and what it
 * actually stored/retrieved: the derived row (size = bytes.byteLength, key/filename/
 * contentType carried through, a real id), the bytes + `{ contentType }` recorded in
 * fake storage, the round-trip on getAssetObject, and that delete removes from BOTH
 * R2 and D1. No `was-called` tautologies.
 *
 * dep-free node --test; the real `.ts` store is imported via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import {
  putAsset,
  listAssets,
  deleteAsset,
  getAssetObject,
} from "../src/db/asset-store.ts";
import { cfDb } from "../src/lib/ports/db.ts";

// Real `asset` table DDL (from migrations/0002_cool_deathbird.sql). Dep-free; if
// the schema's asset table changes, the store queries change too and these catch it.
const ASSET_DDL = `
CREATE TABLE asset (
  id text PRIMARY KEY NOT NULL,
  key text NOT NULL,
  filename text NOT NULL,
  content_type text NOT NULL,
  size integer DEFAULT 0 NOT NULL,
  created_at integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE UNIQUE INDEX asset_key_unique ON asset (key);
`;

/** D1Database-shaped binding over in-memory node:sqlite (see page-store.test.mjs). */
function fakeD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(ASSET_DDL);
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

/** Read asset rows straight from sqlite (bypasses the store). */
function assetRows(d1) {
  return d1.sqlite.prepare("SELECT * FROM asset").all();
}

/**
 * In-memory fake matching the `Storage` port (put/get/delete). Records the
 * contentType option the store passes — that's the real translation we assert.
 */
function fakeStorage() {
  const store = new Map();
  return {
    store,
    async put(key, bytes, options) {
      store.set(key, { bytes, contentType: options?.contentType });
    },
    async get(key) {
      const o = store.get(key);
      return o ? { body: o.bytes } : null;
    },
    async delete(key) {
      store.delete(key);
    },
  };
}

function assetInput(overrides = {}) {
  return {
    key: "uploads/logo.png",
    filename: "logo.png",
    contentType: "image/png",
    bytes: new ArrayBuffer(64),
    ...overrides,
  };
}

test("putAsset stores bytes+contentType in R2 and a derived metadata row in D1", async () => {
  const storage = fakeStorage();
  const d1 = fakeD1();
  const db = cfDb(d1);

  const input = assetInput({ key: "uploads/logo.png", bytes: new ArrayBuffer(64) });
  const row = await putAsset(input, storage, db);

  // Returned row: derived size, carried-through fields, a real id.
  assert.equal(row.key, "uploads/logo.png");
  assert.equal(row.filename, "logo.png");
  assert.equal(row.contentType, "image/png");
  assert.equal(row.size, 64, "size is derived from bytes.byteLength");
  assert.ok(typeof row.id === "string" && row.id.length > 0);
  assert.ok(row.createdAt instanceof Date);

  // R2 got the real bytes + the contentType the store passed through.
  const stored = storage.store.get("uploads/logo.png");
  assert.equal(stored.bytes, input.bytes);
  assert.equal(stored.contentType, "image/png");

  // D1 got the persisted metadata row (real SQL, real storage).
  const all = assetRows(d1);
  assert.equal(all.length, 1);
  assert.equal(all[0].id, row.id);
  assert.equal(all[0].key, "uploads/logo.png");
  assert.equal(all[0].filename, "logo.png");
  assert.equal(all[0].content_type, "image/png");
  assert.equal(all[0].size, 64);
});

test("size really comes from the bytes, not the input", async () => {
  const storage = fakeStorage();
  const d1 = fakeD1();
  const db = cfDb(d1);

  const row = await putAsset(assetInput({ bytes: new ArrayBuffer(1234) }), storage, db);
  assert.equal(row.size, 1234);
  assert.equal(assetRows(d1)[0].size, 1234);
});

test("listAssets returns persisted rows newest-first", async () => {
  const storage = fakeStorage();
  const d1 = fakeD1();
  const db = cfDb(d1);

  // Insert with explicit, distinct created_at so ordering is deterministic.
  d1.sqlite
    .prepare(
      "INSERT INTO asset (id, key, filename, content_type, size, created_at) VALUES (?,?,?,?,?,?)",
    )
    .run("old", "a", "a.png", "image/png", 1, 1000);
  d1.sqlite
    .prepare(
      "INSERT INTO asset (id, key, filename, content_type, size, created_at) VALUES (?,?,?,?,?,?)",
    )
    .run("new", "b", "b.png", "image/png", 1, 2000);

  const rows = await listAssets(db);
  assert.deepEqual(
    rows.map((r) => r.id),
    ["new", "old"],
    "newest createdAt first",
  );
});

test("getAssetObject round-trips the bytes stored by putAsset, null when absent", async () => {
  const storage = fakeStorage();
  const d1 = fakeD1();
  const db = cfDb(d1);

  const input = assetInput({ key: "uploads/pic.jpg", bytes: new ArrayBuffer(8) });
  await putAsset(input, storage, db);

  const hit = await getAssetObject("uploads/pic.jpg", storage);
  assert.equal(hit.body, input.bytes);
  assert.equal(await getAssetObject("uploads/missing.jpg", storage), null);
});

test("deleteAsset removes the object from BOTH R2 and the D1 row", async () => {
  const storage = fakeStorage();
  const d1 = fakeD1();
  const db = cfDb(d1);

  await putAsset(assetInput({ key: "uploads/doomed.png" }), storage, db);
  assert.ok(storage.store.has("uploads/doomed.png"));
  assert.equal(assetRows(d1).length, 1);

  await deleteAsset("uploads/doomed.png", storage, db);

  assert.equal(storage.store.has("uploads/doomed.png"), false, "gone from R2");
  assert.equal(assetRows(d1).length, 0, "gone from D1 too");
});

test("deleteAsset only deletes the matching key (D1 row keyed by key, not id)", async () => {
  const storage = fakeStorage();
  const d1 = fakeD1();
  const db = cfDb(d1);

  await putAsset(assetInput({ key: "keep.png" }), storage, db);
  await putAsset(assetInput({ key: "drop.png" }), storage, db);

  await deleteAsset("drop.png", storage, db);

  const remaining = assetRows(d1);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].key, "keep.png");
  assert.ok(storage.store.has("keep.png"));
  assert.equal(storage.store.has("drop.png"), false);
});
