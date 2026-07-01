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
  patchBlockProps,
  isImageProp,
  isLinkProp,
  linkNewTabProp,
  isLongText,
  translatableSlotNames,
  applyTranslatableFromSlots,
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

test("parsePropsSchema: translatable text default as a per-locale object is kept", () => {
  const [f] = parsePropsSchema(
    JSON.stringify({
      title: {
        type: "string",
        translatable: true,
        default: { en: "Our restaurants", fi: "Ravintolamme" },
      },
    }),
  );
  // The object reaches the renderer (resolveLocalized picks the active locale)…
  assert.deepEqual(f.defaultValue, { en: "Our restaurants", fi: "Ravintolamme" });
  // …and a display string (first locale) feeds the editor textarea.
  assert.equal(f.default, "Our restaurants");
  // A NON-translatable text prop with an object default is ignored (single value only).
  const [g] = parsePropsSchema(
    JSON.stringify({ title: { type: "string", default: { en: "x" } } }),
  );
  assert.equal(g.defaultValue, undefined);
  assert.equal(g.default, "");
});

test("isImageProp: type image, or string prop with an image-ish name → picker", () => {
  // Explicit type wins.
  assert.equal(isImageProp({ type: "image", name: "whatever" }), true);
  // String props whose NAME looks image-ish (upgrades existing components).
  assert.equal(isImageProp({ type: "string", name: "backgroundImage" }), true);
  assert.equal(isImageProp({ type: "string", name: "heroPhoto" }), true);
  assert.equal(isImageProp({ type: "string", name: "avatar" }), true);
  assert.equal(isImageProp({ type: "richtext", name: "logoSvg" }), true);
  // Plain text props that aren't images stay text inputs.
  assert.equal(isImageProp({ type: "string", name: "title" }), false);
  assert.equal(isImageProp({ type: "string", name: "subtitle" }), false);
  // Non-text scalar types are never images.
  assert.equal(isImageProp({ type: "number", name: "imageCount" }), false);
  // A translatable text prop is per-locale text, never an image.
  assert.equal(isImageProp({ type: "string", name: "image", translatable: true }), false);
});

test("isLinkProp: type link, or string prop with an href/url/link-ish name", () => {
  assert.equal(isLinkProp({ type: "link", name: "whatever" }), true);
  assert.equal(isLinkProp({ type: "string", name: "ctaHref" }), true);
  assert.equal(isLinkProp({ type: "string", name: "link1Href" }), true);
  assert.equal(isLinkProp({ type: "string", name: "profileUrl" }), true);
  // Plain text stays text.
  assert.equal(isLinkProp({ type: "string", name: "title" }), false);
  // Translatable = per-locale text, never a link.
  assert.equal(isLinkProp({ type: "string", name: "ctaHref", translatable: true }), false);
  // An image-ish name wins (imageUrl is an image, not a link).
  assert.equal(isLinkProp({ type: "string", name: "imageUrl" }), false);
  // Non-string scalar types aren't links via the heuristic.
  assert.equal(isLinkProp({ type: "number", name: "linkCount" }), false);
});

test("linkNewTabProp: companion boolean name is <href>NewTab", () => {
  assert.equal(linkNewTabProp("ctaHref"), "ctaHrefNewTab");
});

test("validateBlockProps preserves a boolean <link>NewTab flag (not a declared prop)", () => {
  const schema = parsePropsSchema('{"ctaHref":{"type":"link","default":"/x"}}');
  // Flag on → kept; the renderer reads it for target/rel.
  const on = validateBlockProps({ ctaHref: "/go", ctaHrefNewTab: true }, schema);
  assert.equal(on.ctaHrefNewTab, true);
  // Explicit false → kept: it overrides a schema-level `newTab` default.
  const off = validateBlockProps({ ctaHref: "/go", ctaHrefNewTab: false }, schema);
  assert.equal(off.ctaHrefNewTab, false);
  // Absent → dropped (inherit the schema default, else same-tab).
  const none = validateBlockProps({ ctaHref: "/go" }, schema);
  assert.equal("ctaHrefNewTab" in none, false);
});

test("parsePropsSchema/validateBlockProps: image type round-trips as a string URL", () => {
  const schema = parsePropsSchema(
    JSON.stringify({ bg: { type: "image", default: "/media/x.jpg" } }),
  );
  assert.equal(schema[0].type, "image"); // not degraded to "string"
  assert.equal(schema[0].translatable, false); // image is never per-locale
  // Kept like a string value; empty optional dropped.
  assert.equal(validateBlockProps({ bg: "/media/y.png" }, schema).bg, "/media/y.png");
  assert.equal("bg" in validateBlockProps({ bg: "" }, schema), false);
});

test("translatableSlotNames: extracts {{t prop}} names only (not plain {{prop}})", () => {
  const html = `<div><h1>{{t title}}</h1><p>{{ t subtitle }}</p><span>{{label}}</span><img src="{{bg}}"></div>`;
  const names = translatableSlotNames(html);
  assert.equal(names.has("title"), true);
  assert.equal(names.has("subtitle"), true); // inner whitespace tolerated
  assert.equal(names.has("label"), false); // plain slot, not translatable
  assert.equal(names.has("bg"), false);
  assert.deepEqual(translatableSlotNames(null), new Set());
});

