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
} from "../src/lib/render/tree.ts";

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
