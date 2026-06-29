/**
 * @section mention parsing (pure). Covers the three string operations the chat
 * composer's autocomplete relies on: finding the open `@` token, filtering
 * sections, and splicing the chosen name back in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findActiveMention,
  filterSections,
  applyMention,
  segmentMentions,
} from "./mention.ts";

const sections = [
  { id: "s1", name: "Hero" },
  { id: "s2", name: "Hero Banner" },
  { id: "s3", name: "Pricing" },
  { id: "s4", name: "Footer CTA" },
];

test("findActiveMention: open token at the caret", () => {
  assert.deepEqual(findActiveMention("work on @He", 11), { at: 8, query: "He" });
});

test("findActiveMention: empty query right after @", () => {
  assert.deepEqual(findActiveMention("do @", 4), { at: 3, query: "" });
});

test("findActiveMention: query may contain spaces (section names do)", () => {
  assert.deepEqual(findActiveMention("@Hero Ban", 9), { at: 0, query: "Hero Ban" });
});

test("findActiveMention: @ must start the string or follow whitespace (not an email)", () => {
  assert.equal(findActiveMention("a@b", 3), null);
});

test("findActiveMention: a newline between @ and caret closes the token", () => {
  assert.equal(findActiveMention("@Hero\nmore", 10), null);
});

test("findActiveMention: no @ before the caret → null", () => {
  assert.equal(findActiveMention("just text", 9), null);
});

test("findActiveMention: only considers the @ left of the caret", () => {
  // caret is at index 4 (after "@He"), the later @ is ignored
  assert.deepEqual(findActiveMention("@He @Pricing", 3), { at: 0, query: "He" });
});

test("filterSections: prefix matches rank before substring, ties keep order", () => {
  // "ban" → "Hero Banner" (substring); prefix list empty here
  assert.deepEqual(
    filterSections(sections, "ban").map((s) => s.id),
    ["s2"],
  );
});

test("filterSections: case-insensitive prefix", () => {
  assert.deepEqual(
    filterSections(sections, "hero").map((s) => s.id),
    ["s1", "s2"],
  );
});

test("filterSections: empty query returns all (a fresh copy)", () => {
  const out = filterSections(sections, "");
  assert.equal(out.length, 4);
  assert.notEqual(out, sections, "returns a copy, not the input array");
});

test("filterSections: prefix before substring ordering", () => {
  const list = [
    { id: "a", name: "Top Hero" }, // substring "hero"
    { id: "b", name: "Hero" }, // prefix "hero"
  ];
  assert.deepEqual(
    filterSections(list, "hero").map((s) => s.id),
    ["b", "a"],
  );
});

test("applyMention: splices a backticked `@Name` + space and returns the new caret", () => {
  const text = "work on @He";
  const m = findActiveMention(text, 11)!;
  const out = applyMention(text, 11, m, "Hero Banner");
  assert.equal(out.text, "work on `@Hero Banner` ");
  assert.equal(out.caret, out.text.length);
});

test("applyMention: preserves text after the caret", () => {
  const text = "@He and then";
  const m = findActiveMention(text, 3)!;
  const out = applyMention(text, 3, m, "Hero");
  assert.equal(out.text, "`@Hero`  and then");
  assert.equal(out.caret, "`@Hero` ".length);
});

test("segmentMentions: splits plain runs and backticked @mention tokens", () => {
  const segs = segmentMentions("work on `@Hero` then `@Footer CTA` end");
  assert.deepEqual(segs, [
    { mention: false, text: "work on " },
    { mention: true, text: "`@Hero`" },
    { mention: false, text: " then " },
    { mention: true, text: "`@Footer CTA`" },
    { mention: false, text: " end" },
  ]);
});

test("segmentMentions: no mentions → one plain segment", () => {
  assert.deepEqual(segmentMentions("just text"), [{ mention: false, text: "just text" }]);
});

test("segmentMentions: a backticked token at the very start", () => {
  assert.deepEqual(segmentMentions("`@Hero` rest"), [
    { mention: true, text: "`@Hero`" },
    { mention: false, text: " rest" },
  ]);
});

test("segmentMentions: a plain `code` span (no @) is NOT a mention", () => {
  assert.deepEqual(segmentMentions("use `code` here"), [
    { mention: false, text: "use `code` here" },
  ]);
});
