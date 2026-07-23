import test from "node:test";
import assert from "node:assert/strict";
import { allowedModelValues } from "./allowed-values.ts";
import type { AiConfig } from "./types.ts";

const cfg: AiConfig = {
  version: 1,
  purposes: {
    chatAgent: { models: [] },
    assistant: { models: [] },
    imageDescribe: {
      models: [{ key: "standard", label: "Standard", model: "openai/gpt-4o-mini", marginPct: 30 }],
    },
    imageGenerate: { models: [] },
    translate: { models: [] },
  },
  quota: { monthlyUsd: 10 },
};

test("allowedModelValues: curated alias keys become persistable", () => {
  const allowed = allowedModelValues(cfg, "imageDescribe", ["openai/legacy-vision"]);
  assert.ok(allowed.has("standard"));
});

test("allowedModelValues: a curated model id is allowed even if absent from the catalog", () => {
  const allowed = allowedModelValues(cfg, "imageDescribe", []);
  assert.ok(allowed.has("openai/gpt-4o-mini"));
});

test("allowedModelValues: catalog ids stay allowed (legacy picks keep saving)", () => {
  const allowed = allowedModelValues(cfg, "imageDescribe", ["openai/legacy-vision"]);
  assert.ok(allowed.has("openai/legacy-vision"));
});

test("allowedModelValues: an uncurated purpose or no config allows exactly the catalog", () => {
  assert.deepEqual(allowedModelValues(cfg, "translate", ["a", "b"]), new Set(["a", "b"]));
  assert.deepEqual(allowedModelValues(null, "imageDescribe", ["a"]), new Set(["a"]));
});

test("allowedModelValues: an unknown value is still rejected", () => {
  assert.equal(allowedModelValues(cfg, "imageDescribe", ["a"]).has("no-such-thing"), false);
});
