/**
 * Dep-free unit tests for the pure render-plan walker (epic A2 core).
 * Run: node --test scripts/render-tree.test.mjs
 *
 * Imports the TS module directly via Node's native type-stripping (the project
 * convention; no @/ alias, no React/drizzle imports — tree.ts is pure on purpose).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planTree,
  planPage,
  parseJsonColumn,
  columnVisibilityClass,
  columnStyle,
} from "../src/lib/render/tree.ts";

test("columnStyle: no props → inherits section align, zero spacing, transparent", () => {
  const s = columnStyle(undefined, "center", "flex-end");
  assert.equal(s.alignItems, "center");
  assert.equal(s.justifyContent, "flex-end");
  assert.equal(s.gap, "0px");
  assert.equal(s.paddingTop, "0rem");
  assert.equal(s.marginLeft, "0rem");
  assert.equal(s.backgroundColor, "transparent");
});

test("columnStyle: own align overrides the section default", () => {
  const s = columnStyle(
    { verticalAlign: "bottom", horizontalAlign: "center" },
    "flex-start",
    "flex-start",
  );
  assert.equal(s.alignItems, "flex-end");
  assert.equal(s.justifyContent, "center");
});

test("columnStyle: padding/margin honor per-side unit (rem default), gap is px, bg token passes through", () => {
  const s = columnStyle(
    {
      paddingTop: 2,
      paddingTopUnit: "px",
      paddingLeft: 1,
      marginBottom: 3,
      marginBottomUnit: "px",
      gap: 12,
      backgroundColor: "var(--color-surface)",
    },
    "flex-start",
    "flex-start",
  );
  assert.equal(s.paddingTop, "2px");
  assert.equal(s.paddingLeft, "1rem");
  assert.equal(s.marginBottom, "3px");
  assert.equal(s.gap, "12px");
  assert.equal(s.backgroundColor, "var(--color-surface)");
});

test("columnVisibilityClass: no flags → empty string", () => {
  assert.equal(columnVisibilityClass(undefined), "");
  assert.equal(columnVisibilityClass({}), "");
  assert.equal(columnVisibilityClass({ hideMobile: false, hideTablet: false }), "");
});

test("columnVisibilityClass: each flag emits its pb-hide-* class", () => {
  assert.equal(columnVisibilityClass({ hideMobile: true }), "pb-hide-mobile");
  assert.equal(columnVisibilityClass({ hideTablet: true }), "pb-hide-tablet");
  assert.equal(columnVisibilityClass({ hideDesktop: true }), "pb-hide-desktop");
});

test("columnVisibilityClass: multiple flags join in mobile/tablet/desktop order", () => {
  assert.equal(
    columnVisibilityClass({ hideDesktop: true, hideMobile: true, hideTablet: true }),
    "pb-hide-mobile pb-hide-tablet pb-hide-desktop",
  );
});

test("planPage: a hidden column carries the className on its cell", () => {
  const blocks = [
    {
      id: "s1",
      component: "Section",
      props: { columns: 1 },
      children: [{ id: "c1", component: "__section_column__", props: { hideMobile: true }, children: [] }],
    },
  ];
  const plan = planPage(blocks, new Map());
  const section = plan.root[0]; // outer data-section div
  const grid = section.children[0]; // <section> grid
  const col = grid.children[0]; // the column cell
  assert.equal(col.props.className, "pb-hide-mobile");
});

test("planTree: string node becomes a text plan", () => {
  assert.deepEqual(planTree("hello"), { kind: "text", text: "hello" });
});

test("planTree: element with props + children walks recursively", () => {
  const plan = planTree({
    tag: "div",
    props: { className: "box" },
    children: ["x", { tag: "span", children: ["y"] }],
  });
  assert.deepEqual(plan, {
    kind: "element",
    tag: "div",
    props: { className: "box" },
    children: [
      { kind: "text", text: "x" },
      { kind: "element", tag: "span", props: {}, children: [{ kind: "text", text: "y" }] },
    ],
  });
});

test("planTree: missing props/children default to {} and []", () => {
  assert.deepEqual(planTree({ tag: "br" }), {
    kind: "element",
    tag: "br",
    props: {},
    children: [],
  });
});

test("planTree: invalid node throws", () => {
  assert.throws(() => planTree({ props: { a: 1 } }), /Invalid tree node/);
  assert.throws(() => planTree(null), /Invalid tree node/);
});

// ── planPage ────────────────────────────────────────────────────────────────

const card = {
  name: "Card",
  tree: { tag: "div", props: { className: "card" }, children: ["hi"] },
  script: "/*card*/",
};
const slot = {
  name: "Slot",
  tree: { tag: "section", props: {}, children: [] },
  // no script
};

