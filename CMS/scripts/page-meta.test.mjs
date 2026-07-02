/**
 * Regression: the page-meta pure layer. `validatePageMeta` is the untrusted-input
 * gate the `/api/pages` REST route relies on (slug grammar, parent rules, publish
 * status, per-locale SEO maps) — still used by the Page Builder after the Pages
 * admin UI was removed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidSlug, isParamSlug, validatePageMeta } from "../src/lib/pages/page-meta.ts";

test("validatePageMeta: accepts a well-formed page", () => {
  const r = validatePageMeta({
    slug: "pricing",
    parentSlug: "",
    publishStatus: "published",
    metaTitle: { en: "Pricing", fi: "Hinnat" },
    metaDescription: { en: "Our plans" },
  });
  assert.ok(r.ok);
  assert.equal(r.meta.slug, "pricing");
  assert.equal(r.meta.parentSlug, null);
  assert.equal(r.meta.publishStatus, "published");
  assert.deepEqual(r.meta.metaTitle, { en: "Pricing", fi: "Hinnat" });
});

test("validatePageMeta: defaults — missing publish status → draft, missing meta → {}", () => {
  const r = validatePageMeta({ slug: "about" });
  assert.ok(r.ok);
  assert.equal(r.meta.publishStatus, "draft");
  assert.deepEqual(r.meta.metaTitle, {});
  assert.deepEqual(r.meta.metaDescription, {});
});

test("validatePageMeta: rejects bad slug / status / non-string meta", () => {
  assert.equal(validatePageMeta({ slug: "Has Spaces" }).ok, false);
  assert.equal(validatePageMeta({ slug: "ok", publishStatus: "live" }).ok, false);
  assert.equal(validatePageMeta({ slug: "ok", metaTitle: { en: 5 } }).ok, false);
  assert.equal(validatePageMeta({ slug: "ok", metaTitle: ["x"] }).ok, false);
  assert.equal(validatePageMeta(null).ok, false);
});

test("validatePageMeta: a page cannot be its own parent", () => {
  const r = validatePageMeta({ slug: "blog", parentSlug: "blog" });
  assert.equal(r.ok, false);
});

test("isValidSlug guards the form input", () => {
  assert.ok(isValidSlug("home"));
  assert.ok(isValidSlug("blog-post-1"));
  assert.equal(isValidSlug("Home"), false);
  assert.equal(isValidSlug(""), false);
  assert.equal(isValidSlug(42), false);
});

// Platform feature — dynamic/param-driven pages: a leading ":" marks a
// wildcard route-param segment (e.g. ":city-slug").
test("isValidSlug accepts a wildcard param slug", () => {
  assert.ok(isValidSlug(":city-slug"));
  assert.ok(isValidSlug(":q"));
});

test("validatePageMeta accepts a wildcard param slug", () => {
  const r = validatePageMeta({ slug: ":city-slug" });
  assert.ok(r.ok);
  assert.equal(r.meta.slug, ":city-slug");
});

test("isParamSlug identifies wildcard vs ordinary slugs", () => {
  assert.equal(isParamSlug(":city-slug"), true);
  assert.equal(isParamSlug("city-slug"), false);
});
