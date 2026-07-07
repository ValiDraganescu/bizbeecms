import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeBase64Utf8, decodeBase64Utf8 } from "./base64-header.ts";

test("round-trips a multi-line JSON-LD template with non-ASCII content", () => {
  const template = `{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "{{name}}",
  "description": "Café — naïve façade — 日本語 — €",
  "aggregateRating": { "ratingValue": {{rating}} }
}`;
  assert.equal(decodeBase64Utf8(encodeBase64Utf8(template)), template);
});

test("decode returns empty string for null/empty/garbage input", () => {
  assert.equal(decodeBase64Utf8(null), "");
  assert.equal(decodeBase64Utf8(undefined), "");
  assert.equal(decodeBase64Utf8(""), "");
});
