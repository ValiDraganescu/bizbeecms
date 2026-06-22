// Pure tests for component tag helpers (component-kits Slice 1).
// node --test does NOT resolve the @/ alias → import via relative .ts path.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTags, parseTags, serializeTags, distinctTags, filterByTag } from "./tags.ts";

test("normalizeTags trims, drops empty, dedupes case-insensitively, sorts", () => {
  assert.deepEqual(
    normalizeTags(["  Marketing ", "blog", "", "  ", "BLOG", "marketing"]),
    ["blog", "Marketing"], // first spelling kept, sorted (b < M)
  );
});

test("normalizeTags ignores non-strings and over-long tags (untrusted input)", () => {
  const long = "x".repeat(41);
  assert.deepEqual(normalizeTags(["ok", 1, null, undefined, {}, long]), ["ok"]);
  assert.deepEqual(normalizeTags("nope" as unknown), []);
  assert.deepEqual(normalizeTags(undefined), []);
});

test("normalizeTags caps the tag count", () => {
  const many = Array.from({ length: 60 }, (_, i) => `tag${i}`);
  assert.equal(normalizeTags(many).length, 50);
});

test("parseTags reads the DB JSON column, never throws", () => {
  assert.deepEqual(parseTags('["a"," b ","a"]'), ["a", "b"]);
  assert.deepEqual(parseTags(null), []);
  assert.deepEqual(parseTags(""), []);
  assert.deepEqual(parseTags("not json"), []);
});

test("serializeTags emits canonical normalized JSON", () => {
  assert.equal(serializeTags([" B ", "a", "A"]), '["a","B"]');
  assert.equal(serializeTags("junk"), "[]");
});

test("distinctTags unions across components, deduped + sorted", () => {
  assert.deepEqual(
    distinctTags([
      { tags: ["blog", "dark"] },
      { tags: ["Blog", "marketing"] },
      { tags: undefined },
      { tags: '["raw-string-ignored"]' as unknown }, // non-array → empty
    ]),
    ["blog", "dark", "marketing"],
  );
});

test("filterByTag matches case-insensitively; empty tag = no filter", () => {
  const list = [
    { name: "Hero", tags: ["Marketing", "dark"] },
    { name: "Post", tags: ["blog"] },
    { name: "Static", tags: [] },
  ];
  assert.deepEqual(filterByTag(list, "marketing").map((c) => c.name), ["Hero"]);
  assert.deepEqual(filterByTag(list, "BLOG").map((c) => c.name), ["Post"]);
  assert.deepEqual(filterByTag(list, "").map((c) => c.name), ["Hero", "Post", "Static"]);
  assert.deepEqual(filterByTag(list, "   ").map((c) => c.name), ["Hero", "Post", "Static"]);
  assert.deepEqual(filterByTag(list, "nope"), []);
});
