/**
 * Pure unit tests for the on-demand JSON-LD authoring guide tool (seo-robots,
 * AI-assistant enablement): the tool schema, the guide content (locked to the
 * shipped jsonld surface + quoting rules so a rename/contract change can't
 * silently make the guide lie), and its registration in the pure tool scopes.
 *
 * Run: node --test scripts/jsonld-guide.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { GET_JSONLD_GUIDE_TOOL, JSONLD_GUIDE } from "../src/lib/chat/jsonld-guide.ts";
import {
  KNOWN_TOOL_NAMES,
  toolsForContext,
  contextPrompt,
} from "../src/lib/chat/tool-scopes.ts";

test("tool schema: zero-arg function named get_jsonld_guide", () => {
  const fn = GET_JSONLD_GUIDE_TOOL.function;
  assert.equal(GET_JSONLD_GUIDE_TOOL.type, "function");
  assert.equal(fn.name, "get_jsonld_guide");
  assert.ok(fn.description.length > 100, "description should say when to call it");
  assert.deepEqual(fn.parameters.required, []);
  assert.deepEqual(fn.parameters.properties, {});
});

test("guide covers the shipped jsonld surface + quoting contract", () => {
  // The tools that author/use jsonld, by exact shipped name.
  for (const tool of [
    "create_component",
    "update_component",
    "bind_component",
    "create_list",
    "bind_list",
  ]) {
    assert.ok(JSONLD_GUIDE.includes(tool), `guide should mention ${tool}`);
  }
  // Key semantics the guide MUST state (verified against component-tool.ts
  // validateJsonLdArtifact + binding-tools.ts bind_list).
  for (const fact of [
    'kind:"jsonld"', // the create/update flag
    "@context", // required shape
    "@type", // required shape
    "https://schema.org",
    '"name": "{{title}}"', // string slot QUOTED
    '"ratingValue": {{rating}}', // number slot UNQUOTED
    "itemList:true", // aggregate ItemList opt-in
    "PER-ROW", // per-row List mode
    "ItemList", // aggregate mode
    "Product", // per-type patterns
    "Article",
    "FAQPage",
    "Recipe",
    "BreadcrumbList", // the automatic one — don't double up
  ]) {
    assert.ok(JSONLD_GUIDE.includes(fact), `guide should state: ${fact}`);
  }
});

test("every tool name the guide references exists (no drift on renames)", () => {
  const known = new Set(KNOWN_TOOL_NAMES);
  // snake_case tokens in the guide that are deliberately NOT tools.
  const nonTools = new Set(["city_slug"]); // never appears (hyphenated), belt-and-braces
  const mentioned = JSONLD_GUIDE.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [];
  assert.ok(
    mentioned.filter((t) => known.has(t)).length >= 4,
    "guide should reference the real tools",
  );
  for (const t of mentioned) {
    assert.ok(
      known.has(t) || nonTools.has(t),
      `guide mentions unknown tool-like token "${t}" — renamed tool or typo?`,
    );
  }
});

test("registered in the pure tool scopes + surfaced in the context prompts", () => {
  assert.ok(KNOWN_TOOL_NAMES.includes("get_jsonld_guide"));
  for (const ctx of ["page-builder", "pages", "components", "general"]) {
    assert.ok(
      toolsForContext(ctx).includes("get_jsonld_guide"),
      `${ctx} should expose get_jsonld_guide`,
    );
  }
  // The model must KNOW the guide exists — the three authoring contexts name it.
  assert.ok(contextPrompt("page-builder").includes("get_jsonld_guide"));
  assert.ok(contextPrompt("pages").includes("get_jsonld_guide"));
  assert.ok(contextPrompt("components").includes("get_jsonld_guide"));
});
