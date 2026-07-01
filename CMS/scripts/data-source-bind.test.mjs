/**
 * Dep-free unit tests for external-data-sources Slice-3 pure binding glue
 * (src/lib/data-sources/bind.ts) + the api-kind branches of the shared
 * binding validators (src/lib/content/binding.ts).
 * Run: node --test scripts/data-source-bind.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveBindingParams,
  flattenByPaths,
  apiListElements,
  listPaths,
} from "../src/lib/data-sources/bind.ts";
import {
  validateBinding,
  validateListBinding,
  hydrateProps,
} from "../src/lib/content/binding.ts";

/* ------------------------------------------------- resolveBindingParams */

test("resolveBindingParams: literal strings pass through", () => {
  const out = resolveBindingParams({ units: "metric" }, {}, "en", "en");
  assert.deepEqual(out, { units: "metric" });
});

test("resolveBindingParams: { prop } reads the block's prop", () => {
  const out = resolveBindingParams(
    { q: { prop: "city" } },
    { city: "Tallinn" },
    "en",
    "en",
  );
  assert.deepEqual(out, { q: "Tallinn" });
});

test("resolveBindingParams: localized prop resolves via active locale + fallback", () => {
  const props = { city: { en: "Tallinn", fi: "Tallinna" } };
  assert.deepEqual(
    resolveBindingParams({ q: { prop: "city" } }, props, "fi", "en"),
    { q: "Tallinna" },
  );
  assert.deepEqual(
    resolveBindingParams({ q: { prop: "city" } }, props, "et", "en"),
    { q: "Tallinn" }, // et missing → fallback en
  );
});

test("resolveBindingParams: missing prop is OMITTED (fetch reports it, graceful)", () => {
  const out = resolveBindingParams({ q: { prop: "nope" } }, { city: "x" }, "en", "en");
  assert.deepEqual(out, {});
});

test("resolveBindingParams: non-primitive prop value is omitted", () => {
  const out = resolveBindingParams(
    { q: { prop: "obj" } },
    { obj: { nested: true } },
    "en",
    "en",
  );
  assert.deepEqual(out, {});
});

test("resolveBindingParams: numbers and booleans pass through", () => {
  const out = resolveBindingParams(
    { lat: { prop: "lat" }, dry: { prop: "dry" } },
    { lat: 59.437, dry: false },
    "en",
    "en",
  );
  assert.deepEqual(out, { lat: 59.437, dry: false });
});

/* ------------------------------------------------------ flattenByPaths */

test("flattenByPaths: resolves dot-paths (incl. array indices) into a flat row", () => {
  const json = { main: { temp: 21.4 }, weather: [{ description: "clear" }] };
  const row = flattenByPaths(json, ["main.temp", "weather.0.description"]);
  assert.deepEqual(row, { "main.temp": 21.4, "weather.0.description": "clear" });
});

test("flattenByPaths: missing path is left off the row (static default survives)", () => {
  const row = flattenByPaths({ a: 1 }, ["a", "b.c"]);
  assert.deepEqual(row, { a: 1 });
});

test("flattenByPaths: duplicate paths deduped", () => {
  const row = flattenByPaths({ a: 1 }, ["a", "a"]);
  assert.deepEqual(row, { a: 1 });
});

/* ----------------------------------------------------- apiListElements */

test("apiListElements: bare array is used as-is", () => {
  assert.deepEqual(apiListElements([1, 2]), [1, 2]);
});

test("apiListElements: itemsPath digs to a nested array", () => {
  const data = { list: [{ t: 1 }, { t: 2 }], cnt: 2 };
  assert.deepEqual(apiListElements(data, "list"), [{ t: 1 }, { t: 2 }]);
});

test("apiListElements: lone object becomes a one-element list", () => {
  assert.deepEqual(apiListElements({ t: 1 }), [{ t: 1 }]);
});

test("apiListElements: missing itemsPath / scalar → empty (graceful)", () => {
  assert.deepEqual(apiListElements({ a: 1 }, "nope"), []);
  assert.deepEqual(apiListElements("scalar"), []);
  assert.deepEqual(apiListElements(null), []);
});

/* ----------------------------------------------------------- listPaths */

test("listPaths: union of listMap paths + valueField/labelField + id, deduped", () => {
  const paths = listPaths(
    { title: "name", temp: "main.temp" },
    { valueField: "name", labelField: "label" },
  );
  assert.deepEqual([...paths].sort(), ["id", "label", "main.temp", "name"].sort());
});

test("listPaths: no map / no combobox fields → just id", () => {
  assert.deepEqual(listPaths(undefined, undefined), ["id"]);
});

/* ------------------------------------- validators, api-kind branches */

const apiSource = { kind: "api", sourceId: "s1", requestId: "r1" };

test("validateBinding api: ok when ids present and mapped props declared", () => {
  const res = validateBinding(
    { source: apiSource, map: { temp: "main.temp" } },
    null, // no collection fields for an api source
    new Set(["temp"]),
  );
  assert.deepEqual(res, { ok: true });
});

test("validateBinding api: missing sourceId/requestId rejected", () => {
  const res = validateBinding(
    { source: { kind: "api" }, map: {} },
    null,
    new Set(),
  );
  assert.equal(res.ok, false);
  assert.match(res.errors.join(" "), /sourceId and a requestId/);
});

test("validateBinding api: undeclared mapped prop rejected", () => {
  const res = validateBinding(
    { source: apiSource, map: { nope: "main.temp" } },
    null,
    new Set(["temp"]),
  );
  assert.equal(res.ok, false);
  assert.match(res.errors.join(" "), /"nope" is not declared/);
});

test("validateListBinding api: ok / missing ids / undeclared template prop", () => {
  assert.deepEqual(
    validateListBinding(apiSource, { t: "main.temp" }, null, new Set(["t"])),
    { ok: true },
  );
  const noIds = validateListBinding({ kind: "api" }, {}, null, new Set());
  assert.equal(noIds.ok, false);
  const badProp = validateListBinding(apiSource, { x: "a" }, null, new Set(["t"]));
  assert.equal(badProp.ok, false);
  assert.match(badProp.errors.join(" "), /"x" is not declared/);
});

test("validateBinding collection path unchanged (no kind = collection)", () => {
  const res = validateBinding(
    { source: { collection: "content_x" }, map: { t: "nope" } },
    [{ name: "title", type: "text" }],
    new Set(["t"]),
  );
  assert.equal(res.ok, false);
  assert.match(res.errors.join(" "), /unknown field "nope"/);
});

/* ------------------------------- end-to-end pure: flatten → hydrate */

test("api response flattened by map paths hydrates props via hydrateProps", () => {
  const binding = {
    source: apiSource,
    map: { temp: "main.temp", sky: "weather.0.description" },
  };
  const response = { main: { temp: 21.4 }, weather: [{ description: "clear" }] };
  const row = flattenByPaths(response, Object.values(binding.map));
  const props = hydrateProps({ sky: "static fallback" }, { w: binding }, { w: row });
  assert.deepEqual(props, { temp: 21.4, sky: "clear" });
});

test("failed api fetch (null row) leaves static props untouched", () => {
  const binding = { source: apiSource, map: { temp: "main.temp" } };
  const props = hydrateProps({ temp: "—" }, { w: binding }, { w: null });
  assert.deepEqual(props, { temp: "—" });
});
