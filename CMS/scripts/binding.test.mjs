/**
 * content-collections Phase-2 Slice A — tests for the PURE binding module.
 *
 * Single-item (first-match) binding: validate against registry + declared props,
 * shape the first-match query spec, and hydrate fetched row fields into block
 * props. GRACEFUL everywhere — unresolved → blank, never throw.
 *
 * Dep-free `node --test`; imports the REAL .ts modules via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  validateBinding,
  bindingQuerySpec,
  hydrateProps,
  declaredPropNames,
} from "../src/lib/content/binding.ts";

const fields = [
  { name: "title", type: "string", required: true },
  { name: "body", type: "text" },
  { name: "views", type: "int" },
];

const declared = new Set(["heading", "text"]);

const binding = {
  source: {
    collection: "content_posts",
    filter: [{ field: "status", op: "eq", value: "published" }],
    sort: [{ field: "created_at", dir: "desc" }],
  },
  map: { heading: "title", text: "body" },
};

test("validateBinding accepts a sound binding", () => {
  assert.deepEqual(validateBinding(binding, fields, declared), { ok: true });
});

test("validateBinding rejects an unknown collection (null fields)", () => {
  const r = validateBinding(binding, null, declared);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /unknown collection/);
});

test("validateBinding rejects an unknown mapped field", () => {
  const b = { source: { collection: "c" }, map: { heading: "nope" } };
  const r = validateBinding(b, fields, declared);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /unknown field "nope"/.test(e)));
});

test("validateBinding rejects an undeclared target prop", () => {
  const b = { source: { collection: "c" }, map: { ghost: "title" } };
  const r = validateBinding(b, fields, declared);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /prop "ghost" is not declared/.test(e)));
});

test("validateBinding allows system columns as mapped/filter/sort fields", () => {
  const b = {
    source: {
      collection: "c",
      filter: [{ field: "archived_at", op: "is_null" }],
      sort: [{ field: "updated_at", dir: "asc" }],
    },
    map: { heading: "slug" },
  };
  assert.deepEqual(validateBinding(b, fields, declared), { ok: true });
});

test("validateBinding rejects unknown filter / sort fields", () => {
  const b = {
    source: { collection: "c", filter: [{ field: "x", op: "eq", value: 1 }], sort: [{ field: "y" }] },
    map: {},
  };
  const r = validateBinding(b, fields, declared);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /unknown filter field "x"/.test(e)));
  assert.ok(r.errors.some((e) => /unknown sort field "y"/.test(e)));
});

test("validateBinding rejects a malformed binding", () => {
  const r = validateBinding({}, fields, declared);
  assert.equal(r.ok, false);
});

test("bindingQuerySpec shapes a first-match spec (limit 1)", () => {
  const spec = bindingQuerySpec(binding);
  assert.equal(spec.limit, 1);
  assert.deepEqual(spec.filters, [{ field: "status", op: "eq", value: "published" }]);
  assert.deepEqual(spec.sort, [{ field: "created_at", dir: "desc" }]);
});

test("bindingQuerySpec tolerates a binding with no filter/sort", () => {
  const spec = bindingQuerySpec({ source: { collection: "c" }, map: {} });
  assert.deepEqual(spec, { filters: [], sort: [], limit: 1 });
});

test("hydrateProps fills mapped props from the resolved row", () => {
  const out = hydrateProps({ heading: "static" }, { b: binding }, {
    b: { title: "Live Title", body: "Live Body", views: 5 },
  });
  assert.equal(out.heading, "Live Title"); // binding overwrites the static value
  assert.equal(out.text, "Live Body");
});

test("hydrateProps leaves the static value when the binding has no match", () => {
  const out = hydrateProps({ heading: "static" }, { b: binding }, { b: null });
  assert.equal(out.heading, "static"); // graceful: unresolved → keep static
  assert.equal("text" in out, false);
});

test("hydrateProps skips a field absent from the row (graceful blank)", () => {
  const out = hydrateProps({}, { b: binding }, { b: { title: "Only Title" } });
  assert.equal(out.heading, "Only Title");
  assert.equal("text" in out, false); // body absent → prop unbound
});

test("hydrateProps with no bindings returns a copy of props", () => {
  const props = { a: 1 };
  const out = hydrateProps(props, undefined, {});
  assert.deepEqual(out, { a: 1 });
  assert.notEqual(out, props); // new object
});

test("hydrateProps copies a falsy field value (0, '', false)", () => {
  const b = { source: { collection: "c" }, map: { text: "body", heading: "views" } };
  const out = hydrateProps({}, { z: b }, { z: { body: "", views: 0 } });
  assert.equal(out.text, "");
  assert.equal(out.heading, 0);
});

test("declaredPropNames parses propsSchema and tolerates junk", () => {
  assert.deepEqual([...declaredPropNames('{"a":{},"b":{}}')], ["a", "b"]);
  assert.deepEqual([...declaredPropNames(null)], []);
  assert.deepEqual([...declaredPropNames("not json")], []);
  assert.deepEqual([...declaredPropNames("[1,2]")], []);
});
