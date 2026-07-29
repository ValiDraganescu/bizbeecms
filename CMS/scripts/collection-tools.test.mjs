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
  validateAddField,
  CREATE_COLLECTION_TOOL,
  ADD_COLLECTION_FIELD_TOOL,
} from "../src/lib/chat/collection-tools.ts";
import { normalizeField } from "../src/lib/content/collection-plan.ts";

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

// ── translatable flag (translatable-collections Slice 6) ─────────────────────
test("create_collection: translatable:true is carried on a field", () => {
  const r = validateCreateCollection({
    name: "Restaurants",
    fields: [
      { name: "title", type: "string", translatable: true },
      { name: "code", type: "string" }, // no flag
    ],
  });
  assert.ok(r.ok);
  assert.equal(r.value.fields[0].translatable, true);
  assert.equal(r.value.fields[1].translatable, undefined);
});

test("add_collection_field: translatable:true carried through", () => {
  const r = validateAddField({ collection: "content_x", name: "bio", type: "richtext", translatable: true });
  assert.ok(r.ok);
  assert.equal(r.value.field.translatable, true);
});

test("the tool schemas advertise a translatable field property", () => {
  const createProps = CREATE_COLLECTION_TOOL.function.parameters.properties.fields.items.properties;
  assert.ok(createProps.translatable, "create_collection field schema exposes translatable");
  assert.equal(createProps.translatable.type, "boolean");
  const addProps = ADD_COLLECTION_FIELD_TOOL.function.parameters.properties;
  assert.ok(addProps.translatable, "add_collection_field schema exposes translatable");
});

test("end-to-end shape: a translatable text field survives normalizeField, a non-text one drops it", () => {
  // The store runs args through normalizeField — the real gate. A text type keeps
  // the flag; a number type drops it (translatable is meaningless there).
  const r = validateCreateCollection({
    name: "C",
    fields: [
      { name: "title", type: "string", translatable: true },
      { name: "views", type: "int", translatable: true },
    ],
  });
  assert.ok(r.ok);
  assert.equal(normalizeField(r.value.fields[0]).translatable, true);
  assert.equal(normalizeField(r.value.fields[1]).translatable, undefined, "flag dropped on a non-text type");
});

// ── mcp-full-crud-patch T5: update_collection (omitted=keep, null=clear) ──────
import {
  validateUpdateCollection,
  validateUpdateCollectionField,
  validateDeleteCollection,
  validateItemRef,
  describeTypeCoercion,
  UPDATE_COLLECTION_TOOL,
  DELETE_COLLECTION_ITEM_TOOL,
  DELETE_COLLECTION_TOOL,
} from "../src/lib/chat/collection-tools.ts";

test("update_collection: requires an object and a collection", () => {
  assert.equal(validateUpdateCollection(null).ok, false);
  assert.equal(validateUpdateCollection("x").ok, false);
  const r = validateUpdateCollection({ label: "X" });
  assert.equal(r.ok, false);
  assert.match(r.error, /collection .*required/);
});

test("update_collection: label patches the display name (trimmed)", () => {
  const r = validateUpdateCollection({ collection: "content_menu", label: "  Menu items  " });
  assert.ok(r.ok);
  assert.deepEqual(r.value, { collection: "content_menu", patch: { name: "Menu items" } });
});

test("update_collection: label cannot be cleared — null/empty get a self-correcting error", () => {
  for (const bad of [null, "", "   ", 7]) {
    const r = validateUpdateCollection({ collection: "content_menu", label: bad });
    assert.equal(r.ok, false, `label ${JSON.stringify(bad)} should be rejected`);
    assert.match(r.error, /cannot be cleared/);
    assert.match(r.error, /omit `label` to keep/);
  }
});

test("update_collection: description — string sets, null and '' clear, other types rejected", () => {
  assert.deepEqual(
    validateUpdateCollection({ collection: "c", description: "Dishes we serve" }).value.patch,
    { description: "Dishes we serve" },
  );
  assert.deepEqual(validateUpdateCollection({ collection: "c", description: null }).value.patch, { description: null });
  assert.deepEqual(validateUpdateCollection({ collection: "c", description: "" }).value.patch, { description: null });
  const r = validateUpdateCollection({ collection: "c", description: 7 });
  assert.equal(r.ok, false);
  assert.match(r.error, /null to clear/);
});

test("update_collection: publicSubmissions — boolean sets, null resets to false, other types rejected", () => {
  assert.deepEqual(validateUpdateCollection({ collection: "c", publicSubmissions: true }).value.patch, { publicSubmissions: true });
  assert.deepEqual(validateUpdateCollection({ collection: "c", publicSubmissions: false }).value.patch, { publicSubmissions: false });
  assert.deepEqual(validateUpdateCollection({ collection: "c", publicSubmissions: null }).value.patch, { publicSubmissions: false });
  const r = validateUpdateCollection({ collection: "c", publicSubmissions: "yes" });
  assert.equal(r.ok, false);
  assert.match(r.error, /boolean/);
});

test("update_collection: an empty patch is rejected with the patchable key list", () => {
  const r = validateUpdateCollection({ collection: "content_menu" });
  assert.equal(r.ok, false);
  assert.match(r.error, /nothing to change/);
  assert.match(r.error, /label, description, publicSubmissions/);
});

test("update_collection: omitted keys stay OUT of the patch (omitted = keep)", () => {
  const r = validateUpdateCollection({ collection: "c", publicSubmissions: true });
  assert.ok(r.ok);
  assert.equal("name" in r.value.patch, false);
  assert.equal("description" in r.value.patch, false);
});

test("update_collection tool description states submissions land as drafts", () => {
  assert.match(UPDATE_COLLECTION_TOOL.function.description, /land as DRAFTS/i);
});

