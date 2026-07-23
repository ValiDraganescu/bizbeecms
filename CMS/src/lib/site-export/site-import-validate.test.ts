/**
 * Pure validator/report-builder tests (node --test; no @/ imports) — FORMAT.md
 * §6 Steps A + B: hard-fail rules, warnings, dry-run report shape.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateSiteImport,
  SITE_FORMAT,
  SITE_VERSION,
  MAX_COLLECTIONS,
  type DryRunCounts,
} from "./site-import-validate.ts";

const ZERO_DESTROY: DryRunCounts = {
  pages: 0,
  components: 0,
  collections: 0,
  collectionRows: 0,
  assets: 0,
  dataSources: 0,
  promptVersions: 0,
  chatAgents: 0,
};

function noDestroy(): DryRunCounts {
  return ZERO_DESTROY;
}

function baseArtifact(overrides: Record<string, unknown> = {}) {
  return {
    format: SITE_FORMAT,
    version: SITE_VERSION,
    meta: { exportedAt: "2026-07-02T19:00:00.000Z", cmsVersion: "1.19.0", siteName: "Test" },
    counts: {
      pages: 0,
      pageVersions: 0,
      components: 0,
      collections: 0,
      collectionRows: 0,
      assets: 0,
      dataSources: 0,
      dataSourceRequests: 0,
      promptVersions: 0,
    },
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

test("validateSiteImport: rejects a non-object artifact", async () => {
  const r = await validateSiteImport(null, noDestroy);
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /JSON object/);
});

test("validateSiteImport: rejects wrong format", async () => {
  const r = await validateSiteImport(baseArtifact({ format: "bizbeecms.kit" }), noDestroy);
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /unsupported format/);
  assert.match(r.error ?? "", /bizbeecms\.kit/);
});

test("validateSiteImport: rejects wrong version", async () => {
  const r = await validateSiteImport(baseArtifact({ version: 2 }), noDestroy);
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /unsupported version/);
});

test("validateSiteImport: rejects missing tables object", async () => {
  const r = await validateSiteImport(baseArtifact({ tables: undefined }), noDestroy);
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /"tables" must be an object/);
});

test("validateSiteImport: names the exact bad tables.* key when missing/wrong-typed", async () => {
  const artifact = baseArtifact();
  // @ts-expect-error deliberately wrong shape for the test
  artifact.tables.component = "not-an-array";
  const r = await validateSiteImport(artifact, noDestroy);
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /tables\.component must be an array/);
});

test("validateSiteImport: names a missing tables.* key too", async () => {
  const artifact = baseArtifact();
  delete (artifact.tables as Record<string, unknown>).asset;
  const r = await validateSiteImport(artifact, noDestroy);
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /tables\.asset must be an array/);
});

test("validateSiteImport: collection cap OK under 100", async () => {
  const r = await validateSiteImport(baseArtifact(), noDestroy);
  assert.equal(r.ok, true);
  assert.equal(r.collectionCapOk, true);
  assert.deepEqual(r.warnings, []);
});

test("validateSiteImport: over 100 collections is a WARNING, not a hard-fail", async () => {
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
  const r = await validateSiteImport(artifact, noDestroy);
  assert.equal(r.ok, true);
  assert.equal(r.collectionCapOk, false);
  assert.equal(r.warnings.some((w) => w.includes("exceeding the 100-table cap")), true);
});

test("validateSiteImport: counts mismatch is a WARNING, not a hard-fail", async () => {
  const artifact = baseArtifact({
    counts: { pages: 99, pageVersions: 0, components: 0, collections: 0, collectionRows: 0, assets: 0, dataSources: 0, dataSourceRequests: 0, promptVersions: 0 },
  });
  const r = await validateSiteImport(artifact, noDestroy);
  assert.equal(r.ok, true);
  assert.equal(r.willCreate.pages, 0);
  assert.equal(r.warnings.some((w) => w.startsWith("counts.pages")), true);
});

test("validateSiteImport: willCreate reflects tables/collectionData lengths, not counts", async () => {
  const artifact = baseArtifact();
  (artifact.tables as Record<string, unknown>).page = [{ id: "p1" }, { id: "p2" }];
  artifact.collectionData = { content_offers: { rows: [{ id: "o1" }, { id: "o2" }, { id: "o3" }] } };
  const r = await validateSiteImport(artifact, noDestroy);
  assert.equal(r.ok, true);
  assert.equal(r.willCreate.pages, 2);
  assert.equal(r.willCreate.collectionRows, 3);
});

test("validateSiteImport: secretsToReenter lists only hasSecret:true data sources", async () => {
  const artifact = baseArtifact();
  (artifact.tables as Record<string, unknown>).dataSource = [
    { id: "d1", name: "OpenWeather", authType: "query", hasSecret: true },
    { id: "d2", name: "Public feed", authType: "none", hasSecret: false },
  ];
  const r = await validateSiteImport(artifact, noDestroy);
  assert.equal(r.ok, true);
  assert.deepEqual(r.secretsToReenter, [{ name: "OpenWeather", authType: "query" }]);
});

test("validateSiteImport: tables.chatAgent is OPTIONAL — a pre-chat-agent artifact still validates", async () => {
  const artifact = baseArtifact();
  delete (artifact.tables as Record<string, unknown>).chatAgent;
  const r = await validateSiteImport(artifact, noDestroy);
  assert.equal(r.ok, true);
  assert.equal(r.willCreate.chatAgents, 0);
});

test("validateSiteImport: a PRESENT non-array tables.chatAgent still hard-fails by name", async () => {
  const artifact = baseArtifact();
  (artifact.tables as Record<string, unknown>).chatAgent = "not-an-array";
  const r = await validateSiteImport(artifact, noDestroy);
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /tables\.chatAgent must be an array when present/);
});

test("validateSiteImport: willCreate.chatAgents counts the artifact's agents", async () => {
  const artifact = baseArtifact();
  (artifact.tables as Record<string, unknown>).chatAgent = [{ id: "ag1" }, { id: "ag2" }];
  const r = await validateSiteImport(artifact, noDestroy);
  assert.equal(r.ok, true);
  assert.equal(r.willCreate.chatAgents, 2);
});

test("validateSiteImport: willDestroy comes from the injected count-provider, unmodified", async () => {
  const destroy: DryRunCounts = {
    pages: 9,
    components: 15,
    collections: 2,
    collectionRows: 140,
    assets: 30,
    dataSources: 1,
    promptVersions: 0,
    chatAgents: 3,
  };
  const r = await validateSiteImport(baseArtifact(), async () => destroy);
  assert.equal(r.ok, true);
  assert.deepEqual(r.willDestroy, destroy);
});

test("validateSiteImport: a hard-fail report never calls the count-provider", async () => {
  let called = false;
  const provider = () => {
    called = true;
    return ZERO_DESTROY;
  };
  const r = await validateSiteImport(baseArtifact({ format: "wrong" }), provider);
  assert.equal(r.ok, false);
  assert.equal(called, false);
});
