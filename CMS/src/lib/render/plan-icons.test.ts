/**
 * {{icon}} slot in the render walk (icon-sets epic). node --test.
 * Verifies: literal + dynamic icon slots expand into inline <svg> element plans
 * from the IconMap; unresolved icons drop; surrounding text is preserved; the
 * dynamic form pulls its name from a bound prop.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { planTree, bindTree, declaredProps, type IconMap } from "./plan-tree.ts";
import type { TreeNode, ElementPlan } from "./plan-types.ts";

// A pretend resolved icon: a tiny <svg> TreeNode (what parseHtml would produce).
function svgNode(mark: string): TreeNode {
  return { tag: "svg", props: { "data-icon": mark }, children: [{ tag: "path", props: { d: "M1 1" } }] };
}

const icons: IconMap = new Map([
  ["calendar", svgNode("calendar")],
  ["arrow-right", svgNode("arrow-right")],
]);

function childTags(plan: ElementPlan): string[] {
  if (plan.kind !== "element") return [];
  return plan.children.map((c) => (c.kind === "element" ? c.tag : `#text:${c.text}`));
}

test("literal {{icon \"name\"}} in text expands to an inline <svg> child", () => {
  const tree: TreeNode = { tag: "span", children: ['Book ', '{{icon "calendar"}}', " now"] };
  const plan = planTree(tree, undefined, { components: new Map(), depth: 0, icons });
  assert.deepEqual(childTags(plan), ["#text:Book ", "svg", "#text: now"]);
  // The svg carries the resolved icon's marker + its path child.
  const svg = (plan as Extract<ElementPlan, { kind: "element" }>).children[1];
  assert.equal(svg.kind, "element");
  assert.equal((svg as Extract<ElementPlan, { kind: "element" }>).props["data-icon"], "calendar");
});

test("unresolved icon renders nothing (slot disappears)", () => {
  const tree: TreeNode = { tag: "span", children: ['{{icon "missing"}}', "x"] };
  const plan = planTree(tree, undefined, { components: new Map(), depth: 0, icons });
  assert.deepEqual(childTags(plan), ["#text:x"]);
});

test("no IconMap → icon slot is left as literal text (no crash)", () => {
  const tree: TreeNode = { tag: "span", children: ['{{icon "calendar"}}'] };
  const plan = planTree(tree, undefined, { components: new Map(), depth: 0 });
  assert.deepEqual(childTags(plan), ['#text:{{icon "calendar"}}']);
});

test("dynamic {{icon prop}} binds the prop value to the literal form, then resolves", () => {
  // Component author writes {{icon glyph}}; the block supplies glyph:"arrow-right".
  const tree: TreeNode = { tag: "span", children: ["{{icon glyph}}"] };
  const declared = declaredProps(JSON.stringify({ glyph: { type: "icon", default: "calendar" } }));
  const bound = bindTree(tree, { glyph: "arrow-right" }, declared);
  // After binding, the dynamic slot is now the literal {{icon "arrow-right"}}.
  assert.deepEqual((bound as Extract<TreeNode, { tag: string }>).children, ['{{icon "arrow-right"}}']);
  const plan = planTree(bound, undefined, { components: new Map(), depth: 0, icons });
  assert.deepEqual(childTags(plan), ["svg"]);
});

test("dynamic {{icon prop}} with an unset/invalid value drops the slot", () => {
  const tree: TreeNode = { tag: "span", children: ["a", "{{icon glyph}}", "b"] };
  const declared = declaredProps(JSON.stringify({ glyph: { type: "icon" } }));
  // No value supplied for glyph → folds to "" → no icon.
  const bound = bindTree(tree, {}, declared);
  assert.deepEqual((bound as Extract<TreeNode, { tag: string }>).children, ["a", "", "b"]);
  const plan = planTree(bound, undefined, { components: new Map(), depth: 0, icons });
  // Empty middle text node is dropped; "a" and "b" remain.
  assert.deepEqual(childTags(plan), ["#text:a", "#text:b"]);
});

test("ordinary {{t}} / {{prop}} slots still bind normally alongside icons", () => {
  const tree: TreeNode = { tag: "span", children: ["{{t label}} {{icon glyph}}"] };
  const declared = declaredProps(
    JSON.stringify({ label: { type: "string" }, glyph: { type: "icon" } }),
  );
  const bound = bindTree(tree, { label: "Calendar", glyph: "calendar" }, declared);
  const plan = planTree(bound, undefined, { components: new Map(), depth: 0, icons });
  assert.deepEqual(childTags(plan), ["#text:Calendar ", "svg"]);
});
