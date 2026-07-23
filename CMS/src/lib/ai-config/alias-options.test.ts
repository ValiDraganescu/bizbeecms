import test from "node:test";
import assert from "node:assert/strict";
import { matchAlias, selectValueFor, type AliasOption } from "./alias-options.ts";

const aliases: AliasOption[] = [
  { key: "fast-chat", label: "Fast chat", model: "openai/gpt-4o-mini" },
  { key: "smart-chat", label: "Smart chat", model: "anthropic/claude-sonnet-5" },
];

test("matchAlias: an alias key selects its entry", () => {
  assert.equal(matchAlias(aliases, "smart-chat")?.label, "Smart chat");
});

test("matchAlias: a legacy raw model id selects the alias that wraps it", () => {
  assert.equal(matchAlias(aliases, "anthropic/claude-sonnet-5")?.key, "smart-chat");
});

test("matchAlias: an uncurated or missing value matches nothing", () => {
  assert.equal(matchAlias(aliases, "openai/retired-model"), null);
  assert.equal(matchAlias(aliases, null), null);
  assert.equal(matchAlias(aliases, ""), null);
  assert.equal(matchAlias([], "fast-chat"), null);
});

test("selectValueFor: stored values normalize to the alias key", () => {
  assert.equal(selectValueFor(aliases, "fast-chat"), "fast-chat");
  assert.equal(selectValueFor(aliases, "openai/gpt-4o-mini"), "fast-chat");
});

test("selectValueFor: an uncurated legacy id stays selected as itself", () => {
  assert.equal(selectValueFor(aliases, "openai/retired-model"), "openai/retired-model");
});
