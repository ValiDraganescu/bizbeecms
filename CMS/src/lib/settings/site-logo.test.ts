/**
 * Pure validation for the site-logo setting (node --test; no @/ imports).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSiteLogoUrl } from "./site-logo.ts";

const KEY = "assets/logo_1712345678901_ab12cd34.png";

test("accepts a plain /media/<key> URL", () => {
  assert.equal(normalizeSiteLogoUrl(`/media/${KEY}`), `/media/${KEY}`);
  assert.equal(normalizeSiteLogoUrl(`  /media/${KEY}  `), `/media/${KEY}`);
});

test("empty string clears; non-strings are invalid", () => {
  assert.equal(normalizeSiteLogoUrl(""), "");
  assert.equal(normalizeSiteLogoUrl("   "), "");
  assert.equal(normalizeSiteLogoUrl(null), null);
  assert.equal(normalizeSiteLogoUrl(42), null);
});

test("keeps a valid ?w=&h= dims query, drops a garbage one", () => {
  assert.equal(
    normalizeSiteLogoUrl(`/media/${KEY}?w=320&h=120`),
    `/media/${KEY}?w=320&h=120`,
  );
  assert.equal(normalizeSiteLogoUrl(`/media/${KEY}?w=abc`), `/media/${KEY}`);
  assert.equal(normalizeSiteLogoUrl(`/media/${KEY}?foo=bar`), `/media/${KEY}`);
});

test("rejects non-media and traversal-shaped URLs", () => {
  assert.equal(normalizeSiteLogoUrl("https://evil.example/logo.png"), null);
  assert.equal(normalizeSiteLogoUrl("/media/../secret"), null);
  assert.equal(normalizeSiteLogoUrl("/media/assets/UPPER.png"), null);
  assert.equal(normalizeSiteLogoUrl("/uploads/logo.png"), null);
});
