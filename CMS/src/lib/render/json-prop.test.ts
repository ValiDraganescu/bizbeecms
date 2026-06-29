/**
 * Renderer test for the `json` structured-prop channel (Combobox enabler).
 *
 * A `json` prop's value (a JSON string OR an already-parsed array/object) must
 * end up in the bound element as a JSON STRING — that is the ONLY way instance
 * data reaches a component's client script in this static-SSR, instance-blind-
 * script model (the script reads it back from the DOM attribute via JSON.parse).
 * This pins `slotString`'s array/object serialization through the public planPage.
 *
 * Relative `.ts` imports — `node --test` can't resolve the `@/` alias (CAVEATS).
 * Run: node --test src/lib/render/json-prop.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planPage,
  normalizeLabelExpr,
  type Block,
  type ComponentArtifact,
  type ElementPlan,
} from "./tree.ts";

test("normalizeLabelExpr: strips one surrounding backtick pair, trims, idempotent", () => {
  assert.equal(normalizeLabelExpr("`${name} ★ ${rating}`"), "${name} ★ ${rating}");
  assert.equal(normalizeLabelExpr("  `${name}`  "), "${name}");
  assert.equal(normalizeLabelExpr("${name} ★ ${rating}"), "${name} ★ ${rating}", "no backticks → unchanged");
  assert.equal(normalizeLabelExpr(normalizeLabelExpr("`${name}`")), "${name}", "idempotent");
  assert.equal(normalizeLabelExpr(""), "");
  assert.equal(normalizeLabelExpr(null), "");
  assert.equal(normalizeLabelExpr(undefined), "");
});

/** Find the first element plan carrying the given prop key. */
function findByProp(plan: ElementPlan, key: string): ElementPlan | undefined {
  if (plan.kind !== "element") return undefined;
  if (key in plan.props) return plan;
  for (const c of plan.children) {
    const hit = findByProp(c, key);
    if (hit) return hit;
  }
  return undefined;
}

type ElementOnly = Extract<ElementPlan, { kind: "element" }>;
/** Collect every element plan carrying the given prop key (depth-first). */
function collectByProp(plan: ElementPlan, key: string, out: ElementOnly[] = []): ElementOnly[] {
  if (plan.kind !== "element") return out;
  if (key in plan.props) out.push(plan);
  for (const c of plan.children) collectByProp(c, key, out);
  return out;
}

const combo: ComponentArtifact = {
  name: "Combobox",
  // The data-options attribute carries the structured prop into the DOM.
  tree: { tag: "div", props: { "data-options": "{{options}}" }, children: [] },
  propsSchema: JSON.stringify({ options: { type: "json", default: "[]" } }),
};
const components = new Map([[combo.name, combo]]);

test("json prop as a JSON STRING passes through verbatim into the attribute", () => {
  const blocks: Block[] = [
    { id: "b1", component: "Combobox", props: { options: '[{"id":1,"label":"A"}]' } },
  ];
  const { root } = planPage(blocks, components);
  const el = findByProp(root[0], "data-options");
  assert.ok(el && el.kind === "element");
  assert.equal(el.props["data-options"], '[{"id":1,"label":"A"}]');
  // Round-trips back to real data for the client script.
  assert.deepEqual(JSON.parse(el.props["data-options"] as string), [{ id: 1, label: "A" }]);
});

test("json prop as an already-parsed array is JSON-stringified into the attribute", () => {
  const blocks: Block[] = [
    { id: "b1", component: "Combobox", props: { options: [{ id: 2, label: "B" }] } },
  ];
  const { root } = planPage(blocks, components);
  const el = findByProp(root[0], "data-options");
  assert.ok(el && el.kind === "element");
  assert.equal(el.props["data-options"], '[{"id":2,"label":"B"}]');
});

test("missing json prop → empty attribute (script sees '' and defaults safely)", () => {
  const blocks: Block[] = [{ id: "b1", component: "Combobox", props: {} }];
  const { root } = planPage(blocks, components);
  const el = findByProp(root[0], "data-options");
  assert.ok(el && el.kind === "element");
  assert.equal(el.props["data-options"], "");
});

// ── List "combobox" presentation: component-per-row inside a select dropdown ──

// A simple item component to stamp as each option's row body.
const card: ComponentArtifact = {
  name: "Card",
  tree: { tag: "div", props: { className: "card" }, children: ["{{title}}"] },
  propsSchema: JSON.stringify({ title: { type: "string", default: "—" } }),
};
const withCard = new Map([
  ...components,
  [card.name, card],
]);

/** Collect every element whose tag === `tag`. */
function collectByTag(plan: ElementPlan, tag: string, out: ElementOnly[] = []): ElementOnly[] {
  if (plan.kind !== "element") return out;
  if (plan.tag === tag) out.push(plan);
  for (const c of plan.children) collectByTag(c, tag, out);
  return out;
}

