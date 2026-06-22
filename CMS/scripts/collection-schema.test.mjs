/**
 * content-collections Slice 1 — tests for the field-schema → DDL generator.
 *
 * The generator is PURE: it turns a typed field schema into the real
 * `CREATE TABLE content_<slug>(...)` DDL. The load-bearing assertions:
 *  - generated DDL PASSES the Slice-0 fence (validateStatement(..., "write"));
 *  - it targets a content_* table (content_ prefix);
 *  - affinity mapping is correct per field type;
 *  - system columns are always present + reserved (name collisions rejected);
 *  - column count is capped at D1's 100-column limit;
 *  - bad names/types are rejected (no SQL injection via a column name).
 *
 * Dep-free `node --test`; imports the REAL .ts modules via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { validateStatement, isContentName } from "../src/lib/content/fence.ts";
import {
  affinityFor,
  buildItemColumns,
  buildCreateTableSql,
  buildAddColumnSql,
  tableNameForSlug,
  SYSTEM_COLUMNS,
  MAX_COLUMNS,
  COLLECTION_FIELD_TYPES,
} from "../src/lib/content/collection-schema.ts";

const fences = (sql) => assert.equal(validateStatement(sql, "write").ok, true, `fence should ACCEPT: ${sql}`);

test("affinityFor maps every field type to a SQLite affinity", () => {
  assert.equal(affinityFor("string"), "TEXT");
  assert.equal(affinityFor("text"), "TEXT");
  assert.equal(affinityFor("richtext"), "TEXT");
  assert.equal(affinityFor("select"), "TEXT");
  assert.equal(affinityFor("multiselect"), "TEXT");
  assert.equal(affinityFor("date"), "TEXT");
  assert.equal(affinityFor("datetime"), "TEXT");
  assert.equal(affinityFor("time"), "TEXT");
  assert.equal(affinityFor("ref"), "TEXT");
  assert.equal(affinityFor("asset"), "TEXT");
  assert.equal(affinityFor("number"), "REAL");
  assert.equal(affinityFor("int"), "INTEGER");
  assert.equal(affinityFor("bool"), "INTEGER");
  assert.equal(affinityFor("boolean"), "INTEGER");
});

test("buildItemColumns always prepends the 6 system columns, in order", () => {
  const cols = buildItemColumns([{ name: "title", type: "string" }]);
  assert.deepEqual(cols.slice(0, 6).map((c) => c.name), [...SYSTEM_COLUMNS]);
  assert.equal(cols[6].name, "title");
  assert.ok(cols[0].sql.includes("PRIMARY KEY"));
});

test("buildCreateTableSql emits content_* DDL that PASSES the fence", () => {
  const sql = buildCreateTableSql("content_posts", [
    { name: "title", type: "string", required: true },
    { name: "body", type: "richtext" },
    { name: "views", type: "int", default: 0 },
    { name: "rating", type: "number" },
    { name: "featured", type: "bool", default: false },
    { name: "published_on", type: "date" },
    { name: "category", type: "select", default: "news" },
  ]);
  assert.ok(sql.startsWith("CREATE TABLE content_posts ("));
  assert.ok(isContentName("content_posts"));
  // affinities present
  assert.match(sql, /title TEXT NOT NULL/);
  assert.match(sql, /views INTEGER DEFAULT 0/);
  assert.match(sql, /rating REAL/);
  assert.match(sql, /featured INTEGER DEFAULT 0/);
  assert.match(sql, /category TEXT DEFAULT 'news'/);
  // THE load-bearing check: the generated DDL clears the Slice-0 fence.
  fences(sql);
});

test("buildCreateTableSql with no user fields = system columns only, still fenced", () => {
  const sql = buildCreateTableSql("content_empty", []);
  fences(sql);
  const cols = buildItemColumns([]);
  assert.equal(cols.length, SYSTEM_COLUMNS.length);
});

test("text DEFAULT literals escape single quotes (no injection)", () => {
  const sql = buildCreateTableSql("content_x", [
    { name: "note", type: "string", default: "O'Brien" },
  ]);
  assert.match(sql, /note TEXT DEFAULT 'O''Brien'/);
  fences(sql);
});

test("a quote-injection attempt in a DEFAULT cannot break the fence", () => {
  const sql = buildCreateTableSql("content_x", [
    { name: "note", type: "string", default: "'); DROP TABLE page;--" },
  ]);
  // The payload is a quoted, escaped literal — the fence strips literals, sees
  // one statement on content_x, and accepts; `page` never appears as an identifier.
  fences(sql);
  assert.ok(!/DROP TABLE page/.test(sql.replace(/'[^']*'/g, "")));
});

test("buildCreateTableSql rejects a non-content_* table name", () => {
  assert.throws(() => buildCreateTableSql("page", []), /content_/);
  assert.throws(() => buildCreateTableSql("posts", []), /content_/);
});

test("field name collision with a system column is rejected", () => {
  for (const sys of SYSTEM_COLUMNS) {
    assert.throws(() => buildItemColumns([{ name: sys, type: "string" }]), /system column/);
  }
});

test("bad field names + duplicates + unknown types are rejected", () => {
  assert.throws(() => buildItemColumns([{ name: "Title", type: "string" }]), /invalid field name/); // uppercase
  assert.throws(() => buildItemColumns([{ name: "a b", type: "string" }]), /invalid field name/); // space
  assert.throws(() => buildItemColumns([{ name: "drop;", type: "string" }]), /invalid field name/);
  assert.throws(
    () => buildItemColumns([{ name: "a", type: "string" }, { name: "a", type: "int" }]),
    /duplicate/,
  );
  assert.throws(() => buildItemColumns([{ name: "a", type: "bogus" }]), /unknown field type/);
});

test("column count is capped at D1's 100-column limit", () => {
  const fields = [];
  // 94 user fields + 6 system = 100, the max.
  for (let i = 0; i < MAX_COLUMNS - SYSTEM_COLUMNS.length; i++) {
    fields.push({ name: `f${i}`, type: "string" });
  }
  const cols = buildItemColumns(fields);
  assert.equal(cols.length, MAX_COLUMNS);
  // one more tips over the limit.
  fields.push({ name: "overflow", type: "string" });
  assert.throws(() => buildItemColumns(fields), /too many columns/);
});

test("buildAddColumnSql emits fenced ALTER ... ADD COLUMN", () => {
  const sql = buildAddColumnSql("content_posts", { name: "subtitle", type: "string" });
  assert.match(sql, /^ALTER TABLE content_posts ADD COLUMN subtitle TEXT/);
  fences(sql);
  // required + default → NOT NULL DEFAULT; required without default → nullable.
  const withDef = buildAddColumnSql("content_posts", { name: "n", type: "int", required: true, default: 0 });
  assert.match(withDef, /n INTEGER NOT NULL DEFAULT 0/);
  fences(withDef);
  const noDef = buildAddColumnSql("content_posts", { name: "m", type: "int", required: true });
  assert.ok(!/NOT NULL/.test(noDef), "required-without-default must be nullable for SQLite ADD COLUMN");
  fences(noDef);
});

test("tableNameForSlug produces a valid content_* name", () => {
  assert.equal(tableNameForSlug("Blog Posts"), "content_blog_posts");
  assert.equal(tableNameForSlug("blog-posts!!"), "content_blog_posts");
  assert.equal(tableNameForSlug("FAQ"), "content_faq");
  assert.ok(isContentName(tableNameForSlug("My Things 2024")));
});

test("the field-type vocab is the propsSchema set plus data-collection extensions", () => {
  // page-builder propsSchema vocab is a subset
  for (const t of ["string", "richtext", "number", "select", "date"]) {
    assert.ok(COLLECTION_FIELD_TYPES.has(t), `${t} should be a collection field type`);
  }
  // extensions
  for (const t of ["text", "int", "bool", "datetime", "multiselect", "ref", "asset"]) {
    assert.ok(COLLECTION_FIELD_TYPES.has(t), `${t} extension should be present`);
  }
});
