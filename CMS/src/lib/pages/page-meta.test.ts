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
  buildPublishToggleBody,
  buildCacheMaxAgeBody,
  buildLocalizedSlugsBody,
  CACHE_MAX_AGE_OPTIONS,
  localizedSlugSiblingConflicts,
  validatePageMeta,
} from "./page-meta.ts";

test("buildPublishToggleBody flips publish state, keeps slug/parent/meta", () => {
  const page = {
    id: "p1",
    slug: "home",
    parentSlug: null,
    publishStatus: "draft",
    metaTitle: { en: "Home" },
    metaDescription: { en: "Welcome" },
    metaImage: { en: "https://r2/og.png" },
  };
  const pub = buildPublishToggleBody(page);
  assert.equal(pub.publishStatus, "published");
  assert.equal(pub.slug, "home");
  assert.equal(pub.parentSlug, null);
  assert.deepEqual(pub.metaTitle, { en: "Home" });
  assert.deepEqual(pub.metaImage, { en: "https://r2/og.png" });
  const back = buildPublishToggleBody({ ...page, publishStatus: "published" });
  assert.equal(back.publishStatus, "draft");
  assert.equal(validatePageMeta(pub).ok, true);
});

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

// ── Edge-cache opt-in (path-locales-edge-cache) ──────────────────────────────

test("validatePageMeta accepts each CACHE_MAX_AGE_OPTIONS value", () => {
  for (const s of CACHE_MAX_AGE_OPTIONS) {
    const v = validatePageMeta({ slug: "x", cacheMaxAge: s });
    assert.equal(v.ok, true, `option ${s}`);
    if (v.ok) assert.equal(v.meta.cacheMaxAge, s);
  }
});

test("validatePageMeta leaves cacheMaxAge undefined when absent (preserve stored value)", () => {
  const v = validatePageMeta({ slug: "x" });
  assert.equal(v.ok, true);
  if (v.ok) assert.equal(v.meta.cacheMaxAge, undefined);
});

test("validatePageMeta rejects cacheMaxAge outside the option set", () => {
  for (const bad of [-1, 42, 300.5, "300", true]) {
    const v = validatePageMeta({ slug: "x", cacheMaxAge: bad });
    assert.equal(v.ok, false, `bad value ${String(bad)}`);
  }
});

test("buildCacheMaxAgeBody changes only cacheMaxAge; publish state NOT toggled", () => {
  const page = {
    id: "p1",
    slug: "home",
    parentSlug: null,
    publishStatus: "published",
    metaTitle: { en: "Home" },
    metaDescription: { en: "Welcome" },
    metaImage: { en: "https://r2/og.png" },
  };
  const body = buildCacheMaxAgeBody(page, 3600);
  assert.equal(body.cacheMaxAge, 3600);
  assert.equal(body.publishStatus, "published", "publish state preserved, not flipped");
  assert.equal(body.slug, "home");
  assert.deepEqual(body.metaTitle, { en: "Home" });
  assert.equal(validatePageMeta(body).ok, true);
  const draft = buildCacheMaxAgeBody({ ...page, publishStatus: "draft" }, 0);
  assert.equal(draft.publishStatus, "draft");
  assert.equal(draft.cacheMaxAge, 0);
});

test("publish/SEO bodies omit cacheMaxAge so a save can't reset the opt-in", () => {
  const page = {
    id: "p1",
    slug: "home",
    parentSlug: null,
    publishStatus: "draft",
    metaTitle: {},
    metaDescription: {},
    metaImage: {},
  };
  assert.equal("cacheMaxAge" in buildPublishToggleBody(page), false);
  assert.equal("cacheMaxAge" in buildSeoMetaBody(page, {}, {}, {}), false);
});

// ── Localized slugs (Stage 2, path-locales-edge-cache) ───────────────────────