function mapOf(...arts) {
  return new Map(arts.map((a) => [a.name, a]));
}

test("planPage: resolves a block to its component tree", () => {
  const { root, scripts } = planPage(
    [{ id: "1", component: "Card" }],
    mapOf(card),
  );
  assert.equal(root.length, 1);
  assert.equal(root[0].tag, "div");
  assert.deepEqual(root[0].props, { className: "card" });
  assert.deepEqual(scripts, ["/*card*/"]);
});

test("planPage: unknown component renders a hidden placeholder, no throw", () => {
  const { root, scripts } = planPage(
    [{ id: "1", component: "Nope" }],
    mapOf(card),
  );
  assert.equal(root[0].tag, "div");
  assert.match(root[0].props["data-render-error"], /unknown component "Nope"/);
  assert.deepEqual(scripts, []);
});

test("planPage: a reused component ships its script only once, in first-use order", () => {
  const { scripts } = planPage(
    [
      { id: "1", component: "Slot" }, // no script
      { id: "2", component: "Card" },
      { id: "3", component: "Card" }, // reuse → not re-added
    ],
    mapOf(card, slot),
  );
  assert.deepEqual(scripts, ["/*card*/"]);
});

test("planPage: block children nest inside the resolved component root", () => {
  const { root } = planPage(
    [
      {
        id: "1",
        component: "Slot",
        children: [{ id: "2", component: "Card" }],
      },
    ],
    mapOf(card, slot),
  );
  // Slot's tree had no children; Card is appended.
  assert.equal(root[0].tag, "section");
  assert.equal(root[0].children.length, 1);
  assert.equal(root[0].children[0].tag, "div"); // the Card
});

test("planPage: children of a text-root component surface a placeholder", () => {
  const textComp = { name: "Txt", tree: "just text" };
  const { root } = planPage(
    [{ id: "1", component: "Txt", children: [{ id: "2", component: "Card" }] }],
    mapOf(textComp, card),
  );
  assert.match(root[0].props["data-render-error"], /cannot host children/);
});

// ── block-prop → component-prop binding (G1 follow-on) ───────────────────────

// A component with `{{slot}}`s in text + a string prop, declaring its props.
const bindable = {
  name: "Hero",
  tree: {
    tag: "a",
    props: { href: "{{href}}", className: "hero" },
    children: [
      { tag: "h1", children: ["{{title}}"] },
      { tag: "p", children: ["{{subtitle}}"] },
    ],
  },
  propsSchema: JSON.stringify({
    title: { type: "string", default: "T" },
    subtitle: { type: "string", default: "" },
    href: { type: "string", default: "#" },
  }),
};

// Find a text plan by walking the plan tree (helper for assertions).
function texts(plan, out = []) {
  if (plan.kind === "text") out.push(plan.text);
  else for (const c of plan.children) texts(c, out);
  return out;
}

test("planPage binding: a declared prop binds into its slot (text + prop value)", () => {
  const { root } = planPage(
    [
      {
        id: "1",
        component: "Hero",
        props: { title: "Hello", subtitle: "World", href: "/post/1" },
      },
    ],
    mapOf(bindable),
  );
  assert.equal(root[0].props.href, "/post/1");
  assert.deepEqual(texts(root[0]), ["Hello", "World"]);
});

