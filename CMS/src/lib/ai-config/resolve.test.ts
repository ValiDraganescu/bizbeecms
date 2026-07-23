import test from "node:test";
import assert from "node:assert/strict";
import { resolveModelForPurpose, marginPctForModel } from "./resolve.ts";
import type { AiConfig } from "./types.ts";

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

test("resolveModelForPurpose: alias key match wins", () => {
  assert.equal(resolveModelForPurpose(cfg, "chatAgent", "smart-chat")?.model, "anthropic/claude-sonnet-5");
});

test("resolveModelForPurpose: legacy raw model id matches its entry", () => {
  assert.equal(resolveModelForPurpose(cfg, "chatAgent", "anthropic/claude-sonnet-5")?.key, "smart-chat");
});

test("resolveModelForPurpose: unknown value falls back to the purpose default (first entry)", () => {
  assert.equal(resolveModelForPurpose(cfg, "chatAgent", "no-such-model")?.key, "fast-chat");
});

test("resolveModelForPurpose: missing stored value resolves to the default", () => {
  assert.equal(resolveModelForPurpose(cfg, "chatAgent", null)?.key, "fast-chat");
  assert.equal(resolveModelForPurpose(cfg, "chatAgent")?.key, "fast-chat");
});

test("resolveModelForPurpose: empty purpose list or null config resolves to null", () => {
  assert.equal(resolveModelForPurpose(cfg, "translate", "anything"), null);
  assert.equal(resolveModelForPurpose(null, "chatAgent", "fast-chat"), null);
});

test("marginPctForModel: matched entry's margin", () => {
  assert.equal(marginPctForModel(cfg, "chatAgent", "smart-chat"), 40);
  assert.equal(marginPctForModel(cfg, "chatAgent", "anthropic/claude-sonnet-5"), 40);
});

test("marginPctForModel: uncurated model gets the purpose-default margin", () => {
  assert.equal(marginPctForModel(cfg, "chatAgent", "mystery/model"), 30);
});

test("marginPctForModel: empty list or null config yields 0", () => {
  assert.equal(marginPctForModel(cfg, "translate", "openai/gpt-4o-mini"), 0);
  assert.equal(marginPctForModel(null, "chatAgent", "fast-chat"), 0);
});

test("marginPctForModel: negative or non-finite margins clamp to 0", () => {
  const bad: AiConfig = {
    ...cfg,
    purposes: {
      ...cfg.purposes,
      assistant: { models: [{ key: "x", label: "X", model: "m/x", marginPct: -5 }] },
    },
  };
  assert.equal(marginPctForModel(bad, "assistant", "x"), 0);
});
