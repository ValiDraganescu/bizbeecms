/**
 * Pure slug utilities — locale-prefix peel (path-locales-edge-cache Stage 1)
 * plus the pre-existing path normalization it composes with. Dep-free
 * `node --test` per project convention.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  peelLocaleSegment,
  resolveSlugPath,
  matchSlugSegment,
  effectiveSlug,
  HOME_SLUG,
} from "./slug.ts";

const LOCALES = ["en", "fi", "et", "ro-ro"];
const DEFAULT = "en";

test("non-default locale prefix is peeled", () => {
  assert.deepEqual(peelLocaleSegment(["fi", "about"], LOCALES, DEFAULT), {
    locale: "fi",
    rest: ["about"],
  });
});

test("unprefixed path resolves to the default locale, segments untouched", () => {
  assert.deepEqual(peelLocaleSegment(["about"], LOCALES, DEFAULT), {
    locale: "en",
    rest: ["about"],
  });
});

test("default-locale prefix is NOT peeled — resolves as an ordinary slug", () => {
  assert.deepEqual(peelLocaleSegment(["en", "about"], LOCALES, DEFAULT), {
    locale: "en",
    rest: ["en", "about"],
  });
});

test("root `/` (undefined and []) → default locale, empty rest", () => {
  assert.deepEqual(peelLocaleSegment(undefined, LOCALES, DEFAULT), {
    locale: "en",
    rest: [],
  });
  assert.deepEqual(peelLocaleSegment([], LOCALES, DEFAULT), {
    locale: "en",
    rest: [],
  });
});

test("bare `/<code>` → that locale + empty rest, which resolveSlugPath maps to HOME_SLUG", () => {
  const peeled = peelLocaleSegment(["fi"], LOCALES, DEFAULT);
  assert.deepEqual(peeled, { locale: "fi", rest: [] });
  assert.deepEqual(resolveSlugPath(peeled.rest), [HOME_SLUG]);
});

test("segment that is no configured locale is left alone", () => {
  assert.deepEqual(peelLocaleSegment(["fish", "about"], LOCALES, DEFAULT), {
    locale: "en",
    rest: ["fish", "about"],
  });
});

test("matching is case-insensitive but returns the stored code", () => {
  assert.deepEqual(peelLocaleSegment(["FI", "about"], LOCALES, DEFAULT), {
    locale: "fi",
    rest: ["about"],
  });
  assert.deepEqual(peelLocaleSegment(["RO-RO"], LOCALES, DEFAULT), {
    locale: "ro-ro",
    rest: [],
  });
});

test("URL-encoded first segment is decoded before matching", () => {
  // "ro%2Dro" decodes to "ro-ro"
  assert.deepEqual(peelLocaleSegment(["ro%2Dro", "despre"], LOCALES, DEFAULT), {
    locale: "ro-ro",
    rest: ["despre"],
  });
});

test("only the FIRST segment can be a locale prefix", () => {
  assert.deepEqual(peelLocaleSegment(["blog", "fi"], LOCALES, DEFAULT), {
    locale: "en",
    rest: ["blog", "fi"],
  });
});

test("wildcard-style deep paths keep their segments after a peel", () => {
  assert.deepEqual(
    peelLocaleSegment(["fi", "city", "helsinki"], LOCALES, DEFAULT),
    { locale: "fi", rest: ["city", "helsinki"] },
  );
});

// ── Stage 2: locale-aware matching (localizedSlugs[locale] ?? slug) ─────────

const about = { slug: "about", localizedSlugs: '{"fi":"meista","et":"meist"}' };
const contact = { slug: "contact", localizedSlugs: "{}" };
const city = { slug: ":city-slug", localizedSlugs: "{}" };

test("effectiveSlug: override wins in its locale, default slug elsewhere", () => {
  assert.equal(effectiveSlug(about, "fi"), "meista");
  assert.equal(effectiveSlug(about, "et"), "meist");
  assert.equal(effectiveSlug(about, "en"), "about");
  assert.equal(effectiveSlug(about, undefined), "about");
});

test("effectiveSlug: locale lookup is lowercased (keys stored lowercase)", () => {
  assert.equal(effectiveSlug(about, "FI"), "meista");
  assert.equal(effectiveSlug({ slug: "x", localizedSlugs: '{"ro-ro":"y"}' }, "RO-RO"), "y");
});

test("effectiveSlug: wildcard pages are locale-agnostic — overrides ignored", () => {
  const wild = { slug: ":city-slug", localizedSlugs: '{"fi":"kaupunki"}' };
  assert.equal(effectiveSlug(wild, "fi"), ":city-slug");
});

test("effectiveSlug: malformed/missing/empty stored maps fall back to slug", () => {
  assert.equal(effectiveSlug({ slug: "a", localizedSlugs: "not json" }, "fi"), "a");
  assert.equal(effectiveSlug({ slug: "a", localizedSlugs: null }, "fi"), "a");
  assert.equal(effectiveSlug({ slug: "a" }, "fi"), "a");
  assert.equal(effectiveSlug({ slug: "a", localizedSlugs: '{"fi":""}' }, "fi"), "a");
  assert.equal(effectiveSlug({ slug: "a", localizedSlugs: '{"fi":42}' }, "fi"), "a");
  assert.equal(effectiveSlug({ slug: "a", localizedSlugs: '"str"' }, "fi"), "a");
});

test("matchSlugSegment: localized slug resolves in its locale", () => {
  const siblings = [about, contact];
  assert.deepEqual(matchSlugSegment(siblings, "meista", "fi"), { page: about });
  // no fi override on contact → default slug still matches in fi
  assert.deepEqual(matchSlugSegment(siblings, "contact", "fi"), { page: contact });
});

test("matchSlugSegment: default slug does NOT match where an override exists (one canonical URL per locale)", () => {
  assert.equal(matchSlugSegment([about], "about", "fi"), null);
  // …and the override does not leak into other locales
  assert.equal(matchSlugSegment([about], "meista", "en"), null);
  assert.equal(matchSlugSegment([about], "meista"), null);
});

test("matchSlugSegment: wildcard fallback still captures params in any locale", () => {
  const siblings = [about, city];
  assert.deepEqual(matchSlugSegment(siblings, "helsinki", "fi"), {
    page: city,
    param: { name: "city-slug", value: "helsinki" },
  });
  // exact localized match beats the wildcard
  assert.deepEqual(matchSlugSegment(siblings, "meista", "fi"), { page: about });
});

test("matchSlugSegment: legacy no-locale calls behave as before", () => {
  const siblings = [about, contact, city];
  assert.deepEqual(matchSlugSegment(siblings, "about"), { page: about });
  assert.deepEqual(matchSlugSegment(siblings, "nope", "fi"), {
    page: city,
    param: { name: "city-slug", value: "nope" },
  });
});
