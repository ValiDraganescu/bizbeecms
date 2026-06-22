/**
 * content-collections Slice 4 — tests for the PURE structured-query compiler.
 *
 * The READ trust boundary: filter/sort/paginate/search → safe PARAMETERIZED
 * SELECT. Every built statement is asserted to PASS the Slice-0 read fence, to use
 * `?` placeholders (placeholders === params), and to NEVER inline a user value.
 * Column names are whitelisted against the registry + system columns — an unknown
 * column/op is a 400.
 *
 * Dep-free `node --test`; imports the REAL .ts modules via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { compileQuery, compileCount, FILTER_OPS } from "../src/lib/content/query-compiler.ts";
import { validateStatement } from "../src/lib/content/fence.ts";

const fencedRead = (sql) =>
  assert.equal(validateStatement(sql, "read").ok, true, `must pass read fence: ${sql}`);

const placeholders = (sql) => (sql.match(/\?/g) || []).length;

const fields = [
  { name: "title", type: "string", required: true },
  { name: "body", type: "text" },
  { name: "views", type: "int" },
  { name: "rating", type: "number" },
  { name: "active", type: "bool" },
  { name: "published_on", type: "date" },
  { name: "category", type: "select", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
];

const TABLE = "content_posts";

test("empty spec → SELECT * with default live filter + order + limit, fence-safe", () => {
  const r = compileQuery(TABLE, fields, {});
  assert.equal(r.ok, true);
  fencedRead(r.plan.sql);
  assert.match(r.plan.sql, /^SELECT \* FROM content_posts WHERE archived_at IS NULL ORDER BY created_at DESC LIMIT 1000$/);
  assert.deepEqual(r.plan.params, []);
});

test("filter eq → bound param, coerced to field type, no value inlined", () => {
  const r = compileQuery(TABLE, fields, { filters: [{ field: "views", op: "gte", value: "10" }] });
  assert.equal(r.ok, true);
  fencedRead(r.plan.sql);
  assert.match(r.plan.sql, /views >= \?/);
  assert.equal(placeholders(r.plan.sql), r.plan.params.length);
  assert.deepEqual(r.plan.params, [10]); // int coerced
  // value not inlined: it appears only as a bound param, not in the WHERE clause
  const whereOnly = r.plan.sql.replace(/LIMIT \d+/, "");
  assert.ok(!whereOnly.includes("10"), "value must not be inlined");
});

test("all comparison ops compile + fence-pass", () => {
  for (const op of ["eq", "ne", "lt", "lte", "gt", "gte"]) {
    const r = compileQuery(TABLE, fields, { filters: [{ field: "rating", op, value: "1.5" }] });
    assert.equal(r.ok, true, op);
    fencedRead(r.plan.sql);
    assert.deepEqual(r.plan.params, [1.5]);
  }
});

test("like wraps the BOUND param in %, never the SQL", () => {
  const r = compileQuery(TABLE, fields, { filters: [{ field: "title", op: "like", value: "hello" }] });
  assert.equal(r.ok, true);
  fencedRead(r.plan.sql);
  assert.match(r.plan.sql, /title LIKE \?/);
  assert.deepEqual(r.plan.params, ["%hello%"]);
  assert.ok(!r.plan.sql.includes("hello"));
});

test("in → N placeholders, each value coerced + bound", () => {
  const r = compileQuery(TABLE, fields, { filters: [{ field: "views", op: "in", value: ["1", "2", "3"] }] });
  assert.equal(r.ok, true);
  fencedRead(r.plan.sql);
  assert.match(r.plan.sql, /views IN \(\?, \?, \?\)/);
  assert.deepEqual(r.plan.params, [1, 2, 3]);
});

test("in with empty array → 400", () => {
  const r = compileQuery(TABLE, fields, { filters: [{ field: "views", op: "in", value: [] }] });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test("is_null / not_null take no value, no param", () => {
  const a = compileQuery(TABLE, fields, { filters: [{ field: "published_on", op: "is_null" }] });
  assert.equal(a.ok, true);
  fencedRead(a.plan.sql);
  assert.match(a.plan.sql, /published_on IS NULL/);
  assert.deepEqual(a.plan.params, []);
  const b = compileQuery(TABLE, fields, { filters: [{ field: "published_on", op: "not_null" }] });
  fencedRead(b.plan.sql);
  assert.match(b.plan.sql, /published_on IS NOT NULL/);
});

test("unknown filter field → 400, never reaches SQL", () => {
  const r = compileQuery(TABLE, fields, { filters: [{ field: "evil; DROP TABLE page", op: "eq", value: "x" }] });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.match(r.error, /unknown filter field/);
});

test("unknown op → 400", () => {
  const r = compileQuery(TABLE, fields, { filters: [{ field: "title", op: "regexp", value: "x" }] });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test("bad value for typed field → 400 (reuses coerceFieldValue)", () => {
  const r = compileQuery(TABLE, fields, { filters: [{ field: "views", op: "eq", value: "not-a-number" }] });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test("system columns are filterable + sortable", () => {
  const r = compileQuery(TABLE, fields, {
    filters: [{ field: "status", op: "eq", value: "published" }],
    sort: [{ field: "updated_at", dir: "asc" }, { field: "id", dir: "desc" }],
  });
  assert.equal(r.ok, true);
  fencedRead(r.plan.sql);
  assert.match(r.plan.sql, /ORDER BY updated_at ASC, id DESC/);
});

test("unknown sort field → 400", () => {
  const r = compileQuery(TABLE, fields, { sort: [{ field: "nope", dir: "asc" }] });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test("search → LIKE over text fields only, one bound %needle% per text col", () => {
  const r = compileQuery(TABLE, fields, { search: "foo" });
  assert.equal(r.ok, true);
  fencedRead(r.plan.sql);
  // text-affinity fields: title(string), body(text), category(select)
  assert.match(r.plan.sql, /\(title LIKE \? OR body LIKE \? OR category LIKE \?\)/);
  assert.deepEqual(r.plan.params, ["%foo%", "%foo%", "%foo%"]);
  assert.equal(placeholders(r.plan.sql), r.plan.params.length);
  assert.ok(!r.plan.sql.includes("foo"));
});

test("search with no text fields → matches nothing (0 = 1)", () => {
  const numericOnly = [{ name: "views", type: "int" }];
  const r = compileQuery("content_nums", numericOnly, { search: "x" });
  assert.equal(r.ok, true);
  fencedRead(r.plan.sql);
  assert.match(r.plan.sql, /0 = 1/);
});

test("limit clamps to [1,1000]; offset emitted when > 0", () => {
  assert.match(compileQuery(TABLE, fields, { limit: 5000 }).plan.sql, /LIMIT 1000$/);
  assert.match(compileQuery(TABLE, fields, { limit: 0 }).plan.sql, /LIMIT 1$/);
  assert.match(compileQuery(TABLE, fields, { limit: 20, offset: 40 }).plan.sql, /LIMIT 20 OFFSET 40$/);
  // no offset clause when 0
  assert.ok(!compileQuery(TABLE, fields, { limit: 20 }).plan.sql.includes("OFFSET"));
  // negative offset clamped away
  assert.ok(!compileQuery(TABLE, fields, { offset: -5 }).plan.sql.includes("OFFSET"));
});

test("archived modes + status filter", () => {
  assert.match(compileQuery(TABLE, fields, { archived: "archived" }).plan.sql, /archived_at IS NOT NULL/);
  const all = compileQuery(TABLE, fields, { archived: "all" });
  assert.ok(!all.plan.sql.includes("archived_at IS"));
  const bad = compileQuery(TABLE, fields, { status: "bogus" });
  assert.equal(bad.ok, false);
  assert.equal(bad.status, 400);
});

test("compileCount mirrors filters, no sort/limit, fence-safe", () => {
  const spec = { filters: [{ field: "status", op: "eq", value: "published" }], search: "x", limit: 5, sort: [{ field: "id" }] };
  const r = compileCount(TABLE, fields, spec);
  assert.equal(r.ok, true);
  fencedRead(r.plan.sql);
  assert.match(r.plan.sql, /^SELECT COUNT\(\*\) AS n FROM content_posts WHERE /);
  assert.ok(!r.plan.sql.includes("ORDER BY"));
  assert.ok(!r.plan.sql.includes("LIMIT"));
  // same param set as the WHERE of the query
  assert.equal(placeholders(r.plan.sql), r.plan.params.length);
});

test("combined query: filters + search + sort + paginate, all bound, fence-safe", () => {
  const r = compileQuery(TABLE, fields, {
    filters: [
      { field: "active", op: "eq", value: "true" },
      { field: "views", op: "gte", value: 100 },
      { field: "category", op: "in", value: ["a", "b"] },
    ],
    search: "news",
    sort: [{ field: "published_on", dir: "desc" }],
    status: "published",
    limit: 25,
    offset: 25,
  });
  assert.equal(r.ok, true);
  fencedRead(r.plan.sql);
  assert.equal(placeholders(r.plan.sql), r.plan.params.length);
  // no user value inlined anywhere
  for (const v of ["news", "100", "true"]) {
    assert.ok(!r.plan.sql.replace(/LIMIT 25|OFFSET 25/g, "").includes(v), `inlined: ${v}`);
  }
});

test("FILTER_OPS list is the whitelist (sanity)", () => {
  assert.deepEqual([...FILTER_OPS], ["eq", "ne", "lt", "lte", "gt", "gte", "like", "in", "is_null", "not_null"]);
});
