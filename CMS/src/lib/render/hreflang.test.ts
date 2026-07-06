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