test("applyTranslatableFromSlots: marks slotted props translatable in the schema", () => {
  // The AI wrote plain `string` props but used {{t title}} in the html.
  const schema = JSON.stringify({
    title: { type: "string" },
    label: { type: "string" },
  });
  const enriched = applyTranslatableFromSlots(schema, new Set(["title"]));
  const fields = parsePropsSchema(enriched);
  const by = Object.fromEntries(fields.map((f) => [f.name, f]));
  assert.equal(by.title.translatable, true); // slot → flag added
  assert.equal(by.label.translatable, false); // untouched
  // No slot names → unchanged; bad JSON → returned as-is; null → null.
  assert.equal(applyTranslatableFromSlots(schema, new Set()), schema);
  assert.equal(applyTranslatableFromSlots("not json", new Set(["title"])), "not json");
  assert.equal(applyTranslatableFromSlots(null, new Set(["title"])), null);
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

test("validateBlockProps: reserved layout prop `width` survives schema validation", () => {
  const schema = parsePropsSchema(JSON.stringify({ title: { type: "string" } }));
  // width isn't in the schema, but it's a per-block layout setting the renderer
  // reads — it must NOT be stripped when a field edit re-validates the props.
  assert.equal(validateBlockProps({ title: "Hi", width: "auto" }, schema).width, "auto");
  assert.equal(validateBlockProps({ title: "Hi", width: "fill" }, schema).width, "fill");
  // A bogus width value is not preserved (only the two known values pass through).
  assert.equal("width" in validateBlockProps({ width: "weird" }, schema), false);
});

test("validateBlockProps: legacy Set allowlist still works (no coercion)", () => {
  const out = validateBlockProps({ a: "x", b: "", c: 3 }, new Set(["a", "c"]));
  assert.deepEqual(out, { a: "x", c: 3 }); // b undeclared+empty dropped, c untouched
});

// ── json prop type (structured data for client scripts) ─────────────────────

test("parsePropsSchema: json default normalizes to string + parsed defaultValue", () => {
  const fromString = parsePropsSchema(
    JSON.stringify({ opts: { type: "json", default: '[{"id":1}]' } }),
  )[0];
  assert.equal(fromString.type, "json");
  assert.equal(fromString.default, '[{"id":1}]'); // textarea edits the string
  assert.deepEqual(fromString.defaultValue, [{ id: 1 }]); // parsed for the binder

  // Default authored as a real array → stringified for display, kept parsed.
  const fromArray = parsePropsSchema(
    JSON.stringify({ opts: { type: "json", default: [{ id: 2 }] } }),
  )[0];
  assert.deepEqual(fromArray.defaultValue, [{ id: 2 }]);
  assert.equal(fromArray.default, '[{"id":2}]');
});

test("validateBlockProps: json keeps valid JSON, falls back to default on garbage", () => {
  const schema = parsePropsSchema(
    JSON.stringify({ opts: { type: "json", default: "[]" } }),
  );
  // A JSON string is kept verbatim (the renderer's slotString passes it through).
  assert.equal(validateBlockProps({ opts: '["a","b"]' }, schema).opts, '["a","b"]');
  // An already-parsed array is kept (slotString JSON.stringifies it downstream).
  assert.deepEqual(validateBlockProps({ opts: [1, 2] }, schema).opts, [1, 2]);
  // Non-JSON garbage → declared default (so the slot still carries valid JSON).
  assert.equal(validateBlockProps({ opts: "{not json" }, schema).opts, "[]");
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

test("patchBlockProps: merges over existing, empty string clears, others kept", () => {
  // The set_block_props merge: a partial patch must NOT drop the props it omits.
  const merged = patchBlockProps({ title: "old", subtitle: "keep me" }, { title: "new" });
  assert.deepEqual(merged, { title: "new", subtitle: "keep me" });

  // Empty string clears just that key (editor's "blank field → drop prop").
  assert.deepEqual(patchBlockProps({ title: "x", badge: "y" }, { badge: "" }), { title: "x" });

  // No current props → the patch becomes the props.
  assert.deepEqual(patchBlockProps(undefined, { title: "first" }), { title: "first" });

  // PURE: the input object is not mutated.
  const input = { a: 1 };
  patchBlockProps(input, { a: 2, b: 3 });
  assert.deepEqual(input, { a: 1 });
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

test("isLongText — multiline or past one-line length → textarea", () => {
  assert.equal(isLongText("Order Now"), false); // short label → input
  assert.equal(isLongText("line one\nline two"), true); // any newline → textarea
  assert.equal(isLongText("x".repeat(61)), true); // past length cutoff
  assert.equal(isLongText("x".repeat(60)), false); // at cutoff stays input
  assert.equal(isLongText(123), false); // non-string never long
  assert.equal(isLongText(undefined), false);
});
