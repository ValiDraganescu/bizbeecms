/**
 * Pure planner tests (node --test; no @/ imports) — FORMAT.md §6 Step C: the
 * confirmation contract, the wipe/restore plan shape, and the hard cap block.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planImport,
  checkConfirmation,
  WIPE_BUILTIN_TABLES,
  PRESERVED_TABLES,
  MAX_COLLECTIONS,
  SITE_FORMAT,
  SITE_VERSION,
} from "./site-import-execute.ts";

function baseArtifact(overrides: Record<string, unknown> = {}) {
  return {
    format: SITE_FORMAT,
    version: SITE_VERSION,
    meta: { exportedAt: "2026-07-02T19:00:00.000Z", cmsVersion: "1.19.0", siteName: "Test Site" },
    counts: {},
    tables: {
      page: [],
      pageVersion: [],
      component: [],
      collection: [],
      siteSettings: [],
      promptVersion: [],
      dataSource: [],
      dataSourceRequest: [],
      asset: [],
    },
    collectionData: {},
    ...overrides,
  };
}

test("checkConfirmation: rejects a blank siteName outright, even with a matching confirm", () => {
  const r = checkConfirmation("", "");
  assert.equal(r.ok, false);
});

test("checkConfirmation: rejects a wrong confirm", () => {
  const r = checkConfirmation("Test Site", "wrong");
  assert.equal(r.ok, false);
});

test("checkConfirmation: accepts an exact case-sensitive match", () => {
  const r = checkConfirmation("Test Site", "Test Site");
  assert.equal(r.ok, true);
});

test("planImport: rejects wrong format/version like validate does", () => {
  assert.equal(planImport(baseArtifact({ format: "bizbeecms.kit" }), "Test Site").ok, false);
  assert.equal(planImport(baseArtifact({ version: 2 }), "Test Site").ok, false);
});

test("planImport: rejects without the exact confirm phrase", () => {
  const r = planImport(baseArtifact(), "Wrong Name");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /confirm must equal/);
});

test("planImport: HARD-BLOCKS over the 100-collection cap (unlike validate's warning)", () => {
  const collections = Array.from({ length: MAX_COLLECTIONS + 1 }, (_, i) => ({
    id: `c${i}`,
    name: `c${i}`,
    tableName: `content_c${i}`,
    schema: "[]",
    publicSubmissions: false,
    createdAt: 1,
    updatedAt: 1,
  }));
  const artifact = baseArtifact();
  (artifact.tables as Record<string, unknown>).collection = collections;
  const r = planImport(artifact, "Test Site");
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.error, /exceeding the 100-table cap/);
    assert.match(r.error, /refusing to execute/);
  }
});

test("planImport: exactly at the cap is allowed", () => {
  const collections = Array.from({ length: MAX_COLLECTIONS }, (_, i) => ({
    id: `c${i}`,
    name: `c${i}`,
    tableName: `content_c${i}`,
    schema: "[]",
    publicSubmissions: false,
    createdAt: 1,
    updatedAt: 1,
  }));
  const artifact = baseArtifact();
  (artifact.tables as Record<string, unknown>).collection = collections;
  const r = planImport(artifact, "Test Site");
  assert.equal(r.ok, true);
});

test("planImport: dropContentTables lists every registry table name, restore plan mirrors tables verbatim", () => {
  const artifact = baseArtifact();
  (artifact.tables as Record<string, unknown>).collection = [
    { id: "c1", name: "Offers", tableName: "content_offers", schema: '[{"name":"title","type":"string"}]', publicSubmissions: false, createdAt: 1, updatedAt: 1 },
  ];
  artifact.collectionData = {
    content_offers: { schema: [{ name: "title", type: "string" }], rows: [{ id: "o1", title: "Sale" }] },
  };
  (artifact.tables as Record<string, unknown>).page = [{ id: "p1", slug: "home" }];
  (artifact.tables as Record<string, unknown>).dataSource = [
    { id: "d1", name: "Weather", authType: "query", hasSecret: true, secretEnc: "should-never-survive" },
  ];

  const r = planImport(artifact, "Test Site");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.plan.dropContentTables, ["content_offers"]);
  assert.equal(r.plan.restoreCollections.length, 1);
  assert.equal(r.plan.restoreCollections[0].tableName, "content_offers");
  assert.deepEqual(r.plan.restoreCollections[0].rows, [{ id: "o1", title: "Sale" }]);
  assert.equal(r.plan.restorePages.length, 1);
  // secretEnc is ALWAYS nulled — never trust an artifact-supplied ciphertext.
  assert.equal(r.plan.restoreDataSources[0].secretEnc, null);
});

test("planImport: falls back to parsing collection.schema when collectionData is missing that table", () => {
  const artifact = baseArtifact();
  (artifact.tables as Record<string, unknown>).collection = [
    { id: "c1", name: "Offers", tableName: "content_offers", schema: '[{"name":"title","type":"string"}]', publicSubmissions: false, createdAt: 1, updatedAt: 1 },
  ];
  const r = planImport(artifact, "Test Site");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.plan.restoreCollections[0].fields, [{ name: "title", type: "string" }]);
  assert.deepEqual(r.plan.restoreCollections[0].rows, []);
});

test("WIPE_BUILTIN_TABLES and PRESERVED_TABLES never overlap", () => {
  const wipeSet = new Set<string>(WIPE_BUILTIN_TABLES);
  for (const preserved of PRESERVED_TABLES) {
    assert.equal(wipeSet.has(preserved), false, `${preserved} must never be wiped`);
  }
});

test("WIPE_BUILTIN_TABLES matches FORMAT.md §6 Step C's exact order", () => {
  assert.deepEqual(WIPE_BUILTIN_TABLES, [
    "collection",
    "page_version",
    "page",
    "component",
    "data_source_request",
    "data_source",
    "prompt_version",
    "asset",
    "site_settings",
  ]);
});
