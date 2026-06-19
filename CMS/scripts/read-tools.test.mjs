/**
 * Pure unit tests for the Slice 3 read-only AI tools (ai-assistant goal):
 * arg coercion + D1-row shaping. Dep-free `node --test` (project convention).
 *
 * Run: node --test scripts/read-tools.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coerceIdArg,
  formatComponentList,
  formatPageList,
  LIST_COMPONENTS_TOOL,
  GET_COMPONENT_TOOL,
  GET_PAGE_TOOL,
} from "../src/lib/chat/read-tools.ts";

test("coerceIdArg returns a trimmed string or undefined", () => {
  assert.equal(coerceIdArg({ name: "  Hero " }, "name"), "Hero");
  assert.equal(coerceIdArg({ id: "p1" }, "id"), "p1");
  assert.equal(coerceIdArg({ name: "   " }, "name"), undefined); // blank
  assert.equal(coerceIdArg({ name: 42 }, "name"), undefined); // wrong type
  assert.equal(coerceIdArg({}, "name"), undefined); // missing
  assert.equal(coerceIdArg(null, "name"), undefined); // not an object
  assert.equal(coerceIdArg("nope", "name"), undefined);
});

test("formatComponentList reports hasProps correctly", () => {
  const out = formatComponentList([
    { name: "Hero", propsSchema: '{"title":"string"}' },
    { name: "Footer", propsSchema: "{}" }, // empty schema → no props
    { name: "Nav", propsSchema: null },
    { name: "Card" }, // missing
  ]);
  assert.deepEqual(out, [
    { name: "Hero", hasProps: true },
    { name: "Footer", hasProps: false },
    { name: "Nav", hasProps: false },
    { name: "Card", hasProps: false },
  ]);
});

test("formatPageList surfaces compact summary + locale union", () => {
  const out = formatPageList([
    {
      id: "p1",
      slug: "home",
      parentSlug: null,
      publishStatus: "published",
      metaTitle: { en: "Home", fi: "Koti" },
      metaDescription: { en: "Welcome", et: "Tere" },
    },
    {
      id: "p2",
      slug: "about",
      parentSlug: "home",
      publishStatus: "draft",
      metaTitle: {},
      metaDescription: {},
    },
  ]);
  assert.deepEqual(out, [
    {
      id: "p1",
      slug: "home",
      parentSlug: null,
      publishStatus: "published",
      locales: ["en", "et", "fi"], // union of title+description keys, sorted
    },
    {
      id: "p2",
      slug: "about",
      parentSlug: "home",
      publishStatus: "draft",
      locales: [],
    },
  ]);
});

test("read tool schemas have stable names + required args", () => {
  assert.equal(LIST_COMPONENTS_TOOL.function.name, "list_components");
  assert.deepEqual(LIST_COMPONENTS_TOOL.function.parameters.required, []);
  assert.equal(GET_COMPONENT_TOOL.function.name, "get_component");
  assert.deepEqual(GET_COMPONENT_TOOL.function.parameters.required, ["name"]);
  assert.equal(GET_PAGE_TOOL.function.name, "get_page");
  assert.deepEqual(GET_PAGE_TOOL.function.parameters.required, ["id"]);
});
