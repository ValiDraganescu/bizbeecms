/**
 * hreflang — canonical + alternate locale paths (Stage 1 SEO slice).
 * Dep-free node --test (project convention).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { pathForLocale, hreflangAlternates } from "./hreflang.ts";

const CODES = ["en", "fi", "ro-ro", "es"];

// ── pathForLocale ────────────────────────────────────────────────────────────

test("default locale stays unprefixed", () => {
  assert.equal(pathForLocale(["about"], "en", "en"), "/about");
  assert.equal(pathForLocale(["blog", "hello"], "en", "en"), "/blog/hello");
});

test("non-default locale gets the /code/ prefix", () => {
  assert.equal(pathForLocale(["about"], "fi", "en"), "/fi/about");
  assert.equal(pathForLocale(["blog", "hello"], "ro-ro", "en"), "/ro-ro/blog/hello");
});

test("root: default → /, non-default → /code (no trailing slash → no 308)", () => {
  assert.equal(pathForLocale([], "en", "en"), "/");
  assert.equal(pathForLocale([], "fi", "en"), "/fi");
});

test("default-locale match is case-insensitive", () => {
  assert.equal(pathForLocale(["about"], "EN", "en"), "/about");
});

test("segments are normalized: encoded and decoded inputs give one URL", () => {
  assert.equal(pathForLocale(["caf%C3%A9"], "en", "en"), "/caf%C3%A9");
  assert.equal(pathForLocale(["café"], "en", "en"), "/caf%C3%A9");
});

test("empty segments are dropped (defensive against //)", () => {
  assert.equal(pathForLocale(["", "about"], "fi", "en"), "/fi/about");
});

// ── hreflangAlternates ───────────────────────────────────────────────────────

test("default-locale request: canonical unprefixed, alternates for every code + x-default", () => {
  const { canonical, languages } = hreflangAlternates(["about"], CODES, "en");
  assert.equal(canonical, "/about");
  assert.deepEqual(languages, {
    en: "/about",
    fi: "/fi/about",
    "ro-ro": "/ro-ro/about",
    es: "/es/about",
    "x-default": "/about",
  });
});

test("non-default request: canonical keeps its own prefix (self-canonical per locale)", () => {
  const { canonical, languages } = hreflangAlternates(["fi", "about"], CODES, "en");
  assert.equal(canonical, "/fi/about");
  assert.equal(languages["x-default"], "/about");
  assert.equal(languages.fi, "/fi/about");
});

test("root request maps across locales", () => {
  const def = hreflangAlternates(undefined, CODES, "en");
  assert.equal(def.canonical, "/");
  assert.deepEqual(def.languages.fi, "/fi");
  const fi = hreflangAlternates(["fi"], CODES, "en");
  assert.equal(fi.canonical, "/fi");
  assert.equal(fi.languages["x-default"], "/");
});

test("single configured locale: canonical only, no hreflang noise", () => {
  const { canonical, languages } = hreflangAlternates(["about"], ["en"], "en");
  assert.equal(canonical, "/about");
  assert.deepEqual(languages, {});
});

test("a leading segment equal to the DEFAULT code is a slug, not a prefix", () => {
  // peelLocaleSegment never peels the default code — mirrors routing.
  const { canonical } = hreflangAlternates(["en", "child"], CODES, "en");
  assert.equal(canonical, "/en/child");
});

// ── Stage 2: localized slugs ─────────────────────────────────────────────────

/** Toy translator: fi renames /terms → /ehdot (chains under it included). */
function fiTranslate(path: string, locale: string): string {
  if (locale !== "fi") return path;
  return path === "/terms" || path.startsWith("/terms/")
    ? "/ehdot" + path.slice("/terms".length)
    : path;
}

test("pathForLocale with translate emits the locale's slug chain under the prefix", () => {
  assert.equal(pathForLocale(["terms"], "fi", "en", fiTranslate), "/fi/ehdot");
  assert.equal(pathForLocale(["terms", "gdpr"], "fi", "en", fiTranslate), "/fi/ehdot/gdpr");
  // Untranslated pages keep the prefix-only rewrite.
  assert.equal(pathForLocale(["about"], "fi", "en", fiTranslate), "/fi/about");
});

test("pathForLocale: translate never runs for the default locale; root stays /code", () => {
  let called = false;
  const spy = (path: string) => ((called = true), path);
  assert.equal(pathForLocale(["terms"], "en", "en", spy), "/terms");
  assert.equal(called, false);
  assert.equal(pathForLocale([], "fi", "en", fiTranslate), "/fi");
});

test("hreflangAlternates prefers plan-time pagePaths (localized-slug request)", () => {
  // Request /fi/ehdot — its segments are the FI chain; a prefix-only rewrite
  // of them would emit /ehdot for en (404). pagePaths carries the truth.
  const pagePaths = {
    en: "/terms",
    fi: "/fi/ehdot",
    "ro-ro": "/ro-ro/terms",
    es: "/es/terms",
  };
  const { canonical, languages } = hreflangAlternates(
    ["fi", "ehdot"],
    CODES,
    "en",
    pagePaths,
  );
  assert.equal(canonical, "/fi/ehdot");
  assert.deepEqual(languages, { ...pagePaths, "x-default": "/terms" });
});

test("hreflangAlternates: missing pagePaths entries fall back to prefix-only", () => {
  const { canonical, languages } = hreflangAlternates(
    ["about"],
    CODES,
    "en",
    { fi: "/fi/meista" },
  );
  assert.equal(canonical, "/about"); // en missing from the map → fallback
  assert.equal(languages.fi, "/fi/meista");
  assert.equal(languages.es, "/es/about");
  assert.equal(languages["x-default"], "/about");
});