test("planPage binding: an UNDECLARED block prop is dropped (never reaches the tree)", () => {
  // `evil` is not in propsSchema and has no slot; `title` binds normally.
  const { root } = planPage(
    [{ id: "1", component: "Hero", props: { title: "Hi", evil: "PWNED" } }],
    mapOf(bindable),
  );
  const all = JSON.stringify(root[0]);
  assert.ok(!all.includes("PWNED"), "undeclared prop must not appear anywhere");
  assert.deepEqual(texts(root[0]), ["Hi", ""]); // subtitle unbound → ""
});

test("planPage binding: an undeclared {{slot}} resolves to empty, not the literal", () => {
  const comp = {
    name: "Leaky",
    tree: { tag: "p", children: ["{{secret}}"] },
    // secret is NOT declared
    propsSchema: JSON.stringify({ title: { type: "string" } }),
  };
  const { root } = planPage(
    [{ id: "1", component: "Leaky", props: { secret: "x" } }],
    mapOf(comp),
  );
  assert.deepEqual(texts(root[0]), [""]);
});

test("planPage binding: an unsafe value stays plain text (no HTML injection)", () => {
  // The bound value is placed as plain text/prop DATA — the plan never holds
  // raw HTML; React escapes it downstream. We assert the value is the LITERAL
  // string (so React renders &lt;script&gt;, not a live <script>).
  const { root } = planPage(
    [
      {
        id: "1",
        component: "Hero",
        props: { title: "<script>alert(1)</script>", href: "javascript:1" },
      },
    ],
    mapOf(bindable),
  );
  assert.deepEqual(texts(root[0])[0], "<script>alert(1)</script>");
  assert.equal(root[0].props.href, "javascript:1"); // verbatim data, React-escaped on render
});

test("planPage binding: no propsSchema → nothing binds, slots pass through verbatim", () => {
  const comp = { name: "Raw", tree: { tag: "p", children: ["{{x}}"] } };
  const { root } = planPage(
    [{ id: "1", component: "Raw", props: { x: "v" } }],
    mapOf(comp),
  );
  assert.deepEqual(texts(root[0]), ["{{x}}"]); // undeclared component = no binding
});

test("planPage binding: locale-object prop value resolves before binding", () => {
  const { root } = planPage(
    [{ id: "1", component: "Hero", props: { title: { en: "Hi", fi: "Moi" } } }],
    mapOf(bindable),
    { locale: "fi", fallback: "en" },
  );
  assert.equal(texts(root[0])[0], "Moi");
});

// ── nested-component composition-by-tag (render gap closed) ──────────────────

import { collectTreeComponentTags } from "../src/lib/render/tree.ts";

// A leaf component, and a wrapper whose tree references it by PascalCase tag.
const author = {
  name: "AuthorCard",
  tree: { tag: "div", props: { className: "author" }, children: ["{{name}}"] },
  script: "/*author*/",
  propsSchema: JSON.stringify({ name: { type: "string", default: "" } }),
};
const wrapper = {
  name: "PostMeta",
  tree: {
    tag: "header",
    children: [{ tag: "AuthorCard", props: { name: "Ada" } }],
  },
  script: "/*meta*/",
};

test("planPage: a PascalCase tag resolves to the referenced component's tree", () => {
  const { root } = planPage(
    [{ id: "1", component: "PostMeta" }],
    mapOf(wrapper, author),
  );
  // header → AuthorCard's div, with the bound name text inside.
  assert.equal(root[0].tag, "header");
  assert.equal(root[0].children[0].tag, "div");
  assert.equal(root[0].children[0].props.className, "author");
  assert.deepEqual(texts(root[0].children[0]), ["Ada"]);
});

test("planPage: an unknown PascalCase tag becomes a hidden placeholder, no throw", () => {
  const { root } = planPage(
    [{ id: "1", component: "PostMeta" }],
    mapOf(wrapper), // AuthorCard missing
  );
  assert.match(
    root[0].children[0].props["data-render-error"],
    /unknown component "AuthorCard"/,
  );
});

