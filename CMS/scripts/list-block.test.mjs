/**
 * content-collections Phase-2 Slice B — tests for the built-in `List` block.
 *
 * A List repeats a TEMPLATE component once per fetched row (rows hydrated into
 * `block.listRows` by buildPlanFromPage). `planList` (via planPage) stamps the
 * template per row, binding each row's mapped fields (`listMap`) into the
 * template component's DECLARED props — gated by the component's propsSchema
 * allowlist (the same `{{slot}}` binding the static path uses). GRACEFUL:
 * empty/dead/un-hydrated → the empty-state slot (or nothing), never a throw.
 *
 * Dep-free `node --test`; imports the REAL .ts modules via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  planPage,
  LIST_COMPONENT,
  BUILTIN_COMPONENTS,
  isBuiltinComponent,
} from "../src/lib/render/tree.ts";

// A simple Card component: one declared prop `title`, rendered into a {{title}} slot.
const card = {
  name: "Card",
  tree: { tag: "div", props: { class: "card" }, children: ["{{title}}"] },
  propsSchema: JSON.stringify({ title: { type: "string" } }),
};
const components = new Map([["Card", card]]);

function listBlock(rows, extra = {}) {
  return {
    id: "list1",
    component: LIST_COMPONENT,
    listSource: { collection: "content_posts" },
    listMap: { title: "name" },
    listRows: rows,
    children: [{ id: "tpl", component: "Card" }],
    ...extra,
  };
}

// Collect all text nodes in a plan subtree (for asserting stamped content).
function texts(plan) {
  const out = [];
  const walk = (n) => {
    if (n.kind === "text") out.push(n.text);
    else (n.children ?? []).forEach(walk);
  };
  (Array.isArray(plan) ? plan : [plan]).forEach(walk);
  return out;
}

test("LIST_COMPONENT is a registered built-in", () => {
  assert.equal(LIST_COMPONENT, "List");
  assert.ok(BUILTIN_COMPONENTS.includes("List"));
  assert.ok(isBuiltinComponent("List"));
  assert.ok(isBuiltinComponent("Section"));
  assert.equal(isBuiltinComponent("Card"), false);
});

test("N rows → N stamped template subtrees with mapped fields bound", () => {
  const rows = [{ name: "Alpha" }, { name: "Beta" }, { name: "Gamma" }];
  const { root } = planPage([listBlock(rows)], components);
  // The List renders one container with 3 stamped Cards.
  assert.equal(root.length, 1);
  const container = root[0];
  assert.equal(container.props["data-list"], "list1");
  assert.equal(container.children.length, 3);
  assert.deepEqual(texts(container), ["Alpha", "Beta", "Gamma"]);
});

test("empty rows → renders nothing (no empty-state authored)", () => {
  const { root } = planPage([listBlock([])], components);
  assert.equal(root[0].children.length, 0);
});

test("empty rows → renders the empty-state slot when authored", () => {
  const block = listBlock([], {
    children: [
      { id: "tpl", component: "Card", listRole: "template" },
      {
        id: "empty",
        component: "Card",
        listRole: "empty",
        props: { title: "Nothing here yet" },
      },
    ],
  });
  const { root } = planPage([block], components);
  // Only the empty-state stamps; the template does NOT (no rows).
  assert.deepEqual(texts(root[0]), ["Nothing here yet"]);
});

test("non-empty rows → empty-state slot is NOT rendered", () => {
  const block = listBlock([{ name: "One" }], {
    children: [
      { id: "tpl", component: "Card", listRole: "template" },
      { id: "empty", component: "Card", listRole: "empty", props: { title: "EMPTY" } },
    ],
  });
  const { root } = planPage([block], components);
  assert.deepEqual(texts(root[0]), ["One"]);
});

test("listMap respects the component's declared-prop allowlist", () => {
  // Map an UNDECLARED prop `secret` ← row.token. planBlock binds via the Card's
  // propsSchema (only `title`), so `secret` can't reach the tree — only {{title}}
  // exists anyway, and the undeclared prop is dropped. The row's `name` binds.
  const block = listBlock([{ name: "Visible", token: "s3cr3t" }], {
    listMap: { title: "name", secret: "token" },
  });
  const { root } = planPage([block], components);
  const t = texts(root[0]);
  assert.deepEqual(t, ["Visible"]);
  assert.ok(!t.join(" ").includes("s3cr3t"));
});

test("missing field on a row → template prop stays unbound (graceful blank)", () => {
  // Row lacks `name`; the {{title}} slot has no value → resolves to "".
  const { root } = planPage([listBlock([{ other: "x" }])], components);
  assert.deepEqual(texts(root[0]), [""]);
});

test("un-hydrated List (no listRows) → empty container, never throws", () => {
  const block = {
    id: "list1",
    component: LIST_COMPONENT,
    listSource: { collection: "content_posts" },
    listMap: { title: "name" },
    children: [{ id: "tpl", component: "Card" }],
  };
  const { root } = planPage([block], components);
  assert.equal(root[0].children.length, 0);
});

test("List requires NO D1 component row (built-in) — unknown template still hides gracefully", () => {
  // A template referencing a missing component → hidden placeholder per row, no throw.
  const block = listBlock([{ name: "A" }], {
    listMap: {},
    children: [{ id: "tpl", component: "Missing" }],
  });
  const { root } = planPage([block], components);
  assert.equal(root[0].children.length, 1);
  assert.equal(root[0].children[0].props["data-render-error"], 'unknown component "Missing"');
});
