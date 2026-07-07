/**
 * planPage integration for the JSON-LD component kind (node --test).
 *
 * A block whose component is `kind:"jsonld"` must:
 *  - contribute its interpolated payload to `plan.jsonLd` (not the visible root),
 *  - render a HIDDEN placeholder in the flow (occupies its slot; no visible text),
 *  - honor schema DEFAULTS for unset props (the planPage merge, not the pure builder),
 *  - resolve LOCALE objects in props before binding,
 *  - coexist with html components + auto breadcrumb (append semantics tested elsewhere).
 *
 * Relative `.ts` imports — node --test can't resolve `@/` (CAVEATS).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { planPage, type Block, type ComponentArtifact, type ElementPlan } from "./tree.ts";

/** Recursively collect all text-node strings from a plan (to prove NO visible text). */
function texts(root: ElementPlan[]): string[] {
  const out: string[] = [];
  const walk = (n: ElementPlan) => {
    if (n.kind === "text") out.push(n.text);
    else n.children.forEach(walk);
  };
  root.forEach(walk);
  return out;
}

const jsonLdComponent: ComponentArtifact = {
  name: "ProductLd",
  kind: "jsonld",
  tree: "",
  jsonTemplate:
    '{"@context":"https://schema.org","@type":"Product","name":"{{name}}","description":"{{t desc}}","aggregateRating":{"@type":"AggregateRating","ratingValue":{{rating}}}}',
  propsSchema: JSON.stringify({
    name: { type: "string", default: "Untitled" },
    desc: { type: "string", translatable: true },
    rating: { type: "number", default: 0 },
  }),
};
const components = new Map<string, ComponentArtifact>([["ProductLd", jsonLdComponent]]);

function unescape(s: string): string {
  return s.replace(/\\u003c/g, "<").replace(/\\u003e/g, ">").replace(/\\u0026/g, "&");
}

test("a jsonld block funnels onto plan.jsonLd, not the visible root", () => {
  const blocks: Block[] = [
    { id: "b1", component: "ProductLd", props: { name: "Widget", desc: "Great", rating: 4.5 } },
  ];
  const { root, jsonLd } = planPage(blocks, components);
  assert.ok(jsonLd && jsonLd.length === 1, "one jsonLd payload emitted");
  assert.deepEqual(JSON.parse(unescape(jsonLd![0])), {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Widget",
    description: "Great",
    aggregateRating: { "@type": "AggregateRating", ratingValue: 4.5 },
  });
  // No visible text leaks into the rendered page.
  assert.deepEqual(texts(root), [], "jsonld component renders no visible text");
});

test("unset props fall back to schema defaults (planPage merge)", () => {
  const blocks: Block[] = [
    { id: "b1", component: "ProductLd", props: { desc: "x" } },
  ];
  const { jsonLd } = planPage(blocks, components);
  const data = JSON.parse(unescape(jsonLd![0]));
  assert.equal(data.name, "Untitled"); // default applied
  assert.equal(data.aggregateRating.ratingValue, 0); // number default spliced
});

test("locale-object props resolve to the active locale before binding", () => {
  const blocks: Block[] = [
    {
      id: "b1",
      component: "ProductLd",
      props: { name: { en: "Hello", fi: "Moi" }, desc: "d", rating: 1 },
    },
  ];
  const { jsonLd } = planPage(blocks, components, { locale: "fi", fallback: "en" });
  assert.equal(JSON.parse(unescape(jsonLd![0])).name, "Moi");
});

test("a broken jsonld template emits no payload but still a hidden marker", () => {
  const broken = new Map<string, ComponentArtifact>([
    ["Bad", { name: "Bad", kind: "jsonld", tree: "", jsonTemplate: '{"n":"{{name}}"', propsSchema: JSON.stringify({ name: {} }) }],
  ]);
  const { root, jsonLd } = planPage([{ id: "b", component: "Bad", props: { name: "x" } }], broken);
  assert.ok(!jsonLd || jsonLd.length === 0, "no payload from an unparseable template");
  assert.deepEqual(texts(root), [], "still no visible text");
});
