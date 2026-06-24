/**
 * ai-widget-ux — pure tests for the persisted-model resolver.
 * Runs under `node --test`; storage helpers are guarded, not exercised here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveInitialModel } from "./selected-model.ts";

const CATALOG = ["openai/gpt-4o-mini", "openai/gpt-4o", "anthropic/claude-3.5-sonnet"];
const DEFAULT = "openai/gpt-4o-mini";

test("no stored value → default", () => {
  assert.equal(resolveInitialModel(null, CATALOG, DEFAULT), DEFAULT);
  assert.equal(resolveInitialModel(undefined, CATALOG, DEFAULT), DEFAULT);
  assert.equal(resolveInitialModel("", CATALOG, DEFAULT), DEFAULT);
});

test("stored value present in catalog → kept", () => {
  assert.equal(resolveInitialModel("openai/gpt-4o", CATALOG, DEFAULT), "openai/gpt-4o");
});

test("stored value no longer in catalog → default", () => {
  assert.equal(resolveInitialModel("retired/model", CATALOG, DEFAULT), DEFAULT);
});

test("empty catalog (offline) → keep a non-empty stored id rather than discard", () => {
  assert.equal(resolveInitialModel("anything/at-all", [], DEFAULT), "anything/at-all");
});

test("empty catalog + no stored value → default", () => {
  assert.equal(resolveInitialModel(null, [], DEFAULT), DEFAULT);
});
