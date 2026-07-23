import test from "node:test";
import assert from "node:assert/strict";
import { decideAiMeter } from "./decision.ts";
import type { AiConfig } from "../ai-config/types.ts";

const cfg: AiConfig = {
  version: 1,
  purposes: {
    chatAgent: {
      models: [
        { key: "fast-chat", label: "Fast chat", model: "openai/gpt-4o-mini", marginPct: 30 },
        { key: "smart-chat", label: "Smart chat", model: "anthropic/claude-sonnet-5", marginPct: 50 },
      ],
    },
    assistant: { models: [] },
    imageDescribe: { models: [] },
    imageGenerate: { models: [] },
    translate: { models: [] },
  },
  quota: { monthlyUsd: 10 },
};

test("decideAiMeter: curated margin applies and billable = raw × (1 + margin)", () => {
  assert.deepEqual(decideAiMeter(cfg, "chatAgent", "smart-chat", 0.001), {
    marginPct: 50,
    rawNanoUsd: 1_000_000,
    billableNanoUsd: 1_500_000,
  });
});

test("decideAiMeter: null config meters at margin 0 — billable equals raw, never a guess", () => {
  assert.deepEqual(decideAiMeter(null, "chatAgent", "fast-chat", 0.002), {
    marginPct: 0,
    rawNanoUsd: 2_000_000,
    billableNanoUsd: 2_000_000,
  });
});

test("decideAiMeter: uncurated model under a curated purpose gets the purpose-default margin", () => {
  assert.equal(decideAiMeter(cfg, "chatAgent", "mystery/model", 0.001)?.marginPct, 30);
});

test("decideAiMeter: empty purpose list means margin 0", () => {
  const d = decideAiMeter(cfg, "translate", "openai/gpt-4o-mini", 0.001);
  assert.equal(d?.marginPct, 0);
  assert.equal(d?.billableNanoUsd, d?.rawNanoUsd);
});

test("decideAiMeter: absent, zero, negative or garbage cost records nothing", () => {
  assert.equal(decideAiMeter(cfg, "chatAgent", "fast-chat", undefined), null);
  assert.equal(decideAiMeter(cfg, "chatAgent", "fast-chat", 0), null);
  assert.equal(decideAiMeter(cfg, "chatAgent", "fast-chat", -0.5), null);
  assert.equal(decideAiMeter(cfg, "chatAgent", "fast-chat", Number.NaN), null);
  assert.equal(decideAiMeter(cfg, "chatAgent", "fast-chat", Number.POSITIVE_INFINITY), null);
});

test("decideAiMeter: sub-nano cost rounds like the counters do", () => {
  // 1.4 nano-dollars rounds to 1; margin then applies to the USD, not the rounded nano.
  const d = decideAiMeter(cfg, "chatAgent", "fast-chat", 1.4e-9);
  assert.equal(d?.rawNanoUsd, 1);
  assert.equal(d?.billableNanoUsd, Math.round(1.4 * 1.3));
});
