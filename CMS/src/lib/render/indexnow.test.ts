import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isValidIndexNowKey,
  generateIndexNowKey,
  buildSubmission,
  pageUrlsAllLocales,
} from "./indexnow.ts";
import type { PathPageRow } from "./localize-paths.ts";

test("isValidIndexNowKey accepts spec-shaped keys, rejects junk", () => {
  assert.ok(isValidIndexNowKey("a".repeat(8)));
  assert.ok(isValidIndexNowKey("abc123-DEF-456"));
  assert.ok(!isValidIndexNowKey("short")); // < 8
  assert.ok(!isValidIndexNowKey("a".repeat(129))); // > 128
  assert.ok(!isValidIndexNowKey("has space")); // space
  assert.ok(!isValidIndexNowKey("dot.dot.dot")); // '.' not allowed
  assert.ok(!isValidIndexNowKey(42));
  assert.ok(!isValidIndexNowKey(null));
});

test("generateIndexNowKey is 32 hex chars and passes validation", () => {
  const k = generateIndexNowKey(() => new Uint8Array([0, 1, 15, 16, 255, 128, 7, 200, 0, 1, 2, 3, 4, 5, 6, 7]));
  assert.equal(k, "00010f10ff8007c800010203" + "04050607");
  assert.equal(k.length, 32);
  assert.ok(isValidIndexNowKey(k));
});

test("buildSubmission builds a valid POST body, dedupes + drops foreign hosts", () => {
  const sub = buildSubmission("https://ex.com/", "abcdef12abcdef12", [
    "https://ex.com/a",
    "https://ex.com/a", // dupe
    "https://ex.com/fi/a",
    "https://evil.com/x", // foreign host — dropped
    "https://ex.com", // bare origin — allowed
  ]);
  assert.deepEqual(sub, {
    host: "ex.com",
    key: "abcdef12abcdef12",
    keyLocation: "https://ex.com/indexnow-key",
    urlList: ["https://ex.com/a", "https://ex.com/fi/a", "https://ex.com"],
  });
});

test("buildSubmission returns null on bad key / bad origin / empty urls", () => {
  assert.equal(buildSubmission("https://ex.com", "short", ["https://ex.com/a"]), null);
  assert.equal(buildSubmission("not-a-url", "abcdef12abcdef12", ["https://ex.com/a"]), null);
  assert.equal(buildSubmission("https://ex.com", "abcdef12abcdef12", []), null);
  // urls all foreign → empty after filter → null
  assert.equal(
    buildSubmission("https://ex.com", "abcdef12abcdef12", ["https://other.com/a"]),
    null,
  );
});

const rows: PathPageRow[] = [
  { id: "home", slug: "home", parentPageId: null },
  { id: "about", slug: "about", parentPageId: null, localizedSlugs: '{"fi":"tietoa"}' },
  { id: "wild", slug: ":name", parentPageId: null },
];

test("pageUrlsAllLocales emits default (unprefixed) + localized-slug URLs", () => {
  const urls = pageUrlsAllLocales("https://ex.com", rows, "about", "en", ["en", "fi"]);
  assert.deepEqual(urls, ["https://ex.com/about", "https://ex.com/fi/tietoa"]);
});

test("pageUrlsAllLocales: home page → root, /fi", () => {
  const urls = pageUrlsAllLocales("https://ex.com", rows, "home", "en", ["en", "fi"]);
  assert.deepEqual(urls, ["https://ex.com/", "https://ex.com/fi"]);
});

test("pageUrlsAllLocales: wildcard page has no enumerable URLs → []", () => {
  assert.deepEqual(pageUrlsAllLocales("https://ex.com", rows, "wild", "en", ["en", "fi"]), []);
});

test("pageUrlsAllLocales: unknown page or blank origin → []", () => {
  assert.deepEqual(pageUrlsAllLocales("https://ex.com", rows, "nope", "en", ["en"]), []);
  assert.deepEqual(pageUrlsAllLocales("", rows, "about", "en", ["en"]), []);
});

test("pageUrlsAllLocales: single-locale site emits one URL", () => {
  assert.deepEqual(pageUrlsAllLocales("https://ex.com/", rows, "about", "en", ["en"]), [
    "https://ex.com/about",
  ]);
});