test("planPage: a nested-by-tag component ships its script (once, with the wrapper's)", () => {
  const { scripts } = planPage(
    [{ id: "1", component: "PostMeta" }, { id: "2", component: "PostMeta" }],
    mapOf(wrapper, author),
  );
  // wrapper script first (it's the block root), then the nested author, each once.
  assert.deepEqual(scripts, ["/*meta*/", "/*author*/"]);
});

test("planPage: cyclic component references stop at the depth guard (no infinite loop)", () => {
  const a = { name: "Aaa", tree: { tag: "div", children: [{ tag: "Bbb" }] } };
  const b = { name: "Bbb", tree: { tag: "span", children: [{ tag: "Aaa" }] } };
  // Should return (not hang) and end in a "nested too deeply" placeholder.
  const { root } = planPage([{ id: "1", component: "Aaa" }], mapOf(a, b));
  const errs = [];
  (function walk(p) {
    if (p.props?.["data-render-error"]) errs.push(p.props["data-render-error"]);
    for (const c of p.children ?? []) walk(c);
  })(root[0]);
  assert.ok(errs.some((e) => /nested too deeply/.test(e)));
});

test("planTree without a compose context renders a PascalCase tag literally (back-compat)", () => {
  // No components map passed → old behaviour: the tag is emitted as-is.
  const plan = planTree({ tag: "AuthorCard", props: { name: "x" } });
  assert.equal(plan.tag, "AuthorCard");
  assert.equal(plan.kind, "element");
});

test("collectTreeComponentTags: enumerates only PascalCase tags, recursing", () => {
  const tree = {
    tag: "div",
    children: [
      { tag: "AuthorCard" },
      { tag: "span", children: [{ tag: "PostList" }] },
      "text",
    ],
  };
  assert.deepEqual([...collectTreeComponentTags(tree)].sort(), ["AuthorCard", "PostList"]);
});

// ── Section → Columns responsive grid ─────────────────────────────────────────

// Build a Section block with `n` columns, each holding a placeholder child so
// "collapse" doesn't zero them out.
function section(props, n) {
  const cols = Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    component: "__section_column__",
    children: [{ id: `x${i}`, component: "Card" }],
  }));
  return { id: "s", component: "Section", props, children: cols };
}

// The inner <section> grid style for a planned Section block.
function gridOf(block) {
  const { root } = planPage([block], mapOf(card));
  return root[0].children[0].props.style.gridTemplateColumns;
}

test("planSection: multi-column 'equal' uses responsive auto-fit (stacks when narrow)", () => {
  assert.equal(
    gridOf(section({ columns: 3, gap: 16 }, 3)),
    "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))",
  );
});

test("planSection: single column stays one full-width track (no auto-fit)", () => {
  assert.equal(gridOf(section({ columns: 1 }, 1)), "1fr");
});

test("planSection: 'collapse' keeps explicit fixed tracks (1fr/0fr), no auto-fit", () => {
  const block = {
    id: "s",
    component: "Section",
    props: { columns: 2, columnBehavior: "collapse" },
    children: [
      { id: "c0", component: "__section_column__", children: [{ id: "x", component: "Card" }] },
      { id: "c1", component: "__section_column__", children: [] }, // empty → 0fr
    ],
  };
  assert.equal(gridOf(block), "1fr 0fr");
});

// ── parseJsonColumn ───────────────────────────────────────────────────────────

test("parseJsonColumn: parses valid JSON", () => {
  assert.deepEqual(parseJsonColumn('[{"id":"1"}]', []), [{ id: "1" }]);
});

test("parseJsonColumn: empty / null / bad JSON returns fallback", () => {
  assert.deepEqual(parseJsonColumn("", []), []);
  assert.deepEqual(parseJsonColumn(null, []), []);
  assert.deepEqual(parseJsonColumn(undefined, { a: 1 }), { a: 1 });
  assert.deepEqual(parseJsonColumn("{not json", []), []);
});
