/**
 * Pure unit tests for the Slice 3 part 2 write AI tools (ai-assistant goal):
 * the tool schemas' shape + the pure arg helpers (splitThemeArgs,
 * coerceIdentityArg, builtinBlockTypes). Dep-free `node --test` (project convention).
 * The actual writes (upsert/setPageBlocks/setSiteIdentity/setThemeOverrides) and
 * artifact/block validation are tested in their own store/validator test files;
 * here we cover only what's PURE to this module.
 *
 * Run: node --test scripts/write-tools.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UPDATE_COMPONENT_TOOL,
  UPDATE_PAGE_BLOCKS_TOOL,
  UPDATE_BRAND_IDENTITY_TOOL,
  UPDATE_THEME_TOOL,
  LIST_BUILTIN_TYPES_TOOL,
  builtinBlockTypes,
  splitThemeArgs,
  coerceIdentityArg,
} from "../src/lib/chat/write-tools.ts";

test("each write tool schema is a well-formed function tool with a unique name", () => {
  const tools = [
    UPDATE_COMPONENT_TOOL,
    UPDATE_PAGE_BLOCKS_TOOL,
    UPDATE_BRAND_IDENTITY_TOOL,
    UPDATE_THEME_TOOL,
    LIST_BUILTIN_TYPES_TOOL,
  ];
  const names = new Set();
  for (const t of tools) {
    assert.equal(t.type, "function");
    assert.equal(typeof t.function.name, "string");
    assert.ok(t.function.name.length > 0);
    assert.equal(typeof t.function.description, "string");
    assert.equal(t.function.parameters.type, "object");
    assert.ok(Array.isArray(t.function.parameters.required));
    names.add(t.function.name);
  }
  assert.equal(names.size, tools.length, "tool names must be unique");
});

test("required args match the documented contract", () => {
  assert.deepEqual(UPDATE_COMPONENT_TOOL.function.parameters.required, ["name", "html"]);
  assert.deepEqual(UPDATE_PAGE_BLOCKS_TOOL.function.parameters.required, ["id", "blocks"]);
  assert.deepEqual(UPDATE_BRAND_IDENTITY_TOOL.function.parameters.required, ["identity"]);
  // update_theme: both light/dark optional (handler enforces "at least one").
  assert.deepEqual(UPDATE_THEME_TOOL.function.parameters.required, []);
  assert.deepEqual(LIST_BUILTIN_TYPES_TOOL.function.parameters.required, []);
});

test("builtinBlockTypes exposes Section (and NOT the internal column type)", () => {
  const builtins = builtinBlockTypes();
  const names = builtins.map((b) => b.name);
  assert.ok(names.includes("Section"));
  assert.ok(!names.includes("__section_column__"), "internal column must stay hidden");
  for (const b of builtins) assert.equal(typeof b.description, "string");
});

test("splitThemeArgs keeps only object light/dark and flags presence", () => {
  assert.deepEqual(splitThemeArgs({ light: { primary: "#111" } }), {
    light: { primary: "#111" },
    any: true,
  });
  assert.deepEqual(splitThemeArgs({ dark: { bg: "#000" } }), {
    dark: { bg: "#000" },
    any: true,
  });
  const both = splitThemeArgs({ light: { a: "1" }, dark: { b: "2" } });
  assert.deepEqual(both, { light: { a: "1" }, dark: { b: "2" }, any: true });
  // Non-object / array / missing values are ignored.
  assert.deepEqual(splitThemeArgs({ light: "nope", dark: [1, 2] }), { any: false });
  assert.deepEqual(splitThemeArgs({}), { any: false });
  assert.deepEqual(splitThemeArgs(null), { any: false });
  assert.deepEqual(splitThemeArgs("x"), { any: false });
});

test("coerceIdentityArg returns the identity object or undefined", () => {
  assert.deepEqual(coerceIdentityArg({ identity: { name: "Acme" } }), { name: "Acme" });
  assert.equal(coerceIdentityArg({ identity: "Acme" }), undefined); // not an object
  assert.equal(coerceIdentityArg({ identity: [1] }), undefined); // array
  assert.equal(coerceIdentityArg({}), undefined); // missing
  assert.equal(coerceIdentityArg(null), undefined); // not an object
});
