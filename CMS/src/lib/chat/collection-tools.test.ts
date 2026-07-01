/**
 * Pure tests for the collection tool arg validators (node --test).
 * Focused on validateAddField — the tool the model previously lacked and kept
 * hallucinating (`unknown tool: add_collection_field`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAddField } from "./collection-tools.ts";

test("validateAddField: shapes a minimal field", () => {
  const r = validateAddField({ collection: "content_restaurants", name: "featured", type: "bool" });
  assert.ok(r.ok);
  assert.equal(r.value.collection, "content_restaurants");
  assert.deepEqual(r.value.field, { name: "featured", type: "bool" });
});

test("validateAddField: carries required + options through", () => {
  const r = validateAddField({
    collection: "content_x",
    name: "tier",
    type: "select",
    required: true,
    options: ["gold", "silver", 3], // non-strings filtered out
  });
  assert.ok(r.ok);
  assert.deepEqual(r.value.field, { name: "tier", type: "select", required: true, options: ["gold", "silver"] });
});

test("validateAddField: rejects missing collection/name/type", () => {
  for (const args of [
    {},
    { name: "a", type: "string" }, // no collection
    { collection: "content_x", type: "string" }, // no name
    { collection: "content_x", name: "a" }, // no type
    "not an object",
  ]) {
    const r = validateAddField(args);
    assert.equal(r.ok, false, `should reject ${JSON.stringify(args)}`);
  }
});
