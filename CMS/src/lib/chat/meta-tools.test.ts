import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSetPageMeta, mergePageMeta, type ExistingPageMeta } from "./meta-tools.ts";

const existing: ExistingPageMeta = {
  slug: "pricing",
  parentSlug: null,
  publishStatus: "published",
  metaTitle: { en: "Old title" },
  metaDescription: {},
  metaImage: { en: "/media/og.png" },
};

test("set_page_meta requires a valid slug", () => {
  const v = validateSetPageMeta({ metaTitle: { en: "x" } });
  assert.equal(v.ok, false);
  if (!v.ok) assert.match(v.errors.join("\n"), /slug/);
});

test("set_page_meta rejects a no-op with no non-empty meta", () => {
  const v = validateSetPageMeta({ slug: "pricing", metaTitle: { en: "" }, metaDescription: {} });
  assert.equal(v.ok, false);
  if (!v.ok) assert.match(v.errors.join("\n"), /at least one non-empty/);
});

test("set_page_meta accepts a title-only patch", () => {
  const v = validateSetPageMeta({ slug: "pricing", metaTitle: { en: "Pricing — Acme" } });
  assert.ok(v.ok, v.ok ? "" : v.errors.join("; "));
  if (v.ok) assert.equal(v.patch.metaTitle.en, "Pricing — Acme");
});

test("set_page_meta rejects a non-string locale value", () => {
  const v = validateSetPageMeta({ slug: "pricing", metaTitle: { en: 42 } });
  assert.equal(v.ok, false);
  if (!v.ok) assert.match(v.errors.join("\n"), /metaTitle/);
});

test("set_page_meta carries a parentSlug through", () => {
  const v = validateSetPageMeta({ slug: "post", parentSlug: "blog", metaTitle: { en: "A post" } });
  assert.ok(v.ok);
  if (v.ok) assert.equal(v.patch.parentSlug, "blog");
});

test("mergePageMeta overwrites the supplied locale, keeps the rest", () => {
  const patch = { slug: "pricing", parentSlug: null, metaTitle: { fi: "Hinnat" }, metaDescription: {} };
  const merged = mergePageMeta(existing, patch);
  assert.equal(merged.metaTitle.en, "Old title", "untouched locale preserved");
  assert.equal(merged.metaTitle.fi, "Hinnat", "supplied locale written");
});

test("mergePageMeta preserves slug/parent/publish/metaImage and omits noindex", () => {
  const patch = { slug: "pricing", parentSlug: null, metaTitle: { en: "New" }, metaDescription: {} };
  const merged = mergePageMeta(existing, patch);
  assert.equal(merged.slug, "pricing");
  assert.equal(merged.publishStatus, "published");
  assert.equal(merged.metaImage.en, "/media/og.png", "OG image not blanked");
  assert.equal(merged.noindex, undefined, "noindex omitted → preserved by store");
  assert.equal(merged.localizedSlugs, undefined, "localizedSlugs omitted → preserved");
});

test("mergePageMeta lets an explicit empty string clear a locale", () => {
  const patch = { slug: "pricing", parentSlug: null, metaTitle: { en: "" }, metaDescription: {} };
  const merged = mergePageMeta(existing, patch);
  assert.equal(merged.metaTitle.en, "", "empty string clears the stored title");
});
