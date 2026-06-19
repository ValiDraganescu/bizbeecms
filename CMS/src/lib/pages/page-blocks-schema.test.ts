/**
 * Pure tests for the page-builder Block-tab settings foundation:
 *  - parsePropsSchema — the widened field vocab (string/richtext/number/boolean/
 *    select + required/translatable/default/options, unknown→string).
 *  - validateBlockProps — the schema-aware coercion overload (type coercion +
 *    required-prop retention) AND the legacy Set allowlist still works.
 *  - findBlock / mergeBlockProps — the tree-walk lookup + nested prop merge that
 *    the Block tab needs now that components are selectable inside Section columns.
 *
 * Relative `.ts` imports — `node --test` can't resolve the `@/` tsconfig alias.
 * Run: npx tsc --noEmit && node --test src/lib/pages/page-blocks-schema.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parsePropsSchema,
  validateBlockProps,
  findBlock,
  mergeBlockProps,
  setLocalizedProp,
  localeFieldValue,
  SECTION_COMPONENT,
  SECTION_COLUMN_COMPONENT,
} from "./page-blocks.ts";
import type { Block } from "../render/tree.ts";

// ── parsePropsSchema ────────────────────────────────────────────────────────

test("parsePropsSchema: null/invalid → []", () => {
  assert.deepEqual(parsePropsSchema(null), []);
  assert.deepEqual(parsePropsSchema(""), []);
  assert.deepEqual(parsePropsSchema("not json"), []);
  assert.deepEqual(parsePropsSchema("[1,2]"), []); // array, not an object map
});

test("parsePropsSchema: each new field type round-trips", () => {
  const fields = parsePropsSchema(
    JSON.stringify({
      title: { type: "string", default: "Hi", translatable: true, required: true, label: "Title" },
      body: { type: "richtext", translatable: true },
      limit: { type: "number", default: 6 },
      featured: { type: "boolean", default: true },
      layout: {
        type: "select",
        default: "grid",
        options: ["grid", { value: "list", label: "List" }],
      },
      weird: { type: "mystery" }, // unknown → degrades to string
    }),
  );
  const by = Object.fromEntries(fields.map((f) => [f.name, f]));

  assert.equal(by.title.type, "string");
  assert.equal(by.title.translatable, true);
  assert.equal(by.title.required, true);
  assert.equal(by.title.label, "Title");
  assert.equal(by.title.default, "Hi");

  assert.equal(by.body.type, "richtext");
  assert.equal(by.body.translatable, true);

  assert.equal(by.limit.type, "number");
  assert.equal(by.limit.defaultValue, 6);
  assert.equal(by.limit.default, "6");

  assert.equal(by.featured.type, "boolean");
  assert.equal(by.featured.defaultValue, true);

  assert.equal(by.layout.type, "select");
  assert.deepEqual(by.layout.options, [
    { value: "grid", label: "grid" },
    { value: "list", label: "List" },
  ]);

  assert.equal(by.weird.type, "string"); // unknown type degrades
});

test("parsePropsSchema: translatable ignored on non-text types", () => {
  const [num] = parsePropsSchema(JSON.stringify({ n: { type: "number", translatable: true } }));
  assert.equal(num.translatable, false);
});

// ── validateBlockProps (schema overload) ────────────────────────────────────

test("validateBlockProps: coerces number/boolean/select; drops non-numeric", () => {
  const schema = parsePropsSchema(
    JSON.stringify({
      limit: { type: "number" },
      featured: { type: "boolean" },
      layout: { type: "select", options: ["grid", "list"] },
    }),
  );
  const out = validateBlockProps(
    { limit: "12", featured: "true", layout: "list", junk: "x" },
    schema,
  );
  assert.equal(out.limit, 12); // numeric string → number
  assert.equal(out.featured, true); // "true" → bool
  assert.equal(out.layout, "list"); // valid option kept
  assert.equal("junk" in out, false); // undeclared dropped

  const bad = validateBlockProps({ limit: "abc", layout: "off-menu" }, schema);
  assert.equal("limit" in bad, false); // non-numeric dropped
  assert.equal("layout" in bad, false); // not in options → dropped
  assert.equal(bad.featured, false); // boolean always present (default false)
});

test("validateBlockProps: required prop kept (default substituted), optional empty dropped", () => {
  const schema = parsePropsSchema(
    JSON.stringify({
      title: { type: "string", required: true, default: "Untitled" },
      sub: { type: "string" },
    }),
  );
  const out = validateBlockProps({ title: "", sub: "" }, schema);
  assert.equal(out.title, "Untitled"); // required → default kept
  assert.equal("sub" in out, false); // optional empty → dropped
});

test("validateBlockProps: legacy Set allowlist still works (no coercion)", () => {
  const out = validateBlockProps({ a: "x", b: "", c: 3 }, new Set(["a", "c"]));
  assert.deepEqual(out, { a: "x", c: 3 }); // b undeclared+empty dropped, c untouched
});

// ── translatable round-trip via setLocalizedProp/localeFieldValue ───────────

test("translatable prop round-trips per locale; non-translatable stays bare", () => {
  const locales = ["en", "fi", "et"];
  // Set EN then FI on a translatable prop.
  let val = setLocalizedProp(undefined, "en", "Hello", locales);
  val = setLocalizedProp(val, "fi", "Hei", locales);
  assert.deepEqual(val, { en: "Hello", fi: "Hei" });
  assert.equal(localeFieldValue(val, "en", "en"), "Hello");
  assert.equal(localeFieldValue(val, "fi", "en"), "Hei");
  assert.equal(localeFieldValue(val, "et", "en"), ""); // unset locale → empty

  // Single-locale site → bare string (no locale object).
  const bare = setLocalizedProp(undefined, "en", "Solo", ["en"]);
  assert.equal(bare, "Solo");
});

// ── findBlock / mergeBlockProps (tree-walk) ─────────────────────────────────

function tree(): Block[] {
  return [
    {
      id: "sec-1",
      component: SECTION_COMPONENT,
      props: { columns: 1 },
      children: [
        {
          id: "col-1",
          component: SECTION_COLUMN_COMPONENT,
          children: [{ id: "hero-1", component: "Hero", props: { title: "old" } }],
        },
      ],
    },
  ];
}

test("findBlock: locates a NESTED component (top-level find would miss it)", () => {
  const t = tree();
  assert.equal(findBlock(t, "hero-1")?.component, "Hero");
  assert.equal(findBlock(t, "sec-1")?.id, "sec-1");
  assert.equal(findBlock(t, "nope"), null);
});

test("mergeBlockProps: replaces a nested block's props immutably; {} drops props", () => {
  const t = tree();
  const next = mergeBlockProps(t, "hero-1", { title: "new", subtitle: "x" });
  assert.deepEqual(findBlock(next, "hero-1")!.props, { title: "new", subtitle: "x" });
  // original untouched
  assert.deepEqual(findBlock(t, "hero-1")!.props, { title: "old" });

  const cleared = mergeBlockProps(t, "hero-1", {});
  assert.equal("props" in findBlock(cleared, "hero-1")!, false);

  // missing id → no-op (returns mapped tree, hero unchanged)
  const noop = mergeBlockProps(t, "ghost", { x: 1 });
  assert.deepEqual(findBlock(noop, "hero-1")!.props, { title: "old" });
});
