/**
 * Platform feature — dynamic/param-driven pages. Tests for the PURE
 * route-param/query-param filter-value resolver (`lib/content/route-params.ts`)
 * and the wildcard-slug helpers (`lib/render/slug.ts`).
 *
 * Dep-free `node --test`; imports the REAL .ts modules via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  isRouteValueRef,
  resolveRouteValue,
  resolveRouteFilters,
} from "../src/lib/content/route-params.ts";
import { isParamSlug, paramName, resolveSlugPath } from "../src/lib/render/slug.ts";

// ── isParamSlug / paramName ──────────────────────────────────────────────────

test("isParamSlug: true for a leading-colon segment", () => {
  assert.equal(isParamSlug(":city-slug"), true);
});

test("isParamSlug: false for an ordinary slug", () => {
  assert.equal(isParamSlug("city-slug"), false);
});

test("isParamSlug: false for a bare colon (no name)", () => {
  assert.equal(isParamSlug(":"), false);
});

test("paramName: strips the leading colon", () => {
  assert.equal(paramName(":city-slug"), "city-slug");
});

test("resolveSlugPath: passes wildcard segments through unchanged", () => {
  assert.deepEqual(resolveSlugPath([":city-slug"]), [":city-slug"]);
});

// ── isRouteValueRef ───────────────────────────────────────────────────────────

test("isRouteValueRef: true for a param ref", () => {
  assert.equal(isRouteValueRef({ param: "city-slug" }), true);
});

test("isRouteValueRef: true for a query ref", () => {
  assert.equal(isRouteValueRef({ query: "q" }), true);
});

test("isRouteValueRef: false for a literal string", () => {
  assert.equal(isRouteValueRef("helsinki"), false);
});

test("isRouteValueRef: false for a plain object (not param/query shaped)", () => {
  assert.equal(isRouteValueRef({ foo: "bar" }), false);
});

test("isRouteValueRef: false for null/array/number", () => {
  assert.equal(isRouteValueRef(null), false);
  assert.equal(isRouteValueRef([1, 2]), false);
  assert.equal(isRouteValueRef(42), false);
});

test("isRouteValueRef: false for an empty param/query name", () => {
  assert.equal(isRouteValueRef({ param: "" }), false);
  assert.equal(isRouteValueRef({ query: "" }), false);
});

// ── resolveRouteValue ─────────────────────────────────────────────────────────

const ctx = { params: { "city-slug": "helsinki" }, query: { q: "sushi" } };

test("resolveRouteValue: literal passes through unchanged", () => {
  assert.equal(resolveRouteValue("literal", ctx), "literal");
  assert.equal(resolveRouteValue(42, ctx), 42);
  assert.deepEqual(resolveRouteValue(["a", "b"], ctx), ["a", "b"]);
});

test("resolveRouteValue: resolves a param ref from route params", () => {
  assert.equal(resolveRouteValue({ param: "city-slug" }, ctx), "helsinki");
});

test("resolveRouteValue: resolves a query ref from the URL query", () => {
  assert.equal(resolveRouteValue({ query: "q" }, ctx), "sushi");
});

test("resolveRouteValue: missing param name resolves to undefined (graceful)", () => {
  assert.equal(resolveRouteValue({ param: "missing" }, ctx), undefined);
});

test("resolveRouteValue: missing query name resolves to undefined (graceful)", () => {
  assert.equal(resolveRouteValue({ query: "missing" }, ctx), undefined);
});

// ── resolveRouteFilters ────────────────────────────────────────────────────────

test("resolveRouteFilters: literal-value filters pass through untouched", () => {
  const filters = [{ field: "status", op: "eq", value: "published" }];
  assert.deepEqual(resolveRouteFilters(filters, ctx), filters);
});

test("resolveRouteFilters: resolves a param ref into a literal value", () => {
  const filters = [{ field: "city_slug", op: "eq", value: { param: "city-slug" } }];
  assert.deepEqual(resolveRouteFilters(filters, ctx), [
    { field: "city_slug", op: "eq", value: "helsinki" },
  ]);
});

test("resolveRouteFilters: resolves a query ref into a literal value", () => {
  const filters = [{ field: "name", op: "like", value: { query: "q" } }];
  assert.deepEqual(resolveRouteFilters(filters, ctx), [
    { field: "name", op: "like", value: "sushi" },
  ]);
});

test("resolveRouteFilters: DROPS a clause whose param/query is absent this request", () => {
  const filters = [
    { field: "city_slug", op: "eq", value: { param: "missing" } },
    { field: "status", op: "eq", value: "published" },
  ];
  assert.deepEqual(resolveRouteFilters(filters, ctx), [
    { field: "status", op: "eq", value: "published" },
  ]);
});

test("resolveRouteFilters: is_null/not_null clauses (no value) pass through", () => {
  const filters = [{ field: "archived_at", op: "is_null" }];
  assert.deepEqual(resolveRouteFilters(filters, ctx), filters);
});

test("resolveRouteFilters: undefined/empty input is a no-op", () => {
  assert.deepEqual(resolveRouteFilters(undefined, ctx), []);
  assert.deepEqual(resolveRouteFilters([], ctx), []);
});

test("resolveRouteFilters: mixed literal + param + dropped in one call", () => {
  const filters = [
    { field: "a", op: "eq", value: "lit" },
    { field: "b", op: "eq", value: { param: "city-slug" } },
    { field: "c", op: "eq", value: { query: "missing" } },
  ];
  assert.deepEqual(resolveRouteFilters(filters, ctx), [
    { field: "a", op: "eq", value: "lit" },
    { field: "b", op: "eq", value: "helsinki" },
  ]);
});
