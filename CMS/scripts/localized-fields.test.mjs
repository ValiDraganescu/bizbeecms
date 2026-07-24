/**
 * translatable-collections — Slice 3 (parse seam) + Slice 4 (render resolution).
 *
 * `parseLocalizedRow` is the ONE place a translatable column's stored value is
 * turned back into a locale object on read. These tests pin:
 *  - only translatable text columns are parsed; everything else copies through;
 *  - a locale-object JSON string → object; a bare string / garbage → untouched;
 *  - malformed JSON never throws.
 *
 * Slice 4 is a render-resolution INTEGRATION check with NO new product code: a
 * parsed row's value, once bound to a prop, resolves to the active content locale
 * via the EXISTING `resolveLocalized` walk.
 *
 * Dep-free `node --test`; imports the REAL .ts modules via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  parseLocalizedValue,
  parseLocalizedRow,
  parseLocalizedRows,
} from "../src/lib/content/localized-fields.ts";
import { resolveLocalized } from "../src/lib/render/localize.ts";
import { hydrateProps } from "../src/lib/content/binding.ts";

const FIELDS = [
  { name: "name", type: "string", translatable: true },
  { name: "description", type: "text", translatable: true },
  { name: "slug", type: "string" }, // NOT translatable
  { name: "views", type: "int" },
];

// ── parseLocalizedValue ──────────────────────────────────────────────────────
test("parseLocalizedValue: a locale-object JSON string → object", () => {
  assert.deepEqual(parseLocalizedValue('{"en":"Cosy","fi":"Viihtyisä"}'), {
    en: "Cosy",
    fi: "Viihtyisä",
  });
});

test("parseLocalizedValue: a bare string is left untouched (default-locale value)", () => {
  assert.equal(parseLocalizedValue("Cosy bistro"), "Cosy bistro");
});

test("parseLocalizedValue: garbage / non-locale JSON is left as the raw string", () => {
  assert.equal(parseLocalizedValue("{not json"), "{not json");
  // Valid JSON object but NOT a locale object (keys aren't locale codes).
  assert.equal(parseLocalizedValue('{"title":"x"}'), '{"title":"x"}');
  // A JSON array (e.g. a multiselect column value) is not a locale object.
  assert.equal(parseLocalizedValue('["a","b"]'), '["a","b"]');
});

test("parseLocalizedValue: null / number / already-object pass through unchanged", () => {
  assert.equal(parseLocalizedValue(null), null);
  assert.equal(parseLocalizedValue(42), 42);
  const obj = { en: "x" };
  assert.equal(parseLocalizedValue(obj), obj);
  assert.equal(parseLocalizedValue(""), "");
});

// ── parseLocalizedRow ────────────────────────────────────────────────────────
test("parseLocalizedRow: parses translatable columns, leaves the rest alone", () => {
  const row = {
    id: "1",
    name: '{"en":"Bistro","fi":"Bistro FI"}',
    description: "Plain default only",
    slug: '{"en":"nope"}', // NOT translatable → must stay a raw string
    views: 5,
  };
  const out = parseLocalizedRow(row, FIELDS);
  assert.deepEqual(out.name, { en: "Bistro", fi: "Bistro FI" });
  assert.equal(out.description, "Plain default only");
  assert.equal(out.slug, '{"en":"nope"}', "non-translatable column untouched");
  assert.equal(out.views, 5);
  // input not mutated
  assert.equal(typeof row.name, "string");
});

test("parseLocalizedRow: no translatable fields → returns the row unchanged", () => {
  const row = { id: "1", slug: "x" };
  const out = parseLocalizedRow(row, [{ name: "slug", type: "string" }]);
  assert.equal(out, row);
});

test("parseLocalizedRow: malformed JSON in a translatable column never throws", () => {
  const out = parseLocalizedRow({ name: '{"en":' }, FIELDS);
  assert.equal(out.name, '{"en":');
});

test("parseLocalizedRows: maps across many rows", () => {
  const rows = [
    { name: '{"en":"A","fi":"AA"}' },
    { name: "B" },
  ];
  const out = parseLocalizedRows(rows, FIELDS);
  assert.deepEqual(out[0].name, { en: "A", fi: "AA" });
  assert.equal(out[1].name, "B");
});

// ── Slice 4: render resolution (no new product code) ─────────────────────────
test("Slice 4: a parsed translatable value, bound to a prop, resolves to the active locale", () => {
  // Simulate the render path: store row → parse (Slice 3) → hydrate onto a bound
  // prop → resolveLocalized (tree.ts render seam) picks the active content locale.
  const storedRow = { name: '{"en":"Cosy bistro","fi":"Viihtyisä bistro"}' };
  const [parsed] = parseLocalizedRows([storedRow], FIELDS);

  const bindings = { hero: { source: { collection: "content_restaurants" }, map: { title: "name" } } };
  const props = hydrateProps({ title: "static fallback" }, bindings, { hero: parsed });

  // FI active → Finnish; EN active → English; unknown → default (first key).
  assert.equal(resolveLocalized(props.title, "fi", "en"), "Viihtyisä bistro");
  assert.equal(resolveLocalized(props.title, "en", "en"), "Cosy bistro");
  assert.equal(resolveLocalized(props.title, "de", "en"), "Cosy bistro", "missing locale → default fallback");
});

test("Slice 4: a bare-string legacy value renders as the default locale (no-op resolve)", () => {
  const [parsed] = parseLocalizedRows([{ name: "Legacy name" }], FIELDS);
  const bindings = { hero: { source: { collection: "c" }, map: { title: "name" } } };
  const props = hydrateProps({}, bindings, { hero: parsed });
  assert.equal(resolveLocalized(props.title, "fi", "en"), "Legacy name");
});

test("Slice 4: a List row's translatable field resolves per active locale", () => {
  // planList stamps listRows onto props the same way; the value is already the
  // parsed object, so resolveLocalized over the stamped prop picks the locale.
  const rows = parseLocalizedRows(
    [{ name: '{"en":"One","fi":"Yksi"}' }, { name: '{"en":"Two","fi":"Kaksi"}' }],
    FIELDS,
  );
  assert.equal(resolveLocalized(rows[0].name, "fi", "en"), "Yksi");
  assert.equal(resolveLocalized(rows[1].name, "en", "en"), "Two");
});
