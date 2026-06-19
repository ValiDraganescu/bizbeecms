/**
 * Pure test for `collectComponentNames` (page-builder Preview slice).
 *
 * The draft-preview route and the public route both call this to decide which
 * D1 component rows to fetch before planning a page. If it misses a nested
 * component, the preview iframe would render a placeholder instead of the real
 * component — so this guards the recursion (incl. Sections nesting components).
 *
 * Relative `.ts` import — `node --test` can't resolve the `@/` alias (CAVEATS).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { collectComponentNames, SECTION_COMPONENT, type Block } from "./tree.ts";

const block = (component: string, children?: Block[]): Block => ({
  id: component + Math.random().toString(36).slice(2),
  component,
  ...(children ? { children } : {}),
});

test("collects top-level component names", () => {
  const names = collectComponentNames([block("Hero"), block("CallToAction")]);
  assert.deepEqual([...names].sort(), ["CallToAction", "Hero"]);
});

test("recurses into Section children (the builder's nesting model)", () => {
  const tree: Block[] = [
    block(SECTION_COMPONENT, [block("Card"), block("Card"), block("Button")]),
  ];
  const names = collectComponentNames(tree);
  // Section itself + its distinct children; duplicates collapse (it's a Set).
  assert.deepEqual([...names].sort(), ["Button", "Card", "Section"]);
});

test("empty tree yields an empty set (draft with no blocks still previews)", () => {
  assert.equal(collectComponentNames([]).size, 0);
});

test("deeply nested sections are fully walked", () => {
  const tree: Block[] = [
    block(SECTION_COMPONENT, [block(SECTION_COMPONENT, [block("Deep")])]),
  ];
  assert.ok(collectComponentNames(tree).has("Deep"));
});
