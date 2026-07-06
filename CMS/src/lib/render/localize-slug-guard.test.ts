/**
 * localeSlugConflicts — the slug-vs-locale-code collision guard (Stage 1,
 * path-locales-edge-cache). Dep-free `node --test` per project convention.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { localeSlugConflicts } from "./localize.ts";

const LOCALES = ["en", "fi", "et", "ro-ro"];

test("no top-level slugs → no conflicts", () => {
  assert.deepEqual(localeSlugConflicts(LOCALES, []), []);
});

test("ordinary slugs don't conflict", () => {
  assert.deepEqual(localeSlugConflicts(LOCALES, ["about", "contact", "fin"]), []);
});

test("slug equal to a non-default locale code conflicts", () => {
  assert.deepEqual(localeSlugConflicts(LOCALES, ["fi", "about"]), ["fi"]);
});

test("slug equal to the DEFAULT locale code also conflicts (future default flips)", () => {
  assert.deepEqual(localeSlugConflicts(LOCALES, ["en"]), ["en"]);
});

test("region subtag codes conflict too", () => {
  assert.deepEqual(localeSlugConflicts(LOCALES, ["ro-ro"]), ["ro-ro"]);
});

test("comparison is case-insensitive and trimmed on both sides", () => {
  assert.deepEqual(localeSlugConflicts(["FI ", "et"], [" fi", "ET"]), ["fi", "et"]);
});

test("wildcard :param slugs never conflict", () => {
  assert.deepEqual(localeSlugConflicts(LOCALES, [":fi", ":city"]), []);
});

test("multiple conflicts are all reported, in locale order", () => {
  assert.deepEqual(localeSlugConflicts(LOCALES, ["et", "fi", "x"]), ["fi", "et"]);
});
