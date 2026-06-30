/**
 * Pure arg coercion for the read tools (node --test; no @/ imports). Just the
 * non-trivial branch logic — `coerceGuideArg` defaults anything that isn't the
 * literal "components" to "page-builder".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { coerceGuideArg } from "./read-tools.ts";

test("coerceGuideArg: known contexts kept, everything else → page-builder", () => {
  assert.equal(coerceGuideArg({ guide: "components" }), "components");
  assert.equal(coerceGuideArg({ guide: "page-builder" }), "page-builder");
  assert.equal(coerceGuideArg({ guide: "settings" }), "settings");
  assert.equal(coerceGuideArg({ guide: "collections" }), "collections");
  assert.equal(coerceGuideArg({ guide: "general" }), "general");
  assert.equal(coerceGuideArg({ guide: "nonsense" }), "page-builder");
  assert.equal(coerceGuideArg({}), "page-builder");
  assert.equal(coerceGuideArg(null), "page-builder");
  assert.equal(coerceGuideArg("components"), "page-builder"); // not an object → default
});
