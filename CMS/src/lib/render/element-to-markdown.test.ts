/**
 * element-to-markdown — ElementPlan → Markdown serializer for `.md` page variants.
 * Dep-free node --test (project convention).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  planToMarkdown,
  peelMarkdownSuffix,
} from "./element-to-markdown.ts";
import type { ElementPlan } from "./plan-types.ts";

const text = (t: string): ElementPlan => ({ kind: "text", text: t });
const el = (
  tag: string,
  children: ElementPlan[] = [],
  props: Record<string, unknown> = {},
): ElementPlan => ({ kind: "element", tag, props, children });

test("headings, paragraph, doc title + description", () => {
  const md = planToMarkdown(
    [el("h1", [text("Welcome")]), el("p", [text("Hello world.")]), el("h2", [text("More")])],
    { title: "About Us", description: "The story of us." },
  );
  assert.equal(
    md,
    "# About Us\n\n" +
      "_The story of us._\n\n" +
      "# Welcome\n\n" +
      "Hello world.\n\n" +
      "## More\n",
  );
});

test("links and images render inline; alt/href preserved", () => {
  const md = planToMarkdown([
    el("p", [
      text("See "),
      el("a", [text("our site")], { href: "https://x/about" }),
      text("."),
    ]),
    el("img", [], { src: "/media/logo.png", alt: "The Logo" }),
  ]);
  assert.equal(
    md,
    "See [our site](https://x/about).\n\n![The Logo](/media/logo.png)\n",
  );
});

test("emphasis wrappers and code", () => {
  const md = planToMarkdown([
    el("p", [
      el("strong", [text("bold")]),
      text(" and "),
      el("em", [text("italic")]),
      text(" and "),
      el("code", [text("x=1")]),
    ]),
  ]);
  assert.equal(md, "**bold** and _italic_ and `x=1`\n");
});

test("unordered + nested ordered list", () => {
  const md = planToMarkdown([
    el("ul", [
      el("li", [text("first")]),
      el("li", [
        text("second"),
        el("ol", [el("li", [text("a")]), el("li", [text("b")])]),
      ]),
    ]),
  ]);
  assert.equal(md, "- first\n- second\n  1. a\n  2. b\n");
});

test("script/style/nav chrome dropped", () => {
  const md = planToMarkdown([
    el("nav", [el("a", [text("skip me")], { href: "/x" })]),
    el("script", [text("evil()")]),
    el("style", [text(".a{}")]),
    el("p", [text("kept")]),
  ]);
  assert.equal(md, "kept\n");
});

test("transparent containers flow children through", () => {
  const md = planToMarkdown([
    el("div", [el("section", [el("h2", [text("Section")]), el("p", [text("body")])])]),
  ]);
  assert.equal(md, "## Section\n\nbody\n");
});

test("blockquote and hr and pre", () => {
  const md = planToMarkdown([
    el("blockquote", [el("p", [text("quoted line")])]),
    el("hr"),
    el("pre", [text("code\n  line2")]),
  ]);
  assert.equal(md, "> quoted line\n\n---\n\n```\ncode\n  line2\n```\n");
});

test("table renders a GFM table with header separator", () => {
  const md = planToMarkdown([
    el("table", [
      el("thead", [el("tr", [el("th", [text("A")]), el("th", [text("B")])])]),
      el("tbody", [el("tr", [el("td", [text("1")]), el("td", [text("2")])])]),
    ]),
  ]);
  assert.equal(md, "| A | B |\n| --- | --- |\n| 1 | 2 |\n");
});

test("markdown syntax chars in text are escaped", () => {
  const md = planToMarkdown([el("p", [text("use *stars* and _under_")])]);
  assert.equal(md, "use \\*stars\\* and \\_under\\_\n");
});

test("link with no text falls back to the href", () => {
  const md = planToMarkdown([
    el("p", [el("a", [], { href: "https://x/y" })]),
  ]);
  assert.equal(md, "[https://x/y](https://x/y)\n");
});

test("empty plan yields just a newline", () => {
  assert.equal(planToMarkdown([]), "\n");
  assert.equal(planToMarkdown([el("script", [text("x")])]), "\n");
});

// ── peelMarkdownSuffix ──────────────────────────────────────────────────────

test("peel .md off the last segment only", () => {
  assert.deepEqual(peelMarkdownSuffix(["about.md"]), { isMd: true, rest: ["about"] });
  assert.deepEqual(peelMarkdownSuffix(["blog", "hello.md"]), {
    isMd: true,
    rest: ["blog", "hello"],
  });
});

test("non-.md paths pass through unchanged", () => {
  assert.deepEqual(peelMarkdownSuffix(["about"]), { isMd: false, rest: ["about"] });
  assert.deepEqual(peelMarkdownSuffix(undefined), { isMd: false, rest: [] });
  assert.deepEqual(peelMarkdownSuffix([]), { isMd: false, rest: [] });
});

test("a .md inside a NON-last segment is not a variant", () => {
  assert.deepEqual(peelMarkdownSuffix(["a.md", "b"]), { isMd: false, rest: ["a.md", "b"] });
});

test("bare .md segment is not a variant (would map to home)", () => {
  assert.deepEqual(peelMarkdownSuffix([".md"]), { isMd: false, rest: [".md"] });
});

test("case-insensitive suffix", () => {
  assert.deepEqual(peelMarkdownSuffix(["About.MD"]), { isMd: true, rest: ["About"] });
});
