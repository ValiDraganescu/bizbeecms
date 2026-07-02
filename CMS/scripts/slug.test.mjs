/**
 * Dep-free unit tests for the pure slug-path resolver (epic A2 route).
 * Run: node --test scripts/slug.test.mjs
 *
 * Imports the TS module directly via Node native type-stripping (project
 * convention; no @/ alias, no React/drizzle imports — slug.ts is pure).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveSlugPath,
  HOME_SLUG,
  matchSlugSegment,
} from "../src/lib/render/slug.ts";

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

// ── matchSlugSegment — platform feature: dynamic/param-driven pages ─────────

test("matchSlugSegment: exact slug match wins, no param captured", () => {
  const siblings = [{ slug: "about" }, { slug: ":city-slug" }];
  const m = matchSlugSegment(siblings, "about");
  assert.deepEqual(m, { page: { slug: "about" } });
});

test("matchSlugSegment: falls back to a wildcard sibling, captures the param", () => {
  const siblings = [{ slug: "about" }, { slug: ":city-slug" }];
  const m = matchSlugSegment(siblings, "helsinki");
  assert.deepEqual(m, {
    page: { slug: ":city-slug" },
    param: { name: "city-slug", value: "helsinki" },
  });
});

test("matchSlugSegment: no exact and no wildcard sibling → null (404)", () => {
  const siblings = [{ slug: "about" }, { slug: "pricing" }];
  assert.equal(matchSlugSegment(siblings, "helsinki"), null);
});

test("matchSlugSegment: empty siblings → null", () => {
  assert.equal(matchSlugSegment([], "anything"), null);
});

test("matchSlugSegment: exact match preferred even alongside a wildcard sibling with the same literal value", () => {
  const siblings = [{ slug: "helsinki" }, { slug: ":city-slug" }];
  const m = matchSlugSegment(siblings, "helsinki");
  assert.deepEqual(m, { page: { slug: "helsinki" } });
});