// ── update_collection_field ───────────────────────────────────────────────────

test("update_collection_field: requires collection and field", () => {
  assert.equal(validateUpdateCollectionField(null).ok, false);
  assert.match(validateUpdateCollectionField({ field: "x" }).error, /collection .*required/);
  assert.match(validateUpdateCollectionField({ collection: "c" }).error, /field .*required/);
});

test("update_collection_field: valid type passes; bad/null type gets the type list", () => {
  const r = validateUpdateCollectionField({ collection: "c", field: "f", type: "int" });
  assert.ok(r.ok);
  assert.deepEqual(r.value.patch, { type: "int" });
  for (const bad of ["integer", null, 7]) {
    const e = validateUpdateCollectionField({ collection: "c", field: "f", type: bad });
    assert.equal(e.ok, false, `type ${JSON.stringify(bad)} should be rejected`);
    assert.match(e.error, /string, text, richtext, number, int/);
    assert.match(e.error, /omit `type` to keep/);
  }
});

test("update_collection_field: required — boolean or null pass through; others rejected", () => {
  assert.deepEqual(validateUpdateCollectionField({ collection: "c", field: "f", required: true }).value.patch, { required: true });
  assert.deepEqual(validateUpdateCollectionField({ collection: "c", field: "f", required: null }).value.patch, { required: null });
  assert.equal(validateUpdateCollectionField({ collection: "c", field: "f", required: "yes" }).ok, false);
});

test("update_collection_field: default — scalars and null pass; objects rejected", () => {
  for (const d of ["x", 7, true, null]) {
    const r = validateUpdateCollectionField({ collection: "c", field: "f", default: d });
    assert.ok(r.ok, `default ${JSON.stringify(d)} should pass`);
    assert.equal(r.value.patch.default, d);
  }
  assert.equal(validateUpdateCollectionField({ collection: "c", field: "f", default: {} }).ok, false);
});

test("update_collection_field: description — string sets, null/'' clear", () => {
  assert.deepEqual(validateUpdateCollectionField({ collection: "c", field: "f", description: "d" }).value.patch, { description: "d" });
  assert.deepEqual(validateUpdateCollectionField({ collection: "c", field: "f", description: null }).value.patch, { description: null });
  assert.deepEqual(validateUpdateCollectionField({ collection: "c", field: "f", description: "" }).value.patch, { description: null });
});

test("update_collection_field: empty patch names the field and the patchable keys", () => {
  const r = validateUpdateCollectionField({ collection: "c", field: "price" });
  assert.equal(r.ok, false);
  assert.match(r.error, /"price"/);
  assert.match(r.error, /type, required, default, description/);
});

// ── describeTypeCoercion (names the SQLite-affinity conversion, verbatim) ────

test("coercion: same affinity → values unchanged", () => {
  const msg = describeTypeCoercion("string", "richtext", 3);
  assert.match(msg, /^3 rows: string → richtext — /);
  assert.match(msg, /unchanged/);
  assert.match(msg, /TEXT/);
});

test("coercion: number → text names the text re-store with a REAL example", () => {
  const msg = describeTypeCoercion("number", "text", 42);
  assert.match(msg, /^42 rows: number → text — /);
  assert.match(msg, /TEXT affinity/);
  assert.match(msg, /42\.5 → '42\.5'/);
});

test("coercion: int → string uses the integer example", () => {
  assert.match(describeTypeCoercion("int", "string", 2), /42 → '42'/);
});

test("coercion: text → int names numeric conversion AND that other text is kept", () => {
  const msg = describeTypeCoercion("text", "int", 5);
  assert.match(msg, /INTEGER affinity/);
  assert.match(msg, /'42' → 42/);
  assert.match(msg, /non-numeric text keeps its original text value/);
});

test("coercion: number → int states fractional values are never rounded", () => {
  const msg = describeTypeCoercion("number", "int", 1);
  assert.match(msg, /^1 row: number → int — /);
  assert.match(msg, /42\.0 → 42/);
  assert.match(msg, /never rounded/);
});

test("coercion: int → number states the float re-store", () => {
  assert.match(describeTypeCoercion("int", "number", 2), /42 → 42\.0/);
});

test("coercion: unknown row count reads 'existing rows'", () => {
  assert.match(describeTypeCoercion("string", "int", null), /^existing rows: string → int/);
});

// ── delete_collection / restore_collection_item / delete_collection_item ────

test("delete_collection: requires a collection; passes it through trimmed", () => {
  assert.equal(validateDeleteCollection(null).ok, false);
  assert.equal(validateDeleteCollection({}).ok, false);
  assert.deepEqual(validateDeleteCollection({ collection: " content_menu " }).value, { collection: "content_menu" });
});

test("item ref (restore/hard delete): requires collection and id, points at query_collection", () => {
  assert.equal(validateItemRef(null).ok, false);
  assert.match(validateItemRef({ id: "x" }).error, /collection .*required/);
  const r = validateItemRef({ collection: "c" });
  assert.equal(r.ok, false);
  assert.match(r.error, /query_collection/);
  assert.deepEqual(validateItemRef({ collection: "c", id: " i1 " }).value, { collection: "c", id: "i1" });
});

test("delete tools' descriptions state permanence and the guard", () => {
  assert.match(DELETE_COLLECTION_ITEM_TOOL.function.description, /PERMANENTLY/);
  assert.match(DELETE_COLLECTION_ITEM_TOOL.function.description, /archive_collection_item/);
  assert.match(DELETE_COLLECTION_TOOL.function.description, /BLOCKED while/);
  assert.match(DELETE_COLLECTION_TOOL.function.description, /no force flag/);
});
