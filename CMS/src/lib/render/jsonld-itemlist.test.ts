/**
 * List → schema.org ItemList JSON-LD (seo-robots).
 *
 * The one binding case a single jsonld component instance couldn't express: a
 * List's rows aggregated into ONE ItemList document (rich-result carousels /
 * category pages), instead of N separate per-row scripts. Enabled by
 * `listSource.itemList === true` + a jsonld-kind component as a List template
 * child. Each row's mapped fields (`listMap`) stamp onto the child's props, bind
 * into its JSON template, and nest under `itemListElement` as positioned ListItems.
 *
 * Also proves the DEFAULT (itemList off) still emits per-row scripts, and the
 * no-double-emit contract (itemList on never also emits per-row scripts).
 *
 * Relative `.ts` imports — node --test can't resolve `@/` (CAVEATS).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { planPage, type Block, type ComponentArtifact } from "./tree.ts";

const productLd: ComponentArtifact = {
  name: "ProductLd",
  kind: "jsonld",
  tree: "",
  jsonTemplate:
    '{"@context":"https://schema.org","@type":"Product","name":"{{name}}","offers":{"@type":"Offer","price":{{price}}}}',
  propsSchema: JSON.stringify({
    name: { type: "string", default: "Untitled" },
    price: { type: "number", default: 0 },
  }),
} as unknown as ComponentArtifact;
const components = new Map<string, ComponentArtifact>([["ProductLd", productLd]]);

function unescape(s: string): string {
  return s.replace(/\\u003c/g, "<").replace(/\\u003e/g, ">").replace(/\\u0026/g, "&");
}

function listBlock(itemList: boolean, rows: Array<Record<string, unknown>>): Block {
  return {
    id: "list1",
    component: "List",
    listSource: itemList ? { itemList: true } : {},
    listRows: rows,
    listMap: { name: "title", price: "cost" },
    children: [{ id: "tpl", component: "ProductLd", props: {} } as Block],
  } as unknown as Block;
}

const rows = [
  { title: "Widget", cost: 9.99 },
  { title: "Gadget", cost: 19.5 },
];

test("itemList mode aggregates rows into ONE ItemList (no per-row scripts)", () => {
  const plan = planPage([listBlock(true, rows)], components);
  assert.equal(plan.jsonLd?.length, 1, "exactly one aggregate script");
  const doc = JSON.parse(unescape(plan.jsonLd![0]));
  assert.equal(doc["@type"], "ItemList");
  assert.equal(doc.itemListElement.length, 2);
  assert.deepEqual(doc.itemListElement[0], {
    "@type": "ListItem",
    position: 1,
    item: {
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Widget",
      offers: { "@type": "Offer", price: 9.99 },
    },
  });
  assert.equal(doc.itemListElement[1].position, 2);
  assert.equal(doc.itemListElement[1].item.name, "Gadget");
  assert.equal(doc.itemListElement[1].item.offers.price, 19.5);
});

test("default (itemList off) still emits one per-row script — composition path", () => {
  const plan = planPage([listBlock(false, rows)], components);
  assert.equal(plan.jsonLd?.length, 2, "one Product script per row");
  const first = JSON.parse(unescape(plan.jsonLd![0]));
  assert.equal(first["@type"], "Product");
  assert.equal(first.name, "Widget");
});

test("empty rows in itemList mode emit nothing (never an empty ItemList)", () => {
  const plan = planPage([listBlock(true, [])], components);
  assert.equal((plan.jsonLd ?? []).length, 0);
});

test("a row that binds to invalid JSON is skipped, valid rows still list", () => {
  // A price that isn't numeric breaks the unquoted `{{price}}` slot → that item is
  // null and dropped; the good row still produces a valid ItemList of length 1.
  const badRows = [
    { title: "Bad", cost: "not-a-number" }, // splices `not-a-number` unquoted → invalid JSON
    { title: "Good", cost: 5 },
  ];
  const plan = planPage([listBlock(true, badRows)], components);
  assert.equal(plan.jsonLd?.length, 1);
  const doc = JSON.parse(unescape(plan.jsonLd![0]));
  assert.equal(doc.itemListElement.length, 1);
  assert.equal(doc.itemListElement[0].item.name, "Good");
  assert.equal(doc.itemListElement[0].position, 1);
});
