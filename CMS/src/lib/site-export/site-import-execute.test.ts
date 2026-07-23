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
      chatAgent: [],
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

test("planImport: dropContentTables comes from the TARGET's existing registry (3rd arg), restore plan mirrors artifact tables verbatim", () => {
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

  // Target happens to already have a DIFFERENT collection than the source —
  // dropContentTables must reflect the TARGET's own table, not the source's.
  const r = planImport(artifact, "Test Site", ["content_legacy_stuff"]);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.plan.dropContentTables, ["content_legacy_stuff"]);
  assert.equal(r.plan.restoreCollections.length, 1);
  assert.equal(r.plan.restoreCollections[0].tableName, "content_offers");
  assert.deepEqual(r.plan.restoreCollections[0].rows, [{ id: "o1", title: "Sale" }]);
  assert.equal(r.plan.restorePages.length, 1);
  // secretEnc is ALWAYS nulled — never trust an artifact-supplied ciphertext.
  assert.equal(r.plan.restoreDataSources[0].secretEnc, null);
});

test("planImport: dropContentTables defaults to [] (nothing to drop) when the 3rd arg is omitted — a fresh/empty TARGET must never try to DROP the SOURCE's tables", () => {
  const artifact = baseArtifact();
  (artifact.tables as Record<string, unknown>).collection = [
    { id: "c1", name: "Offers", tableName: "content_offers", schema: '[{"name":"title","type":"string"}]', publicSubmissions: false, createdAt: 1, updatedAt: 1 },
  ];
  const r = planImport(artifact, "Test Site");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  // Regression: this used to be `["content_offers"]` (the SOURCE's table),
  // which 500s with "no such table" on a genuinely empty/different target —
  // only invisible on same-instance round-trip tests where source===target.
  assert.deepEqual(r.plan.dropContentTables, []);
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
    "chat_agent",
  ]);
});

test("planImport: chat agents restore from tables.chatAgent, and a pre-chat-agent artifact (missing key) plans []", () => {
  const artifact = baseArtifact();
  (artifact.tables as Record<string, unknown>).chatAgent = [
    { id: "ag1", name: "Support bot", systemPrompt: "p", enabled: true },
  ];
  const r = planImport(artifact, "Test Site");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.plan.restoreChatAgents, [
    { id: "ag1", name: "Support bot", systemPrompt: "p", enabled: true },
  ]);

  const legacy = baseArtifact();
  delete (legacy.tables as Record<string, unknown>).chatAgent;
  const rLegacy = planImport(legacy, "Test Site");
  assert.equal(rLegacy.ok, true);
  if (!rLegacy.ok) return;
  assert.deepEqual(rLegacy.plan.restoreChatAgents, []);
});

test("planImport: a PRESENT non-array tables.chatAgent is rejected by name", () => {
  const artifact = baseArtifact();
  (artifact.tables as Record<string, unknown>).chatAgent = "not-an-array";
  const r = planImport(artifact, "Test Site");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /tables\.chatAgent must be an array when present/);
});

test("PRESERVED_TABLES covers guest-chat history/analytics (never wiped by import)", () => {
  const preserved = new Set<string>(PRESERVED_TABLES);
  assert.equal(preserved.has("chat_conversation"), true);
  assert.equal(preserved.has("usage_counter"), true);
  assert.equal(preserved.has("chat_agent"), false);
});
