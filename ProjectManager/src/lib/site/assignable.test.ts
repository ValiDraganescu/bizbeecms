import { test } from "node:test";
import assert from "node:assert/strict";
import { isAssignableToSite } from "./assignable.ts";

// pm-roles — Editor invite→assignment follow-up. Locks the per-Site assign-list
// candidacy contract: Editors (no country scope) must appear for EVERY Site so an
// Admin can assign them, while country-scoped users only appear for their Sites.

test("global user (no country scope) is assignable to any Site", () => {
  assert.equal(isAssignableToSite([], "FI"), true);
  assert.equal(isAssignableToSite([], "EE"), true);
  // ...including a global Site.
  assert.equal(isAssignableToSite([], null), true);
});

test("Editor (no country rows by construction) appears for a global Site", () => {
  // This is the crux of the follow-up: an Editor carries NO country/tag scope, so
  // its scope list is empty and it must be assignable everywhere, global Sites too.
  const editorScope: string[] = [];
  assert.equal(isAssignableToSite(editorScope, null), true);
  assert.equal(isAssignableToSite(editorScope, "ET"), true);
});

test("country-scoped user is assignable only within its countries", () => {
  assert.equal(isAssignableToSite(["FI"], "FI"), true);
  assert.equal(isAssignableToSite(["FI", "EE"], "EE"), true);
  assert.equal(isAssignableToSite(["FI"], "EE"), false);
});

test("country-scoped user is NOT assignable to a global Site", () => {
  // A global Site needs a globally-scoped user — a country-scoped one can't reach it.
  assert.equal(isAssignableToSite(["FI"], null), false);
  assert.equal(isAssignableToSite(["FI", "EE"], null), false);
});
