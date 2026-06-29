/**
 * Dep-free unit tests for applyDefaults (props sidebar persistence).
 * Run: node --test scripts/props-defaults.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyDefaults } from "../src/lib/chat/props-defaults.ts";

test("replaces a prop's default, preserves the other descriptor keys", () => {
  const schema = JSON.stringify({
    title: { type: "string", default: "Old", label: "Title", required: true },
  });
  const out = JSON.parse(applyDefaults(schema, { title: "New" }));
  assert.deepEqual(out.title, {
    type: "string",
    default: "New",
    label: "Title",
    required: true,
  });
});

test("keeps stored default for props not in values", () => {
  const schema = JSON.stringify({
    a: { type: "string", default: "A" },
    b: { type: "string", default: "B" },
  });
  const out = JSON.parse(applyDefaults(schema, { a: "A2" }));
  assert.equal(out.a.default, "A2");
  assert.equal(out.b.default, "B");
});

test("ignores values for props not in the schema (schema is the allowlist)", () => {
  const schema = JSON.stringify({ a: { type: "string", default: "A" } });
  const out = JSON.parse(applyDefaults(schema, { a: "A2", bogus: "x" }));
  assert.equal(out.bogus, undefined);
});

test("stores typed values (number/boolean) so the type round-trips", () => {
  const schema = JSON.stringify({
    count: { type: "number", default: 1 },
    on: { type: "boolean", default: false },
  });
  const out = JSON.parse(applyDefaults(schema, { count: 5, on: true }));
  assert.equal(out.count.default, 5);
  assert.equal(out.on.default, true);
});

test("malformed / non-object schema is returned unchanged", () => {
  assert.equal(applyDefaults("not json", { a: 1 }), "not json");
  assert.equal(applyDefaults("[1,2]", { a: 1 }), "[1,2]");
});

test("null/empty schema yields an empty object string", () => {
  assert.equal(applyDefaults(null, { a: 1 }), "{}");
  assert.equal(applyDefaults("", { a: 1 }), "{}");
});
