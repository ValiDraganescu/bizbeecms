/**
 * Pure tests for the string-replace edit core (opencode-style cascading matchers).
 * The point: patch a span without rewriting the whole field, safely.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { applyEdit } from "../src/lib/chat/apply-edit.ts";

test("exact: replaces a unique substring, leaves the rest intact", () => {
  const r = applyEdit("hello world, hello sun", "world", "moon");
  assert.ok(r.ok);
  assert.equal(r.content, "hello moon, hello sun");
  assert.equal(r.matcher, "exact");
  assert.equal(r.replacements, 1);
});

test("non-unique without replaceAll → error (never patch the wrong place)", () => {
  const r = applyEdit("a a a", "a", "b");
  assert.ok(!r.ok);
  assert.match(r.error, /not unique/);
});

test("replaceAll replaces every exact occurrence", () => {
  const r = applyEdit("a a a", "a", "b", true);
  assert.ok(r.ok);
  assert.equal(r.content, "b b b");
  assert.equal(r.replacements, 3);
});

test("oldString not found → error", () => {
  const r = applyEdit("hello", "xyz", "q");
  assert.ok(!r.ok);
  assert.match(r.error, /not found/);
});

test("identical old/new → error", () => {
  const r = applyEdit("hello", "hello", "hello");
  assert.ok(!r.ok);
  assert.match(r.error, /identical/);
});

test("empty oldString → error (would match everywhere)", () => {
  const r = applyEdit("hello", "", "x");
  assert.ok(!r.ok);
});

test("line-trimmed: tolerates differing indentation on the matched line", () => {
  const content = "function f() {\n    return 1;\n}";
  // model reproduced the body line without its indentation
  const r = applyEdit(content, "return 1;", "return 2;");
  assert.ok(r.ok);
  assert.match(r.content, /return 2;/);
  // indentation preserved? line-trimmed replaces the whole line span, so the
  // matched line is swapped — acceptable; the surrounding lines are untouched.
  assert.match(r.content, /function f\(\) \{/);
  assert.match(r.content, /\}$/);
});

test("whitespace-normalized: matches despite collapsed internal spaces", () => {
  const content = "const   x    =     1;";
  const r = applyEdit(content, "const x = 1;", "const x = 2;");
  assert.ok(r.ok);
  assert.match(r.content, /const x = 2;/);
});

test("block-anchor: matches a >=3-line block by first/last line", () => {
  const content = "start\n  middle drifted  \nend\nother";
  const r = applyEdit(content, "start\nmiddle\nend", "REPLACED");
  assert.ok(r.ok);
  assert.match(r.content, /REPLACED/);
  assert.match(r.content, /other/);
});

test("a loose match can't swallow a huge span (window cap + overreach guard)", () => {
  // 500 spaces between a and b: the whitespace matcher must NOT collapse this into
  // one "a b" match and replace the whole 502-char span. Either the window cap
  // (no match) or the overreach guard rejects it — both leave content unpatched.
  const content = "a" + " ".repeat(500) + "b";
  const r = applyEdit(content, "a b", "X");
  assert.ok(!r.ok);
});

test("line-trimmed fires when the NEEDLE's own indentation differs from content", () => {
  // needle carries 6 leading spaces; content line has 2. exact can't match (the
  // needle string with its 6 spaces isn't a substring), so line-trimmed matches by
  // trimmed text and replaces the whole line. Neighbors untouched.
  const content = "keep\n  body line\nkeep2";
  const r = applyEdit(content, "      body line", "new body");
  assert.ok(r.ok);
  assert.equal(r.matcher, "line-trimmed");
  assert.equal(r.content, "keep\nnew body\nkeep2");
});

test("a realistic long-text patch changes only the targeted words", () => {
  const body =
    "You are the site assistant. Always be concise. Never invent image URLs. " +
    "Prefer existing components. Match the brand voice in everything.";
  const r = applyEdit(body, "Always be concise.", "Always be concise and friendly.");
  assert.ok(r.ok);
  assert.match(r.content, /concise and friendly/);
  assert.match(r.content, /Never invent image URLs/); // untouched
});
