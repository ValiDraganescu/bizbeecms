/**
 * content-collections Slice 3 — tests for the PURE item validators + SQL builders.
 *
 * These own the WRITE trust boundary: per-field validate/coerce by registry type,
 * and the parameterized INSERT/UPDATE/archive/delete/get/list SQL. Every built
 * statement is asserted to PASS the Slice-0 fence (write/read mode) — that's the
 * whole feature's safety guarantee — and to use `?` placeholders, never inlined
 * user values.
 *
 * Dep-free `node --test`; imports the REAL .ts modules via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  coerceFieldValue,
  coerceStatus,
  buildInsert,
  buildUpdate,
  buildArchive,
  buildUnarchive,
  buildDelete,
  buildGet,
  buildList,
} from "../src/lib/content/item-write.ts";
import { validateStatement } from "../src/lib/content/fence.ts";

const fencedWrite = (sql) =>
  assert.equal(validateStatement(sql, "write").ok, true, `must pass write fence: ${sql}`);
const fencedRead = (sql) =>
  assert.equal(validateStatement(sql, "read").ok, true, `must pass read fence: ${sql}`);

const fields = [
  { name: "title", type: "string", required: true },
  { name: "views", type: "int" },
  { name: "rating", type: "number" },
  { name: "active", type: "bool" },
  { name: "published_on", type: "date" },
  { name: "category", type: "select", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
  { name: "tags", type: "multiselect", options: [{ value: "x", label: "X" }, { value: "y", label: "Y" }] },
];

// ---- coercion ---------------------------------------------------------------

test("coerceFieldValue: bool → 0/1, rejects junk", () => {
  assert.equal(coerceFieldValue({ name: "b", type: "bool" }, true).value, 1);
  assert.equal(coerceFieldValue({ name: "b", type: "bool" }, "false").value, 0);
  assert.equal(coerceFieldValue({ name: "b", type: "bool" }, "1").value, 1);
  assert.equal(coerceFieldValue({ name: "b", type: "bool" }, "nope").ok, false);
});

test("coerceFieldValue: int truncs, number keeps, both reject non-finite", () => {
  assert.equal(coerceFieldValue({ name: "i", type: "int" }, "3.9").value, 3);
  assert.equal(coerceFieldValue({ name: "n", type: "number" }, "2.5").value, 2.5);
  assert.equal(coerceFieldValue({ name: "i", type: "int" }, "abc").ok, false);
  assert.equal(coerceFieldValue({ name: "n", type: "number" }, "x").ok, false);
});

test("coerceFieldValue: date accepts ISO + epoch-ms → ISO TEXT, rejects bad", () => {
  const iso = coerceFieldValue({ name: "d", type: "date" }, "2026-06-22");
  assert.equal(iso.ok, true);
  assert.match(iso.value, /^2026-06-22T/);
  const ms = coerceFieldValue({ name: "d", type: "datetime" }, 0);
  assert.equal(ms.value, "1970-01-01T00:00:00.000Z");
  assert.equal(coerceFieldValue({ name: "d", type: "date" }, "not-a-date").ok, false);
});

test("coerceFieldValue: select must match options; multiselect → JSON array", () => {
  assert.equal(coerceFieldValue(fields[5], "a").value, "a");
  assert.equal(coerceFieldValue(fields[5], "z").ok, false);
  assert.equal(coerceFieldValue(fields[6], ["x", "y"]).value, JSON.stringify(["x", "y"]));
  assert.equal(coerceFieldValue(fields[6], ["x", "z"]).ok, false);
});

test("coerceFieldValue: required rejects empty; optional → null", () => {
  assert.equal(coerceFieldValue({ name: "t", type: "string", required: true }, "").ok, false);
  assert.equal(coerceFieldValue({ name: "t", type: "string", required: true }, null).ok, false);
  assert.equal(coerceFieldValue({ name: "t", type: "string" }, undefined).value, null);
});

test("coerceStatus: defaults draft, validates enum", () => {
  assert.equal(coerceStatus(undefined).value, "draft");
  assert.equal(coerceStatus("published").value, "published");
  assert.equal(coerceStatus("garbage").ok, false);
});

// ---- builders (fence-safe + parameterized) ----------------------------------

const ID = () => "fixed-id-1234";
const NOW = 1_750_000_000_000;

test("buildInsert: system cols + user cols, fence-safe, params parallel to ?s", () => {
  const r = buildInsert(
    "content_posts",
    fields,
    { title: "Hello", views: 5, active: true, slug: "hello", status: "published", category: "a", tags: ["x"], published_on: "2026-06-22", rating: 4.5 },
    NOW,
    ID,
  );
  assert.equal(r.ok, true);
  assert.equal(r.value.id, "fixed-id-1234");
  fencedWrite(r.value.sql);
  assert.match(r.value.sql, /^INSERT INTO content_posts \(/);
  // placeholder count === param count, and no inlined string literal
  const qs = (r.value.sql.match(/\?/g) || []).length;
  assert.equal(qs, r.value.params.length);
  assert.ok(!r.value.sql.includes("Hello"), "user value must NOT be inlined in SQL");
  // bool coerced to 1, date to ISO, status carried
  assert.ok(r.value.params.includes(1));
  assert.ok(r.value.params.includes("published"));
});

test("buildInsert: missing required field → 400", () => {
  const r = buildInsert("content_posts", fields, { views: 1 }, NOW, ID);
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.match(r.error, /title/);
});

test("buildUpdate: only supplied keys, sets updated_at, fence-safe", () => {
  const r = buildUpdate("content_posts", fields, "abc", { title: "New", status: "draft" }, NOW);
  assert.equal(r.ok, true);
  fencedWrite(r.value.sql);
  assert.match(r.value.sql, /UPDATE content_posts SET .* WHERE id = \?$/);
  assert.match(r.value.sql, /updated_at = \?/);
  const qs = (r.value.sql.match(/\?/g) || []).length;
  assert.equal(qs, r.value.params.length);
  assert.equal(r.value.params[r.value.params.length - 1], "abc"); // id last
});

test("buildUpdate: empty body → 400; bad value → 400", () => {
  assert.equal(buildUpdate("content_posts", fields, "abc", {}, NOW).status, 400);
  assert.equal(buildUpdate("content_posts", fields, "abc", { views: "nope" }, NOW).status, 400);
});

test("buildArchive/Unarchive/Delete/Get are fence-safe + parameterized", () => {
  const a = buildArchive("content_posts", "abc", NOW);
  fencedWrite(a.sql);
  assert.match(a.sql, /archived_at = \?/);
  const u = buildUnarchive("content_posts", "abc", NOW);
  fencedWrite(u.sql);
  assert.match(u.sql, /archived_at = NULL/);
  const d = buildDelete("content_posts", "abc");
  fencedWrite(d.sql);
  assert.deepEqual(d.params, ["abc"]);
  const g = buildGet("content_posts", "abc");
  fencedRead(g.sql);
  assert.deepEqual(g.params, ["abc"]);
});

test("buildList: defaults live+limit, status filter bound, archived modes, fence-safe", () => {
  const live = buildList("content_posts");
  fencedRead(live.sql);
  assert.match(live.sql, /archived_at IS NULL/);
  assert.match(live.sql, /ORDER BY created_at DESC LIMIT 1000/);

  const filtered = buildList("content_posts", { status: "published", limit: 10 });
  fencedRead(filtered.sql);
  assert.match(filtered.sql, /status = \?/);
  assert.deepEqual(filtered.params, ["published"]);
  assert.match(filtered.sql, /LIMIT 10/);

  // invalid status is dropped (not bound), never inlined
  const bad = buildList("content_posts", { status: "DROP TABLE page" });
  fencedRead(bad.sql);
  assert.deepEqual(bad.params, []);
  assert.ok(!bad.sql.includes("DROP"));

  fencedRead(buildList("content_posts", { archived: "archived" }).sql);
  fencedRead(buildList("content_posts", { archived: "all" }).sql);
});
