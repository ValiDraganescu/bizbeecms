/**
 * Dep-free unit tests for the pure slug-path resolver (epic A2 route).
 * Run: node --test scripts/slug.test.mjs
 *
 * Imports the TS module directly via Node native type-stripping (project
 * convention; no @/ alias, no React/drizzle imports — slug.ts is pure).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSlugPath, HOME_SLUG } from "../src/lib/render/slug.ts";

test("root: undefined segments map to the home slug", () => {
  assert.deepEqual(resolveSlugPath(undefined), [HOME_SLUG]);
});

test("root: empty array maps to the home slug", () => {
  assert.deepEqual(resolveSlugPath([]), [HOME_SLUG]);
});

test("single segment passes through", () => {
  assert.deepEqual(resolveSlugPath(["about"]), ["about"]);
});

test("nested segments preserve order (parent → child chain)", () => {
  assert.deepEqual(resolveSlugPath(["blog", "hello-world"]), [
    "blog",
    "hello-world",
  ]);
});

test("empty/whitespace segments are dropped (defends against //)", () => {
  assert.deepEqual(resolveSlugPath(["blog", "", "  ", "post"]), [
    "blog",
    "post",
  ]);
});

test("all-empty segments fall back to home (not an empty path)", () => {
  assert.deepEqual(resolveSlugPath(["", "   "]), [HOME_SLUG]);
});

test("URL-encoded segments are decoded", () => {
  assert.deepEqual(resolveSlugPath(["caf%C3%A9"]), ["café"]);
});

test("malformed percent-encoding is left as-is (no throw)", () => {
  assert.deepEqual(resolveSlugPath(["100%"]), ["100%"]);
});
