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
