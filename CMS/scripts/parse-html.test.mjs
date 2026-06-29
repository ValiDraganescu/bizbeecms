/**
 * Dep-free unit tests for the Handlebars-HTML → TreeNode parser.
 * Run: node --test scripts/parse-html.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHtml, treeToHtml, formatHtml } from "../src/lib/render/parse-html.ts";

test("nested elements with class → className and children", () => {
  const t = parseHtml("<div class='p-4'><h2>{{t title}}</h2><p>{{body}}</p></div>");
  assert.deepEqual(t, {
    tag: "div",
    props: { className: "p-4" },
    children: [
      { tag: "h2", children: ["{{t title}}"] },
      { tag: "p", children: ["{{body}}"] },
    ],
  });
});

test("slots survive verbatim in text and attributes", () => {
  const t = parseHtml('<a href="{{url}}">{{t label}}</a>');
  assert.equal(t.props.href, "{{url}}");
  assert.deepEqual(t.children, ["{{t label}}"]);
});

test("void element (img) needs no closing tag", () => {
  const t = parseHtml('<img src="/x.jpg" alt="hi">');
  assert.deepEqual(t, { tag: "img", props: { src: "/x.jpg", alt: "hi" }, children: [] });
});

test("self-closing slash is accepted", () => {
  const t = parseHtml('<br/>');
  assert.deepEqual(t, { tag: "br", children: [] });
});

test("style string parses to a camelCased object", () => {
  const t = parseHtml('<div style="color:red; margin-top: 4px">x</div>');
  assert.deepEqual(t.props.style, { color: "red", marginTop: "4px" });
});

test("boolean attribute → true", () => {
  const t = parseHtml('<input disabled>');
  assert.equal(t.props.disabled, true);
});

test("multiple top-level elements wrap in a div", () => {
  const t = parseHtml("<h1>a</h1><p>b</p>");
  assert.equal(t.tag, "div");
  assert.equal(t.children.length, 2);
  assert.equal(t.children[0].tag, "h1");
});

test("empty input → empty div, never throws", () => {
  assert.deepEqual(parseHtml(""), { tag: "div", children: [] });
  assert.deepEqual(parseHtml("   "), { tag: "div", children: [] });
});

test("unclosed tag auto-closes at end of input (no throw)", () => {
  const t = parseHtml("<div><p>hello");
  assert.equal(t.tag, "div");
  assert.equal(t.children[0].tag, "p");
  assert.deepEqual(t.children[0].children, ["hello"]);
});

test("entities decode; bound HTML is NOT injected (slot stays literal)", () => {
  const t = parseHtml("<p>a &amp; b &lt;ok&gt;</p>");
  assert.deepEqual(t.children, ["a & b <ok>"]);
});

test("PascalCase component tag is preserved for composition-by-tag", () => {
  const t = parseHtml('<AuthorCard name="{{author}}"></AuthorCard>');
  assert.equal(t.tag, "AuthorCard");
  assert.equal(t.props.name, "{{author}}");
});

test("class attribute maps to className, for maps to htmlFor", () => {
  const t = parseHtml('<label for="email" class="block">Email</label>');
  assert.equal(t.props.htmlFor, "email");
  assert.equal(t.props.className, "block");
});

test("formatHtml indents nested elements but keeps leaf text inline", () => {
  const t = parseHtml('<div class="p-4"><h1>{{t title}}</h1><p>{{body}}</p></div>');
  const out = formatHtml(t);
  assert.equal(
    out,
    '<div class="p-4">\n  <h1>{{t title}}</h1>\n  <p>{{body}}</p>\n</div>',
  );
});

test("formatHtml round-trips to the SAME tree as the compact form", () => {
  const samples = [
    '<div class="p-8" style="background:#0f172a"><h1 class="text-3xl" style="color:#fff">{{t title}}</h1><p>{{body}}</p><img src="{{img}}" alt="x"></div>',
    "<section><div><span>deep</span></div></section>",
    '<AuthorCard name="{{author}}"></AuthorCard>',
  ];
  for (const s of samples) {
    const t = parseHtml(s);
    assert.deepEqual(parseHtml(formatHtml(t)), t, s);
    assert.deepEqual(parseHtml(treeToHtml(t)), t, s);
  }
});

test("HTML comments are dropped, not rendered as text", () => {
  // The reported bug: <!-- Badge --> showed up as visible text in the render.
  assert.deepEqual(parseHtml("<div><!-- Badge --><span>{{t title}}</span></div>"), {
    tag: "div",
    children: [{ tag: "span", children: ["{{t title}}"] }],
  });
  // Comment between siblings, and an unterminated one swallowed to end.
  assert.deepEqual(parseHtml("<p>a</p><!-- x --><p>b</p>"), {
    tag: "div",
    children: [
      { tag: "p", children: ["a"] },
      { tag: "p", children: ["b"] },
    ],
  });
  assert.deepEqual(parseHtml("<div>ok<!-- unterminated"), {
    tag: "div",
    children: ["ok"],
  });
});

test("legacy escaped-comment text nodes are healed on read", () => {
  // A component saved BEFORE the tokenizer skipped comments baked the comment in
  // as text; treeToHtml stored it escaped. On re-parse it must NOT reappear.
  const stored = "<div>&lt;!-- Badge --&gt;<span>Title</span></div>";
  assert.deepEqual(parseHtml(stored), {
    tag: "div",
    children: [{ tag: "span", children: ["Title"] }],
  });
  // Mixed real text + escaped comment: keep the text, drop the comment.
  assert.deepEqual(parseHtml("<p>Hi &lt;!-- note --&gt; there</p>"), {
    tag: "p",
    children: ["Hi  there"],
  });
});
