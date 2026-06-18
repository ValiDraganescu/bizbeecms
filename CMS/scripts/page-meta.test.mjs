/**
 * C2 regression: the page-management admin UI's pure layer.
 *
 *   1. `validatePageMeta` — the untrusted-input gate the REST route + form rely
 *      on (slug grammar, parent rules, publish status, per-locale SEO maps).
 *   2. The `pages` i18n namespace must exist with IDENTICAL keys in all three
 *      admin-UI catalogs (EN/FI/ET) — a missing key throws at render.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isValidSlug, validatePageMeta } from "../src/lib/pages/page-meta.ts";

const here = dirname(fileURLToPath(import.meta.url));
const msgDir = join(here, "..", "messages");
const load = (l) => JSON.parse(readFileSync(join(msgDir, `${l}.json`), "utf8"));

function keys(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...keys(v, path));
    else out.push(path);
  }
  return out;
}

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

test("pages namespace exists with identical keys in EN/FI/ET", () => {
  const cats = { en: load("en"), fi: load("fi"), et: load("et") };
  for (const [l, cat] of Object.entries(cats)) {
    assert.ok(cat.pages, `${l}.json missing pages namespace`);
  }
  const en = keys(cats.en.pages).sort();
  assert.ok(en.length > 0, "EN pages has keys");
  for (const l of ["fi", "et"]) {
    assert.deepEqual(keys(cats[l].pages).sort(), en, `${l}.json pages keys differ from en.json`);
  }
  for (const [l, cat] of Object.entries(cats)) {
    for (const path of keys(cat.pages)) {
      const v = path.split(".").reduce((o, k) => o[k], cat.pages);
      assert.ok(typeof v === "string" && v.trim() !== "", `${l}: ${path} empty`);
    }
  }
});
