/**
 * Pure unit tests for the SEO-form helpers in page-meta.ts. Node can't resolve
 * the `@/` alias, so import via a relative `.ts` path (see CAVEATS).
 *
 *   node --test src/lib/pages/page-meta.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  setLocaleValue,
  buildSeoMetaBody,
  validatePageMeta,
} from "./page-meta.ts";

test("setLocaleValue sets, overwrites and clears immutably", () => {
  const base = { en: "Home" };
  const set = setLocaleValue(base, "fi", "Etusivu");
  assert.deepEqual(set, { en: "Home", fi: "Etusivu" });
  assert.deepEqual(base, { en: "Home" }, "input not mutated");

  const over = setLocaleValue(set, "en", "Welcome");
  assert.equal(over.en, "Welcome");

  // Empty / whitespace drops the key (don't persist empty strings).
  assert.deepEqual(setLocaleValue(set, "en", ""), { fi: "Etusivu" });
  assert.deepEqual(setLocaleValue(set, "en", "   "), { fi: "Etusivu" });
});

test("buildSeoMetaBody keeps identity, swaps SEO maps, round-trips through validatePageMeta", () => {
  const page = {
    id: "p1",
    slug: "about",
    parentSlug: null,
    publishStatus: "published",
  };
  const body = buildSeoMetaBody(
    page,
    { en: "About us" },
    { en: "Who we are" },
    { en: "https://cdn.example/og.png" },
  );
  assert.deepEqual(body, {
    id: "p1",
    slug: "about",
    parentSlug: null,
    publishStatus: "published",
    metaTitle: { en: "About us" },
    metaDescription: { en: "Who we are" },
    metaImage: { en: "https://cdn.example/og.png" },
  });

  // The route re-validates the body; SEO-only edit must pass.
  const v = validatePageMeta(body);
  assert.equal(v.ok, true);
  if (v.ok) assert.deepEqual(v.meta.metaImage, { en: "https://cdn.example/og.png" });
});

test("buildSeoMetaBody normalizes a non-published status to draft", () => {
  const body = buildSeoMetaBody(
    { id: "p2", slug: "blog", parentSlug: "root", publishStatus: "weird" },
    {},
    {},
    {},
  );
  assert.equal(body.publishStatus, "draft");
  assert.equal(body.parentSlug, "root");
  assert.deepEqual(body.metaImage, {});
});

test("validatePageMeta defaults metaImage to {} when omitted (back-compat with C2 body)", () => {
  const v = validatePageMeta({ slug: "x", metaTitle: {}, metaDescription: {} });
  assert.equal(v.ok, true);
  if (v.ok) assert.deepEqual(v.meta.metaImage, {});
});

test("validatePageMeta rejects a non-string metaImage value", () => {
  const v = validatePageMeta({
    slug: "x",
    metaTitle: {},
    metaDescription: {},
    metaImage: { en: 5 },
  });
  assert.equal(v.ok, false);
});