test("validatePageMeta accepts localizedSlugs, drops empty values, lowercases locale keys", () => {
  const v = validatePageMeta({
    slug: "about",
    localizedSlugs: { FI: "meista", et: "  ", en: "about-us " },
  });
  assert.equal(v.ok, true);
  if (v.ok) assert.deepEqual(v.meta.localizedSlugs, { fi: "meista", en: "about-us" });
});

test("validatePageMeta leaves localizedSlugs undefined when absent (preserve stored map)", () => {
  const v = validatePageMeta({ slug: "about" });
  assert.equal(v.ok, true);
  if (v.ok) assert.equal(v.meta.localizedSlugs, undefined);
});

test("validatePageMeta rejects invalid + wildcard localized slug values, naming the locale", () => {
  const bad = validatePageMeta({ slug: "about", localizedSlugs: { fi: "Meistä" } });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.errors.join(";"), /localizedSlugs\.fi/);
  const wild = validatePageMeta({ slug: "about", localizedSlugs: { fi: ":city" } });
  assert.equal(wild.ok, false);
  if (!wild.ok) assert.match(wild.errors.join(";"), /wildcard/);
  const shape = validatePageMeta({ slug: "about", localizedSlugs: { fi: 5 } });
  assert.equal(shape.ok, false);
});

test("localizedSlugSiblingConflicts flags effective-slug collisions per locale", () => {
  const siblings: { id: string; slug: string; localizedSlugs: Record<string, string> }[] = [
    { id: "a", slug: "about", localizedSlugs: { fi: "meista" } },
    { id: "b", slug: "contact", localizedSlugs: {} },
  ];
  // Direct override collision in fi.
  assert.deepEqual(
    localizedSlugSiblingConflicts(
      { id: null, slug: "team", localizedSlugs: { fi: "meista" } },
      siblings,
    ),
    [{ locale: "fi", slug: "meista" }],
  );
  // Fallback collision: candidate default slug collides with a sibling's fi override.
  assert.deepEqual(
    localizedSlugSiblingConflicts({ id: null, slug: "meista", localizedSlugs: {} }, siblings),
    [{ locale: "fi", slug: "meista" }],
  );
  // Candidate override collides with a sibling's DEFAULT slug (sibling has no fi key).
  assert.deepEqual(
    localizedSlugSiblingConflicts(
      { id: null, slug: "team", localizedSlugs: { fi: "contact" } },
      siblings,
    ),
    [{ locale: "fi", slug: "contact" }],
  );
  // No collision; the candidate's own row is skipped on update.
  assert.deepEqual(
    localizedSlugSiblingConflicts(
      { id: "a", slug: "about", localizedSlugs: { fi: "meista" } },
      siblings,
    ),
    [],
  );
});

test("buildLocalizedSlugsBody carries cleaned overrides, keeps identity, omits cacheMaxAge", () => {
  const page = {
    id: "p1",
    slug: "about",
    parentSlug: null,
    publishStatus: "published",
    metaTitle: { en: "About" },
    metaDescription: {},
    metaImage: {},
  };
  const body = buildLocalizedSlugsBody(page, { fi: " meista ", et: "" });
  assert.deepEqual(body.localizedSlugs, { fi: "meista" });
  assert.equal(body.publishStatus, "published");
  assert.equal(body.slug, "about");
  assert.equal("cacheMaxAge" in body, false);
  assert.equal(validatePageMeta(body).ok, true);
  // Clearing every input clears all overrides (present-but-empty map = write {}).
  assert.deepEqual(buildLocalizedSlugsBody(page, { fi: "" }).localizedSlugs, {});
});

test("publish/SEO bodies omit localizedSlugs so a save can't reset the overrides", () => {
  const page = {
    id: "p1",
    slug: "home",
    parentSlug: null,
    publishStatus: "draft",
    metaTitle: {},
    metaDescription: {},
    metaImage: {},
  };
  assert.equal("localizedSlugs" in buildPublishToggleBody(page), false);
  assert.equal("localizedSlugs" in buildSeoMetaBody(page, {}, {}, {}), false);
});