test("List combobox: stamps the item component once PER ROW as selectable options", () => {
  const rows = [
    { id: "r1", name: "Sushi Bar" },
    { id: "r2", name: "Trattoria" },
    { id: "r3", name: "Taqueria" },
  ];
  const blocks: Block[] = [
    {
      id: "list1",
      component: "List",
      listSource: { collection: "content_restaurants", presentation: "combobox", select: "multiple" },
      listMap: { title: "name" }, // row field → item component prop
      listRows: rows,
      children: [{ id: "tpl", component: "Card", listRole: "template" }],
    },
  ];
  const { root, scripts, styles } = planPage(blocks, withCard);

  // One combobox shell (not one per row).
  const shells = collectByProp(root[0], "data-combobox-list");
  assert.equal(shells.length, 1);

  // One option per row, each carrying its stable value (the row id).
  const opts = collectByProp(root[0], "data-cb-option");
  assert.equal(opts.length, 3);
  assert.deepEqual(opts.map((o) => o.props["data-cb-value"]), ["r1", "r2", "r3"]);

  // Each option's body is the stamped Card with the mapped field as text.
  const bodyTexts = opts.map((o) => {
    const card = collectByTag(o, "div").find((d) => d.props.className === "card");
    const txt = card?.children.find((c) => c.kind === "text");
    return txt && txt.kind === "text" ? txt.text : "";
  });
  assert.deepEqual(bodyTexts, ["Sushi Bar", "Trattoria", "Taqueria"]);

  // The built-in combobox client script + CSS ship exactly once.
  assert.equal(scripts.filter((s) => s.includes("data-combobox-list")).length, 1);
  assert.equal(styles.filter((s) => s.includes("[data-combobox-list]")).length, 1);
});

test("List combobox: valueField overrides the option identity; min/max ride the shell", () => {
  const rows = [{ id: "r1", sku: "AAA", name: "A" }, { id: "r2", sku: "BBB", name: "B" }];
  const blocks: Block[] = [
    {
      id: "list1",
      component: "List",
      listSource: {
        collection: "content_x",
        presentation: "combobox",
        select: "single",
        valueField: "sku",
        min: 1,
        max: 1,
      },
      listMap: { title: "name" },
      listRows: rows,
      children: [{ id: "tpl", component: "Card", listRole: "template" }],
    },
  ];
  const { root } = planPage(blocks, withCard);
  const shell = collectByProp(root[0], "data-combobox-list")[0];
  assert.equal(shell.props["data-cb-multiple"], "false"); // single
  assert.equal(shell.props["data-cb-min"], "1");
  assert.equal(shell.props["data-cb-max"], "1");
  const opts = collectByProp(root[0], "data-cb-option");
  assert.deepEqual(opts.map((o) => o.props["data-cb-value"]), ["AAA", "BBB"]); // sku, not id
});

test("List combobox: labelField stamps data-cb-label; labelExpr stamps row JSON + expr", () => {
  const rows = [{ id: "1", name: "Sushi Bar", rating: 4.5 }, { id: "2", name: "Trattoria", rating: 4.8 }];
  const blocks: Block[] = [
    {
      id: "list1",
      component: "List",
      listSource: {
        collection: "content_x",
        presentation: "combobox",
        labelField: "name",
        labelExpr: "`${name} · ★ ${rating}`",
      },
      listMap: { title: "name" },
      listRows: rows,
      children: [{ id: "tpl", component: "Card", listRole: "template" }],
    },
  ];
  const { root } = planPage(blocks, withCard);
  // The expr is stamped on the root (data only — evaluated client-side) as a bare
  // template body: stored backticks are stripped, the client re-wraps before eval.
  const shell = collectByProp(root[0], "data-combobox-list")[0];
  assert.equal(shell.props["data-cb-label-expr"], "${name} · ★ ${rating}");
  // Each option carries its resolved label field + whole-row JSON for the expr.
  const opts = collectByProp(root[0], "data-cb-option");
  assert.deepEqual(opts.map((o) => o.props["data-cb-label"]), ["Sushi Bar", "Trattoria"]);
  assert.deepEqual(
    opts.map((o) => JSON.parse(o.props["data-cb-row"] as string)),
    rows,
  );
});

test("List combobox: no label config → no label/row/expr attributes stamped", () => {
  const rows = [{ id: "1", name: "A" }];
  const blocks: Block[] = [
    {
      id: "list1",
      component: "List",
      listSource: { collection: "content_x", presentation: "combobox" },
      listMap: { title: "name" },
      listRows: rows,
      children: [{ id: "tpl", component: "Card", listRole: "template" }],
    },
  ];
  const { root } = planPage(blocks, withCard);
  const shell = collectByProp(root[0], "data-combobox-list")[0];
  assert.equal("data-cb-label-expr" in shell.props, false);
  const opt = collectByProp(root[0], "data-cb-option")[0];
  assert.equal("data-cb-label" in opt.props, false);
  assert.equal("data-cb-row" in opt.props, false);
});

test("List default presentation still renders a flat stamped row per item (unchanged)", () => {
  const rows = [{ id: "1", name: "A" }, { id: "2", name: "B" }];
  const blocks: Block[] = [
    {
      id: "list1",
      component: "List",
      listSource: { collection: "content_x" }, // no presentation → flat "list"
      listMap: { title: "name" },
      listRows: rows,
      children: [{ id: "tpl", component: "Card", listRole: "template" }],
    },
  ];
  const { root } = planPage(blocks, withCard);
  // No combobox shell; two stamped cards.
  assert.equal(collectByProp(root[0], "data-combobox-list").length, 0);
  const cards = collectByTag(root[0], "div").filter((d) => d.props.className === "card");
  assert.equal(cards.length, 2);
});
