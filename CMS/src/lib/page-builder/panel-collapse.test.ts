import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCollapsed } from "./panel-collapse.ts";

test("resolveCollapsed: only the literal 'true' means collapsed", () => {
  assert.equal(resolveCollapsed("true"), true);
  assert.equal(resolveCollapsed("false"), false);
  // default-expanded on anything unknown
  assert.equal(resolveCollapsed(null), false);
  assert.equal(resolveCollapsed(undefined), false);
  assert.equal(resolveCollapsed(""), false);
  assert.equal(resolveCollapsed("1"), false);
  assert.equal(resolveCollapsed("yes"), false);
});
