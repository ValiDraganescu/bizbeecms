/**
 * Pure unit tests for the on-demand data-sources guide tool
 * (external-data-sources, AI-assistant enablement): the tool schema, the guide
 * content (locked to the SHIPPED tool surface so a rename can't silently make
 * the guide lie), and its registration in the pure tool scopes.
 *
 * Run: node --test scripts/data-sources-guide.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GET_DATA_SOURCES_GUIDE_TOOL,
  DATA_SOURCES_GUIDE,
} from "../src/lib/chat/data-sources-guide.ts";
import {
  KNOWN_TOOL_NAMES,
  toolsForContext,
  contextPrompt,
} from "../src/lib/chat/tool-scopes.ts";

test("tool schema: zero-arg function named get_data_sources_guide", () => {
  const fn = GET_DATA_SOURCES_GUIDE_TOOL.function;
  assert.equal(GET_DATA_SOURCES_GUIDE_TOOL.type, "function");
  assert.equal(fn.name, "get_data_sources_guide");
  assert.ok(fn.description.length > 100, "description should say when to call it");
  assert.deepEqual(fn.parameters.required, []);
  assert.deepEqual(fn.parameters.properties, {});
});

test("guide covers the full shipped surface", () => {
  // Every tool the guide teaches, by exact shipped name.
  for (const tool of [
    "list_data_sources",
    "create_data_source",
    "test_data_source",
    "bind_component",
    "create_list",
    "bind_list",
    "create_form",
    "bind_form",
  ]) {
    assert.ok(DATA_SOURCES_GUIDE.includes(tool), `guide should mention ${tool}`);
  }
  // Key semantics the guide must state (verified against the shipped code).
  for (const fact of [
    "{placeholder}", // param passing
    "dot-path", // api map values
    "hasSecret", // write-only secret
    "publicSubmissions", // collection form opt-in
    '{"_op":"set_public_submissions","enabled":true}', // the exact operator fix
    "DRAFT", // forced-draft submissions
    "retryable", // idempotent-safe marker
    "cacheTtlSec", // per-request cache config
    "child", // create_form one-call pattern
    'type="submit"', // native form semantics
    "itemsPath", // nested rows arrays
    "BY NAME", // form field mapping contract
    // Dynamic-pages route refs moved here (dedup slice): the guide is now the
    // canonical home; schemas/context prompts carry only terse pointers.
    '{ "param": "city-slug" }',
    '{ "query": "q" }',
    "WILDCARD",
  ]) {
    assert.ok(DATA_SOURCES_GUIDE.includes(fact), `guide should state: ${fact}`);
  }
});

test("every tool name the guide references exists (no drift on renames)", () => {
  const known = new Set(KNOWN_TOOL_NAMES);
  // The only snake_case tokens in the guide that are deliberately NOT tools.
  const nonTools = new Set([
    "set_public_submissions", // the operator PATCH _op
    "client_id", // oauth2 secret format
    "client_secret",
  ]);
  // Tokens that look like tool names (snake_case words with an underscore).
  const mentioned = DATA_SOURCES_GUIDE.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [];
  assert.ok(
    mentioned.filter((t) => known.has(t)).length >= 8,
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
  assert.ok(KNOWN_TOOL_NAMES.includes("get_data_sources_guide"));
  for (const ctx of ["page-builder", "pages", "general"]) {
    assert.ok(
      toolsForContext(ctx).includes("get_data_sources_guide"),
      `${ctx} should expose get_data_sources_guide`,
    );
  }
  // The model must KNOW the guide exists — both data-source contexts name it.
  assert.ok(contextPrompt("page-builder").includes("get_data_sources_guide"));
  assert.ok(contextPrompt("pages").includes("get_data_sources_guide"));
});
