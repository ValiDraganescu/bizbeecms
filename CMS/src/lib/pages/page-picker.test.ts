import { test } from "node:test";
import assert from "node:assert/strict";
import { flattenPagesForPicker, pagePath, topLevelParents } from "./page-picker.ts";
import type { PageSummary } from "../../db/page-store.ts";

function page(over: Partial<PageSummary>): PageSummary {
  return {
    id: over.id ?? "id",
    slug: over.slug ?? "slug",
    parentPageId: over.parentPageId ?? null,
    parentSlug: over.parentSlug ?? null,
    publishStatus: over.publishStatus ?? "draft",
    metaTitle: over.metaTitle ?? {},
    metaDescription: over.metaDescription ?? {},
    metaImage: over.metaImage ?? {},
    localizedSlugs: over.localizedSlugs ?? {},
    cacheMaxAge: over.cacheMaxAge ?? 0,
    noindex: over.noindex ?? false,
    updatedAt: over.updatedAt ?? 0,
  };
}

test("pagePath builds /slug for top-level and /parent/slug for children", () => {
  assert.equal(pagePath({ slug: "about", parentSlug: null }), "/about");
  assert.equal(pagePath({ slug: "post", parentSlug: "blog" }), "/blog/post");
});

test("flattenPagesForPicker maps + sorts by path, surfacing publish state", () => {
  const opts = flattenPagesForPicker([
    page({ id: "2", slug: "post", parentPageId: "1", parentSlug: "blog" }),
    page({ id: "1", slug: "blog", publishStatus: "published" }),
    page({ id: "3", slug: "about" }),
  ]);
  assert.deepEqual(
    opts.map((o) => o.path),
    ["/about", "/blog", "/blog/post"],
  );
  assert.equal(opts.find((o) => o.id === "1")?.published, true);
  assert.equal(opts.find((o) => o.id === "3")?.published, false);
});

test("topLevelParents keeps only pages with no parent", () => {
  const parents = topLevelParents([
    page({ id: "1", slug: "blog" }),
    page({ id: "2", slug: "post", parentPageId: "1", parentSlug: "blog" }),
  ]);
  assert.deepEqual(
    parents.map((p) => p.slug),
    ["blog"],
  );
});
