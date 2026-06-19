/**
 * Unit test for a CMS module (`upsertPage` in `src/db/page-store.ts`) driven
 * against a MOCKED `Db` port (binding-adapters subgoal). This is the payoff of
 * the ports seam: real page-authoring business logic runs with NO Workers
 * runtime and NO live Cloudflare D1 — the store's `injectedDb` seam takes a
 * drizzle client built (via the REAL `cfDb` adapter) over an in-memory SQLite
 * that stands in for the D1 binding.
 *
 * The fake D1 is a thin shim over `node:sqlite` exposing the `prepare/bind/
 * run/all/raw` surface drizzle-orm/d1 calls — so queries compile to real SQL,
 * hit a real `page` table (created from the real migration DDL), and rows are
 * really stored and read back. The assertions check REAL behavior: the returned
 * `{action, slug}` / error messages, and the persisted row contents — NOT "the
 * db was called". upsertPage's branching (parent resolution, missing-parent
 * rejection, created-vs-updated on the (parent,slug) key, JSON-serialization of
 * blocks/meta) is what's under test; if it regressed, these fail.
 *
 * dep-free node --test; the real `.ts` store is imported via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import { upsertPage } from "../src/db/page-store.ts";
import { cfDb } from "../src/lib/ports/db.ts";

// Real `page` table DDL (from migrations/0000_worried_nextwave.sql). Keeping it
// here keeps the test dep-free; if the schema's page table changes, the store
// queries change too and these tests would catch a mismatch.
const PAGE_DDL = `
CREATE TABLE page (
  id text PRIMARY KEY NOT NULL,
  slug text NOT NULL,
  parent_page_id text,
  display_order integer DEFAULT 0 NOT NULL,
  publish_status text DEFAULT 'draft' NOT NULL,
  blocks text DEFAULT '[]' NOT NULL,
  meta_title text DEFAULT '{}' NOT NULL,
  meta_description text DEFAULT '{}' NOT NULL,
  meta_image text DEFAULT '{}' NOT NULL,
  created_at integer DEFAULT (unixepoch() * 1000) NOT NULL,
  updated_at integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE UNIQUE INDEX page_parent_slug_unique ON page (parent_page_id, slug);
`;

/**
 * A D1Database-shaped binding backed by in-memory node:sqlite — exactly the
 * surface drizzle-orm/d1 drives: prepare(sql) → {bind(...p)} → {run,all,raw}.
 * Real SQL, real storage. `raw()` returns rows-as-arrays (drizzle selects),
 * `all()` returns `{results}` objects, `run()` the write meta.
 */
function fakeD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(PAGE_DDL);
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

/** Helper: count rows / fetch one straight from sqlite (bypasses the store). */
function rows(db) {
  return db.sqlite.prepare("SELECT * FROM page").all();
}

function pageInput(overrides = {}) {
  return {
    slug: "about",
    parentSlug: null,
    publishStatus: "draft",
    blocks: [{ component: "Hero", props: {} }],
    metaTitle: { en: "About" },
    metaDescription: { en: "About us" },
    ...overrides,
  };
}

test("upsertPage CREATES a top-level page and persists the real row", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1);

  const res = await upsertPage(pageInput({ slug: "about", parentSlug: null }), db);

  assert.deepEqual(res, { ok: true, action: "created", slug: "about" });
  const all = rows(d1);
  assert.equal(all.length, 1);
  const stored = all[0];
  assert.equal(stored.slug, "about");
  assert.equal(stored.parent_page_id, null);
  assert.equal(stored.publish_status, "draft");
  // The store JSON-serializes blocks/meta before write — assert the real transform.
  assert.deepEqual(JSON.parse(stored.blocks), [{ component: "Hero", props: {} }]);
  assert.deepEqual(JSON.parse(stored.meta_title), { en: "About" });
  assert.deepEqual(JSON.parse(stored.meta_description), { en: "About us" });
  assert.ok(typeof stored.id === "string" && stored.id.length > 0);
});

test("upsertPage UPDATES an existing (parent,slug) instead of inserting a duplicate", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1);

  // Seed an existing top-level "about".
  await upsertPage(pageInput({ slug: "about", publishStatus: "draft" }), db);
  const firstId = rows(d1)[0].id;

  const res = await upsertPage(
    pageInput({ slug: "about", parentSlug: null, publishStatus: "published" }),
    db,
  );

  assert.deepEqual(res, { ok: true, action: "updated", slug: "about" });
  const all = rows(d1);
  assert.equal(all.length, 1, "must update in place, not insert a duplicate");
  assert.equal(all[0].id, firstId, "same row, not a new one");
  assert.equal(all[0].publish_status, "published");
});

test("upsertPage resolves parentSlug → parentPageId for a child page", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1);

  await upsertPage(pageInput({ slug: "docs", parentSlug: null }), db);
  const parentId = rows(d1)[0].id;

  const res = await upsertPage(pageInput({ slug: "intro", parentSlug: "docs" }), db);

  assert.deepEqual(res, { ok: true, action: "created", slug: "intro" });
  const child = rows(d1).find((r) => r.slug === "intro");
  assert.ok(child, "child page was inserted");
  assert.equal(child.parent_page_id, parentId, "parent slug resolved to the parent's id");
});

test("upsertPage REJECTS a missing parent (does not silently orphan the child)", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1);

  const res = await upsertPage(pageInput({ slug: "intro", parentSlug: "ghost" }), db);

  assert.equal(res.ok, false);
  assert.deepEqual(res.errors, ['parent page "ghost" not found']);
  assert.equal(rows(d1).length, 0, "nothing written when the parent is missing");
});

test("upsertPage allows the same slug under different parents (the unique key is (parent,slug))", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1);

  // Two distinct parents.
  await upsertPage(pageInput({ slug: "a", parentSlug: null }), db);
  await upsertPage(pageInput({ slug: "b", parentSlug: null }), db);

  const rA = await upsertPage(pageInput({ slug: "page", parentSlug: "a" }), db);
  const rB = await upsertPage(pageInput({ slug: "page", parentSlug: "b" }), db);

  assert.deepEqual(rA, { ok: true, action: "created", slug: "page" });
  assert.deepEqual(rB, { ok: true, action: "created", slug: "page" });
  const pages = rows(d1).filter((r) => r.slug === "page");
  assert.equal(pages.length, 2, "same slug coexists under two different parents");
  assert.notEqual(pages[0].parent_page_id, pages[1].parent_page_id);
});
