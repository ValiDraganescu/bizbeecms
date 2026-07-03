/**
 * Dep-free unit tests for the PURE collection-tool arg validators
 * (content-collections Slice 6). Run:
 *   node --test scripts/collection-tools.test.mjs
 *
 * These cover the model-args → store-shape boundary (the only logic in
 * collection-tools.ts; the store calls are CF-coupled and HITL). Project
 * convention: import the .ts directly via Node type-stripping (no @/ alias).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateCreateCollection,
  validateAddItem,
  validateUpdateItem,
  validateArchiveItem,
  validateQuery,
  validateDropField,
  validateRenameField,
} from "../src/lib/chat/collection-tools.ts";

// ── create_collection ─────────────────────────────────────────────────────────
test("create_collection: clean name + fields pass, options/required carried", () => {
  const r = validateCreateCollection({
    name: "  Blog posts  ",
    fields: [
      { name: "title", type: "string", required: true },
      { name: "tags", type: "multiselect", options: ["a", "b", 7] },
      { name: "junk", type: "text", extra: "dropped" },
    ],
  });
  assert.ok(r.ok);
  assert.equal(r.value.name, "Blog posts");
  assert.deepEqual(r.value.fields[0], { name: "title", type: "string", required: true });
  // non-string options filtered out
  assert.deepEqual(r.value.fields[1].options, ["a", "b"]);
  // unknown props dropped; no required key when absent
  assert.deepEqual(r.value.fields[2], { name: "junk", type: "text" });
});

test("create_collection: rejects missing name / non-array / empty fields / fieldless type", () => {
  assert.equal(validateCreateCollection({ fields: [{ name: "x", type: "string" }] }).ok, false);
  assert.equal(validateCreateCollection({ name: "x", fields: {} }).ok, false);
  assert.equal(validateCreateCollection({ name: "x", fields: [] }).ok, false);
  assert.equal(validateCreateCollection({ name: "x", fields: [{ name: "f" }] }).ok, false);
  assert.equal(validateCreateCollection({ name: "x", fields: [{ type: "string" }] }).ok, false);
  assert.equal(validateCreateCollection(null).ok, false);
});

// ── add_collection_item ───────────────────────────────────────────────────────
test("add_collection_item: collection + values object passes", () => {
  const r = validateAddItem({ collection: "content_blog", values: { title: "Hi" } });
  assert.ok(r.ok);
  assert.equal(r.value.collection, "content_blog");
  assert.deepEqual(r.value.values, { title: "Hi" });
});

test("add_collection_item: rejects missing collection / non-object values", () => {
  assert.equal(validateAddItem({ values: { a: 1 } }).ok, false);
  assert.equal(validateAddItem({ collection: "content_blog", values: "no" }).ok, false);
  assert.equal(validateAddItem({ collection: "content_blog" }).ok, false);
});

// ── update_collection_item ────────────────────────────────────────────────────
test("update_collection_item: needs collection + id + non-empty values", () => {
  assert.ok(validateUpdateItem({ collection: "content_blog", id: "i1", values: { title: "X" } }).ok);
  assert.equal(validateUpdateItem({ collection: "content_blog", id: "i1", values: {} }).ok, false);
  assert.equal(validateUpdateItem({ collection: "content_blog", values: { a: 1 } }).ok, false);
  assert.equal(validateUpdateItem({ id: "i1", values: { a: 1 } }).ok, false);
});

// ── archive_collection_item ───────────────────────────────────────────────────
test("archive_collection_item: op defaults to archive, accepts the three ops", () => {
  assert.equal(validateArchiveItem({ collection: "content_blog", id: "i1" }).value.op, "archive");
  assert.equal(validateArchiveItem({ collection: "content_blog", id: "i1", op: "unarchive" }).value.op, "unarchive");
  assert.equal(validateArchiveItem({ collection: "content_blog", id: "i1", op: "delete" }).value.op, "delete");
});

test("archive_collection_item: rejects unknown op / missing id", () => {
  assert.equal(validateArchiveItem({ collection: "content_blog", id: "i1", op: "nuke" }).ok, false);
  assert.equal(validateArchiveItem({ collection: "content_blog", op: "archive" }).ok, false);
});

// ── query_collection ──────────────────────────────────────────────────────────
test("query_collection: shapes filters/sort/search/paging into a QuerySpec", () => {
  const r = validateQuery({
    collection: "content_blog",
    filters: [{ field: "status", op: "eq", value: "published" }],
    sort: [{ field: "created_at", dir: "desc" }, { field: "title" }],
    search: "hello",
    status: "published",
    archived: "all",
    limit: "25",
    offset: 10,
  });
  assert.ok(r.ok);
  assert.equal(r.value.collection, "content_blog");
  assert.deepEqual(r.value.spec.filters, [{ field: "status", op: "eq", value: "published" }]);
  assert.deepEqual(r.value.spec.sort, [
    { field: "created_at", dir: "desc" },
    { field: "title", dir: undefined },
  ]);
  assert.equal(r.value.spec.search, "hello");
  assert.equal(r.value.spec.status, "published");
  assert.equal(r.value.spec.archived, "all");
  assert.equal(r.value.spec.limit, 25); // numeric string coerced
  assert.equal(r.value.spec.offset, 10);
});

test("query_collection: minimal (collection only) is valid + small default page", () => {
  const r = validateQuery({ collection: "content_blog" });
  assert.ok(r.ok);
  // No explicit limit → the AI-tool default of 20 (NOT the compiler's 1000 —
  // that dumped whole collections into model context).
  assert.deepEqual(r.value.spec, { limit: 20 });
});

test("query_collection: rejects missing collection, bad op, non-array filters", () => {
  assert.equal(validateQuery({}).ok, false);
  assert.equal(validateQuery({ collection: "content_blog", filters: "no" }).ok, false);
  assert.equal(validateQuery({ collection: "content_blog", filters: [{ field: "x", op: "BOGUS" }] }).ok, false);
  assert.equal(validateQuery({ collection: "content_blog", filters: [{ op: "eq", value: 1 }] }).ok, false);
});

test("query_collection: invalid archived value is dropped (not an error)", () => {
  const r = validateQuery({ collection: "content_blog", archived: "weird" });
  assert.ok(r.ok);
  assert.equal(r.value.spec.archived, undefined);
});

// ── drop_collection_field ─────────────────────────────────────────────────────
test("drop_collection_field: collection + field (trimmed) passes", () => {
  const r = validateDropField({ collection: "content_blog", field: "  tags  " });
  assert.ok(r.ok);
  assert.deepEqual(r.value, { collection: "content_blog", field: "tags" });
});

test("drop_collection_field: rejects missing collection / field", () => {
  assert.equal(validateDropField({ field: "tags" }).ok, false);
  assert.equal(validateDropField({ collection: "content_blog" }).ok, false);
  assert.equal(validateDropField({ collection: "content_blog", field: "  " }).ok, false);
  assert.equal(validateDropField(null).ok, false);
});

// ── rename_collection_field ───────────────────────────────────────────────────
test("rename_collection_field: collection + field + to passes", () => {
  const r = validateRenameField({ collection: "content_blog", field: "tags", to: "labels" });
  assert.ok(r.ok);
  assert.deepEqual(r.value, { collection: "content_blog", field: "tags", to: "labels" });
});

test("rename_collection_field: rejects missing collection / field / to", () => {
  assert.equal(validateRenameField({ field: "tags", to: "labels" }).ok, false);
  assert.equal(validateRenameField({ collection: "content_blog", to: "labels" }).ok, false);
  assert.equal(validateRenameField({ collection: "content_blog", field: "tags" }).ok, false);
  assert.equal(validateRenameField(null).ok, false);
});
