import test from "node:test";
import assert from "node:assert/strict";
import { effectiveModel } from "./effective-model.ts";
import type { AiConfig } from "./types.ts";

const LEGACY_DEFAULT = "openai/gpt-legacy-default";

const cfg: AiConfig = {
  version: 1,
  purposes: {
    chatAgent: {
      models: [
        { key: "fast-chat", label: "Fast chat", model: "openai/gpt-4o-mini", marginPct: 30 },
        { key: "smart-chat", label: "Smart chat", model: "anthropic/claude-sonnet-5", marginPct: 40 },
      ],
    },
    assistant: { models: [] },
    imageDescribe: { models: [] },
    imageGenerate: { models: [] },
    translate: { models: [] },
  },
  quota: { monthlyUsd: 10 },
};

test("effectiveModel: a stored alias key becomes its OpenRouter model id", () => {
  assert.equal(effectiveModel(cfg, "chatAgent", "smart-chat", LEGACY_DEFAULT), "anthropic/claude-sonnet-5");
});

test("effectiveModel: a legacy raw model id keeps working (no data migration)", () => {
  assert.equal(
    effectiveModel(cfg, "chatAgent", "anthropic/claude-sonnet-5", LEGACY_DEFAULT),
    "anthropic/claude-sonnet-5",
  );
});

test("effectiveModel: an uncurated stored value falls back to the purpose default", () => {
  assert.equal(effectiveModel(cfg, "chatAgent", "openai/retired-model", LEGACY_DEFAULT), "openai/gpt-4o-mini");
  assert.equal(effectiveModel(cfg, "chatAgent", null, LEGACY_DEFAULT), "openai/gpt-4o-mini");
});

test("effectiveModel: no curated config keeps the legacy stored id (pre-curation behaviour)", () => {
  assert.equal(effectiveModel(null, "chatAgent", "openai/legacy-pick", LEGACY_DEFAULT), "openai/legacy-pick");
  // Purpose curated nowhere → same pre-curation path even with a config present.
  assert.equal(effectiveModel(cfg, "translate", "openai/legacy-pick", LEGACY_DEFAULT), "openai/legacy-pick");
});

test("effectiveModel: no curated config and nothing stored falls back to the legacy default", () => {
  assert.equal(effectiveModel(null, "chatAgent", null, LEGACY_DEFAULT), LEGACY_DEFAULT);
  assert.equal(effectiveModel(cfg, "translate", "   ", LEGACY_DEFAULT), LEGACY_DEFAULT);
});
