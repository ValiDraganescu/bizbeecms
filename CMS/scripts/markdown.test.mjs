/**
 * Pure tests for the dependency-free chat Markdown parser. Covers the subset an
 * assistant actually emits; the component renders the tree as safe React nodes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { parseInline, parseMarkdown } from "../src/lib/chat/markdown.ts";

test("inline: bold, italic, code, link, and literal text", () => {
  assert.deepEqual(parseInline("a **b** c"), [
    { type: "text", value: "a " },
    { type: "bold", children: [{ type: "text", value: "b" }] },
    { type: "text", value: " c" },
  ]);
  assert.deepEqual(parseInline("an _em_ word"), [
    { type: "text", value: "an " },
    { type: "italic", children: [{ type: "text", value: "em" }] },
    { type: "text", value: " word" },
  ]);
  assert.deepEqual(parseInline("use `npm test`"), [
    { type: "text", value: "use " },
    { type: "code", value: "npm test" },
  ]);
  assert.deepEqual(parseInline("[docs](https://x.com)"), [
    { type: "link", href: "https://x.com", children: [{ type: "text", value: "docs" }] },
  ]);
});

test("inline: code contents are literal (no nested emphasis)", () => {
  assert.deepEqual(parseInline("`a **b**`"), [{ type: "code", value: "a **b**" }]);
});

test("inline: unterminated marker stays literal", () => {
  assert.deepEqual(parseInline("a * b"), [{ type: "text", value: "a * b" }]);
});

test("block: heading levels", () => {
  const b = parseMarkdown("# Title\n### Sub");
  assert.equal(b[0].type, "heading");
  assert.equal(b[0].level, 1);
  assert.equal(b[1].level, 3);
});

test("block: fenced code keeps body verbatim + lang", () => {
  const b = parseMarkdown("```js\nconst x = 1;\n```");
  assert.deepEqual(b[0], { type: "code", value: "const x = 1;", lang: "js" });
});

test("block: fenced code does NOT parse markdown inside", () => {
  const b = parseMarkdown("```\n# not a heading\n- not a list\n```");
  assert.equal(b.length, 1);
  assert.equal(b[0].type, "code");
  assert.match(b[0].value, /# not a heading/);
});

test("block: unordered + ordered lists", () => {
  const ul = parseMarkdown("- one\n- two");
  assert.equal(ul[0].type, "list");
  assert.equal(ul[0].ordered, false);
  assert.equal(ul[0].items.length, 2);

  const ol = parseMarkdown("1. first\n2. second");
  assert.equal(ol[0].ordered, true);
  assert.equal(ol[0].items.length, 2);
});

test("block: list items parse inline markup", () => {
  const b = parseMarkdown("- a **bold** item");
  assert.deepEqual(b[0].items[0].children[1], { type: "bold", children: [{ type: "text", value: "bold" }] });
});

test("block: nested list — indented items become a sublist on the parent item", () => {
  const b = parseMarkdown("- top\n  - child a\n  - child b\n- top two");
  assert.equal(b[0].type, "list");
  assert.equal(b[0].items.length, 2, "two top-level items");
  const sub = b[0].items[0].sublist;
  assert.ok(sub, "first item has a sublist");
  assert.equal(sub.items.length, 2);
  assert.deepEqual(sub.items[0].children, [{ type: "text", value: "child a" }]);
  assert.equal(b[0].items[1].sublist, undefined, "second item has no sublist");
});

test("block: nested list can mix ordered under unordered", () => {
  const b = parseMarkdown("- steps\n  1. first\n  2. second");
  assert.equal(b[0].ordered, false);
  assert.equal(b[0].items[0].sublist.ordered, true);
  assert.equal(b[0].items[0].sublist.items.length, 2);
});

test("block: nested list three levels deep", () => {
  const b = parseMarkdown("- a\n  - b\n    - c");
  const c = b[0].items[0].sublist.items[0].sublist;
  assert.ok(c);
  assert.deepEqual(c.items[0].children, [{ type: "text", value: "c" }]);
});

test("block: table — header + rows with inline markup in cells", () => {
  const md = "| Name | Status |\n| --- | --- |\n| Hero | **live** |\n| Footer | draft |";
  const b = parseMarkdown(md);
  assert.equal(b[0].type, "table");
  assert.deepEqual(b[0].header.map((c) => c[0].value), ["Name", "Status"]);
  assert.equal(b[0].rows.length, 2);
  assert.deepEqual(b[0].rows[0][0], [{ type: "text", value: "Hero" }]);
  assert.deepEqual(b[0].rows[0][1], [{ type: "bold", children: [{ type: "text", value: "live" }] }]);
});

test("block: table delimiter with alignment colons is recognized", () => {
  const md = "| a | b |\n| :-- | --: |\n| 1 | 2 |";
  const b = parseMarkdown(md);
  assert.equal(b[0].type, "table");
  assert.equal(b[0].rows.length, 1);
});

test("block: a pipe line with NO delimiter row is a plain paragraph, not a table", () => {
  const b = parseMarkdown("| just | text |\nmore text");
  assert.equal(b[0].type, "paragraph");
});

test("block: paragraphs separated by blank line; soft-wrap joined", () => {
  const b = parseMarkdown("first line\nsame para\n\nsecond para");
  assert.equal(b.length, 2);
  assert.equal(b[0].type, "paragraph");
  assert.equal(b[1].type, "paragraph");
});

test("block: blockquote joins consecutive > lines", () => {
  const b = parseMarkdown("> a\n> b");
  assert.equal(b[0].type, "blockquote");
  assert.deepEqual(b[0].children, [{ type: "text", value: "a b" }]);
});

test("a realistic assistant message parses into mixed blocks", () => {
  const msg = [
    "Here's what I did:",
    "",
    "## Changes",
    "- Added a **Hero** component",
    "- Updated the `home` page",
    "",
    "```tsx",
    "<Hero title='Hi' />",
    "```",
  ].join("\n");
  const b = parseMarkdown(msg);
  assert.deepEqual(b.map((x) => x.type), ["paragraph", "heading", "list", "code"]);
});
