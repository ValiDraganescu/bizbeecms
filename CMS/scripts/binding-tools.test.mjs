/**
 * content-collections Phase-2 Slice D — tests for the AI BINDING tools' PURE
 * arg validators (binding-tools.ts: validateBindComponent / validateCreateList /
 * validateBindList). The CF-coupled handlers (load page blocks → validate against
 * the registry/propsSchema → mutate → persist) live in tool-dispatch.ts and are
 * build-verified (they import @/db/*); the SHAPING + reject-malformed logic is
 * what's pure and worth a unit test. Dep-free `node --test`; imports the REAL .ts
 * via native type-stripping (explicit .ts extension).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  validateBindComponent,
  validateCreateList,
  validateBindList,
} from "../src/lib/chat/binding-tools.ts";

// ── bind_component ────────────────────────────────────────────────────────────

test("bind_component requires page and block", () => {
  assert.equal(validateBindComponent(null).ok, false);
  assert.equal(validateBindComponent({ block: "b1" }).ok, false);
  assert.equal(validateBindComponent({ page: "p1" }).ok, false);
});

test("bind_component with no collection → clear:true (revert to static)", () => {
  const r = validateBindComponent({ page: "p1", block: "b1" });
  assert.ok(r.ok);
  assert.equal(r.value.clear, true);
  assert.equal(r.value.collection, undefined);
});

test("bind_component shapes a full single-item binding", () => {
  const r = validateBindComponent({
    page: "p1",
    block: "hero1",
    collection: "content_posts",
    filter: [{ field: "status", op: "eq", value: "published" }],
    sort: [{ field: "created_at", dir: "desc" }],
    map: { title: "title", body: "excerpt" },
  });
  assert.ok(r.ok);
  assert.equal(r.value.clear, false);
  assert.equal(r.value.collection, "content_posts");
  assert.deepEqual(r.value.filter, [{ field: "status", op: "eq", value: "published" }]);
  assert.deepEqual(r.value.sort, [{ field: "created_at", dir: "desc" }]);
  assert.deepEqual(r.value.map, { title: "title", body: "excerpt" });
});

test("bind_component rejects an invalid filter op", () => {
  const r = validateBindComponent({
    page: "p1", block: "b1", collection: "content_x",
    filter: [{ field: "a", op: "DROP" }], map: { p: "a" },
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /invalid op/);
});

test("bind_component rejects a map that points at a non-string field", () => {
  const r = validateBindComponent({
    page: "p1", block: "b1", collection: "content_x", map: { title: 42 },
  });
  assert.equal(r.ok, false);
});

test("bind_component rejects an empty map when a collection is given", () => {
  const r = validateBindComponent({ page: "p1", block: "b1", collection: "content_x", map: {} });
  assert.equal(r.ok, false);
});

// ── create_list ───────────────────────────────────────────────────────────────

test("create_list requires page, section, collection, template and map", () => {
  assert.equal(validateCreateList({ page: "p", section: "s", collection: "c", template: "t" }).ok, false);
  assert.equal(validateCreateList({ page: "p", section: "s", collection: "c", map: { x: "y" } }).ok, false);
  assert.equal(validateCreateList({ section: "s", collection: "c", template: "t", map: { x: "y" } }).ok, false);
});

test("create_list shapes a full list config (filter/sort/limit/map)", () => {
  const r = validateCreateList({
    page: "p1",
    section: "sec1",
    collection: "content_posts",
    template: "PostCard",
    filter: [{ field: "status", op: "eq", value: "published" }],
    sort: [{ field: "created_at", dir: "desc" }],
    limit: 10,
    map: { title: "title", href: "slug" },
  });
  assert.ok(r.ok);
  assert.equal(r.value.template, "PostCard");
  assert.equal(r.value.limit, 10);
  assert.deepEqual(r.value.map, { title: "title", href: "slug" });
});

test("create_list defaults filter/sort to empty arrays and parses a string limit", () => {
  const r = validateCreateList({
    page: "p", section: "s", collection: "c", template: "t", limit: "5", map: { a: "b" },
  });
  assert.ok(r.ok);
  assert.deepEqual(r.value.filter, []);
  assert.deepEqual(r.value.sort, []);
  assert.equal(r.value.limit, 5);
});

test("create_list rejects a bad sort entry", () => {
  const r = validateCreateList({
    page: "p", section: "s", collection: "c", template: "t",
    sort: [{ dir: "asc" }], map: { a: "b" },
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /sort 0 is missing a field/);
});

// ── bind_list ─────────────────────────────────────────────────────────────────

test("bind_list requires page and block", () => {
  assert.equal(validateBindList({ block: "b" }).ok, false);
  assert.equal(validateBindList({ page: "p" }).ok, false);
});

test("bind_list is PATCH-like: only the supplied fields appear", () => {
  const r = validateBindList({ page: "p1", block: "list1", template: "NewCard" });
  assert.ok(r.ok);
  assert.equal(r.value.template, "NewCard");
  assert.equal(r.value.collection, undefined);
  assert.equal(r.value.filter, undefined);
  assert.equal(r.value.sort, undefined);
  assert.equal(r.value.map, undefined);
});

test("bind_list shapes filter/sort/map/limit when supplied", () => {
  const r = validateBindList({
    page: "p1",
    block: "list1",
    collection: "content_posts",
    filter: [{ field: "tag", op: "in", value: ["a", "b"] }],
    sort: [{ field: "title" }],
    limit: 3,
    map: { title: "title" },
  });
  assert.ok(r.ok);
  assert.equal(r.value.collection, "content_posts");
  assert.deepEqual(r.value.filter, [{ field: "tag", op: "in", value: ["a", "b"] }]);
  assert.deepEqual(r.value.sort, [{ field: "title", dir: undefined }]);
  assert.equal(r.value.limit, 3);
  assert.deepEqual(r.value.map, { title: "title" });
});

test("bind_list rejects a malformed map when supplied", () => {
  const r = validateBindList({ page: "p", block: "b", map: { title: 1 } });
  assert.equal(r.ok, false);
});

// ── API-source binding args (external-data-sources Slice 6) ──────────────────

test("bind_component: source+request → api args with shaped params", () => {
  const r = validateBindComponent({
    page: "p1", block: "b1",
    source: "Weather", request: "forecast",
    params: { city: { prop: "city" }, units: "metric", days: 3 },
    map: { temp: "main.temp" },
  });
  assert.ok(r.ok);
  assert.equal(r.value.clear, false);
  assert.equal(r.value.source, "Weather");
  assert.equal(r.value.request, "forecast");
  // Literals stringify; { prop } refs pass through.
  assert.deepEqual(r.value.params, { city: { prop: "city" }, units: "metric", days: "3" });
  assert.deepEqual(r.value.map, { temp: "main.temp" });
});

test("bind_component: collection AND source together is rejected", () => {
  const r = validateBindComponent({
    page: "p", block: "b", collection: "content_x", source: "s", request: "r", map: { a: "b" },
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /not both/);
});

test("bind_component: source without request is rejected", () => {
  const r = validateBindComponent({ page: "p", block: "b", source: "s", map: { a: "b" } });
  assert.equal(r.ok, false);
  assert.match(r.error, /request/);
});

test("bind_component: a malformed param spec names the exact param", () => {
  const r = validateBindComponent({
    page: "p", block: "b", source: "s", request: "r",
    params: { city: { nope: 1 } }, map: { a: "b" },
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /"city"/);
});

test("create_list: api rows via source+request (+itemsPath), no collection needed", () => {
  const r = validateCreateList({
    page: "p", section: "s", template: "Card",
    source: "Weather", request: "forecast", itemsPath: "list",
    params: { city: "Turku" }, limit: 5,
    map: { title: "weather.0.main" },
  });
  assert.ok(r.ok);
  assert.equal(r.value.source, "Weather");
  assert.equal(r.value.request, "forecast");
  assert.equal(r.value.itemsPath, "list");
  assert.deepEqual(r.value.params, { city: "Turku" });
  assert.equal(r.value.limit, 5);
  assert.equal(r.value.collection, undefined);
});

test("create_list: neither collection nor source is rejected with both options named", () => {
  const r = validateCreateList({ page: "p", section: "s", template: "Card", map: { a: "b" } });
  assert.equal(r.ok, false);
  assert.match(r.error, /collection/);
  assert.match(r.error, /source/);
});

test("create_list: collection AND source together is rejected", () => {
  const r = validateCreateList({
    page: "p", section: "s", template: "t", collection: "content_x",
    source: "s1", request: "r1", map: { a: "b" },
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /not both/);
});

test("bind_list: api patch fields shape through (source/request/params/itemsPath)", () => {
  const r = validateBindList({
    page: "p", block: "l",
    source: "Weather", request: "forecast",
    params: { city: { prop: "city" } }, itemsPath: "list",
  });
  assert.ok(r.ok);
  assert.equal(r.value.source, "Weather");
  assert.equal(r.value.request, "forecast");
  assert.deepEqual(r.value.params, { city: { prop: "city" } });
  assert.equal(r.value.itemsPath, "list");
});

test("bind_list: source without request is rejected; collection+source rejected", () => {
  assert.equal(validateBindList({ page: "p", block: "l", source: "s" }).ok, false);
  const both = validateBindList({ page: "p", block: "l", collection: "content_x", source: "s", request: "r" });
  assert.equal(both.ok, false);
  assert.match(both.error, /not both/);
});
