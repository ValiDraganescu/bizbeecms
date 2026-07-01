import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePageInput } from "./page-tool.ts";

// A minimal valid create_page arg; `sections` overrides the block tree.
function args(sections: unknown) {
  return {
    slug: "home",
    blocks: sections,
    metaTitle: {},
    metaDescription: {},
  };
}

// A well-formed Section (one column, one component) — `name` toggles the rule.
function section(id: string, name?: string) {
  return {
    id,
    component: "Section",
    props: name === undefined ? { columns: 1 } : { columns: 1, name },
    children: [
      { id: `${id}-c`, component: "__section_column__", children: [] },
    ],
  };
}

test("create_page requires every Section to carry a props.name", () => {
  const v = validatePageInput(args([section("s1")]));
  assert.equal(v.ok, false, "an unnamed section is rejected");
  if (!v.ok) assert.match(v.errors.join("\n"), /Section with no name/);
});

test("create_page accepts a Section that has a non-empty name", () => {
  const v = validatePageInput(args([section("s1", "Hero")]));
  assert.ok(v.ok, v.ok ? "" : v.errors.join("; "));
});

test("create_page rejects a whitespace-only section name", () => {
  const v = validatePageInput(args([section("s1", "   ")]));
  assert.equal(v.ok, false, "a blank name doesn't satisfy the rule");
});
