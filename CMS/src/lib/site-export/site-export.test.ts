/**
 * Pure serializer tests (node --test; no @/ imports) — the export core's whole
 * contract lives here per FORMAT.md §3/§7: envelope shape, epoch-ms dates,
 * dropped `secretEnc` + derived `hasSecret`, and collection-row passthrough.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSiteExport, SITE_FORMAT, SITE_VERSION, type SiteExportInput } from "./site-export.ts";

function baseInput(overrides: Partial<SiteExportInput> = {}): SiteExportInput {
  return {
    pages: [],
    pageVersions: [],
    components: [],
    collections: [],
    siteSettings: [],
    promptVersions: [],
    dataSources: [],
    dataSourceRequests: [],
    assets: [],
    collectionData: {},
    exportedAt: "2026-07-02T19:00:00.000Z",
    cmsVersion: "1.19.0",
    ...overrides,
  };
}

test("buildSiteExport: envelope format/version/meta", () => {
  const env = buildSiteExport(baseInput());
  assert.equal(env.format, SITE_FORMAT);
  assert.equal(env.format, "bizbeecms.site");
  assert.equal(env.version, SITE_VERSION);
  assert.equal(env.version, 1);
  assert.equal(env.meta.exportedAt, "2026-07-02T19:00:00.000Z");
  assert.equal(env.meta.cmsVersion, "1.19.0");
  assert.equal(env.meta.siteName, "");
});

test("buildSiteExport: siteName pulled from site_identity settings row", () => {
  const env = buildSiteExport(
    baseInput({
      siteSettings: [
        { key: "site_identity", value: JSON.stringify({ brandName: "Tableonline" }), updatedAt: 1000 },
        { key: "icon_set", value: JSON.stringify("lucide"), updatedAt: 2000 },
      ],
    }),
  );
  assert.equal(env.meta.siteName, "Tableonline");
  assert.equal(env.tables.siteSettings.length, 2);
  assert.equal(env.tables.siteSettings[0].updatedAt, 1000);
});

test("buildSiteExport: bad site_identity JSON doesn't throw, siteName stays empty", () => {
  const env = buildSiteExport(
    baseInput({ siteSettings: [{ key: "site_identity", value: "{not json", updatedAt: 1 }] }),
  );
  assert.equal(env.meta.siteName, "");
});

test("buildSiteExport: dates normalize to epoch-ms whether Date or number", () => {
  const asDate = new Date("2026-01-01T00:00:00.000Z");
  const env = buildSiteExport(
    baseInput({
      pages: [
        {
          id: "p1",
          slug: "home",
          parentPageId: null,
          displayOrder: 0,
          publishStatus: "published",
          blocks: "[]",
          metaTitle: "{}",
          metaDescription: "{}",
          metaImage: "{}",
          draftVersionId: null,
          publishedVersionId: "v1",
          createdAt: asDate,
          updatedAt: asDate.getTime(),
        },
      ],
    }),
  );
  assert.equal(env.tables.page.length, 1);
  assert.equal(env.tables.page[0].createdAt, asDate.getTime());
  assert.equal(env.tables.page[0].updatedAt, asDate.getTime());
  assert.equal(typeof env.tables.page[0].createdAt, "number");
});

test("buildSiteExport: data_source NEVER carries secretEnc, hasSecret derived", () => {
  const env = buildSiteExport(
    baseInput({
      dataSources: [
        {
          id: "ds1",
          name: "OpenWeather",
          baseUrl: "https://api.example.com",
          authType: "query",
          authParam: "appid",
          secretEnc: "base64ciphertext==",
          createdAt: 1,
          updatedAt: 2,
        },
        {
          id: "ds2",
          name: "Public feed",
          baseUrl: "https://public.example.com",
          authType: "none",
          authParam: null,
          secretEnc: null,
          createdAt: 1,
          updatedAt: 2,
        },
      ],
    }),
  );
  const [withSecret, withoutSecret] = env.tables.dataSource;
  assert.equal(withSecret.hasSecret, true);
  assert.equal("secretEnc" in withSecret, false);
  assert.equal(withoutSecret.hasSecret, false);
  assert.equal("secretEnc" in withoutSecret, false);
});

test("buildSiteExport: counts reflect input array lengths + summed collection rows", () => {
  const env = buildSiteExport(
    baseInput({
      collections: [
        {
          id: "c1",
          name: "Offers",
          tableName: "content_offers",
          schema: JSON.stringify([{ name: "title", type: "string" }]),
          publicSubmissions: false,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      collectionData: {
        content_offers: [
          { id: "o1", title: "Summer deal" },
          { id: "o2", title: "Winter deal" },
        ],
      },
    }),
  );
  assert.equal(env.counts.collections, 1);
  assert.equal(env.counts.collectionRows, 2);
  assert.deepEqual(env.collectionData.content_offers.schema, [{ name: "title", type: "string" }]);
  assert.equal(env.collectionData.content_offers.rows.length, 2);
});

test("buildSiteExport: a collection with no matching collectionData key exports empty rows, not a crash", () => {
  const env = buildSiteExport(
    baseInput({
      collections: [
        {
          id: "c1",
          name: "Empty",
          tableName: "content_empty",
          schema: "[]",
          publicSubmissions: false,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      // collectionData deliberately omits content_empty.
    }),
  );
  assert.deepEqual(env.collectionData.content_empty.rows, []);
  assert.equal(env.counts.collectionRows, 0);
});

test("buildSiteExport: asset table is metadata only (no bytes field)", () => {
  const env = buildSiteExport(
    baseInput({
      assets: [
        {
          id: "a1",
          key: "assets/foo_123_abc.png",
          filename: "foo.png",
          contentType: "image/png",
          size: 1024,
          description: "",
          tags: "[]",
          createdAt: 1,
        },
      ],
    }),
  );
  assert.equal(env.tables.asset.length, 1);
  assert.equal(env.tables.asset[0].key, "assets/foo_123_abc.png");
  assert.equal("bytes" in env.tables.asset[0], false);
});
