import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_CONFIG_MAX_AGE_MS,
  isAiConfigFresh,
  parseAiConfig,
  parseAiConfigCache,
} from "./parse.ts";
import { AI_PURPOSES } from "./types.ts";

/** A minimal well-formed Contract-A body; `over` patches one field at a time. */
function body(over: Record<string, unknown> = {}) {
  return {
    version: 1,
    purposes: {
      chatAgent: {
        models: [
          { key: "fast-chat", label: "Fast chat", model: "openai/gpt-4o-mini", marginPct: 30 },
        ],
      },
      assistant: { models: [] },
      imageDescribe: { models: [] },
      imageGenerate: { models: [] },
      translate: { models: [] },
    },
    quota: { monthlyUsd: 10 },
    ...over,
  };
}

test("parseAiConfig: accepts a Contract-A body and keeps entry order", () => {
  const json = body({
    purposes: {
      ...body().purposes,
      assistant: {
        models: [
          { key: "a", label: "A", model: "m/a", marginPct: 0 },
          { key: "b", label: "B", model: "m/b", marginPct: 30 },
        ],
      },
    },
  });
  const cfg = parseAiConfig(json);
  assert.ok(cfg);
  assert.equal(cfg.version, 1);
  assert.equal(cfg.quota.monthlyUsd, 10);
  assert.deepEqual(
    cfg.purposes.assistant.models.map((m) => m.key),
    ["a", "b"],
  );
  assert.deepEqual(cfg.purposes.chatAgent.models[0], {
    key: "fast-chat",
    label: "Fast chat",
    model: "openai/gpt-4o-mini",
    marginPct: 30,
  });
});

test("parseAiConfig: tolerates extra fields, on the body and on entries", () => {
  const json = body({ generatedAt: "2026-07-23", extra: { nested: true } }) as Record<
    string,
    unknown
  >;
  (json.purposes as Record<string, { models: Record<string, unknown>[] }>).chatAgent.models[0].note =
    "future field";
  const cfg = parseAiConfig(json);
  assert.ok(cfg);
  // Extra keys are dropped, not carried through.
  assert.deepEqual(Object.keys(cfg).sort(), ["purposes", "quota", "version"]);
  assert.deepEqual(Object.keys(cfg.purposes.chatAgent.models[0]).sort(), [
    "key",
    "label",
    "marginPct",
    "model",
  ]);
});

test("parseAiConfig: null quota means 'no quota'", () => {
  assert.equal(parseAiConfig(body({ quota: { monthlyUsd: null } }))?.quota.monthlyUsd, null);
});

test("parseAiConfig: every purpose key must be present", () => {
  for (const purpose of AI_PURPOSES) {
    const purposes = { ...body().purposes } as Record<string, unknown>;
    delete purposes[purpose];
    assert.equal(parseAiConfig(body({ purposes })), null, `missing ${purpose}`);
  }
});

test("parseAiConfig: rejects wrong-typed essentials", () => {
  const bad: Array<[string, unknown]> = [
    ["not an object", "nope"],
    ["null", null],
    ["array", []],
    ["wrong version", body({ version: 2 })],
    ["missing purposes", body({ purposes: undefined })],
    ["purpose is not an object", body({ purposes: { ...body().purposes, translate: [] } })],
    ["models is not an array", body({ purposes: { ...body().purposes, translate: { models: {} } } })],
    ["missing quota", body({ quota: undefined })],
    ["quota not a number", body({ quota: { monthlyUsd: "10" } })],
    ["quota NaN", body({ quota: { monthlyUsd: Number.NaN } })],
  ];
  for (const [name, json] of bad) {
    assert.equal(parseAiConfig(json), null, name);
  }
});

test("parseAiConfig: rejects the whole config when one entry is malformed", () => {
  const malformed: Array<[string, unknown]> = [
    ["missing key", { label: "A", model: "m/a", marginPct: 0 }],
    ["empty key", { key: "  ", label: "A", model: "m/a", marginPct: 0 }],
    ["missing label", { key: "a", model: "m/a", marginPct: 0 }],
    ["missing model", { key: "a", label: "A", marginPct: 0 }],
    ["model not a string", { key: "a", label: "A", model: 7, marginPct: 0 }],
    ["missing marginPct", { key: "a", label: "A", model: "m/a" }],
    ["marginPct as string", { key: "a", label: "A", model: "m/a", marginPct: "30" }],
    ["negative marginPct", { key: "a", label: "A", model: "m/a", marginPct: -1 }],
    ["entry is not an object", "a"],
  ];
  for (const [name, entry] of malformed) {
    const json = body({
      purposes: { ...body().purposes, assistant: { models: [entry] } },
    });
    assert.equal(parseAiConfig(json), null, name);
  }
});

test("parseAiConfigCache: round-trips a stored row", () => {
  const stored = JSON.parse(JSON.stringify({ fetchedAt: 1_700_000_000_000, config: body() }));
  const cache = parseAiConfigCache(stored);
  assert.ok(cache);
  assert.equal(cache.fetchedAt, 1_700_000_000_000);
  assert.equal(cache.config.purposes.chatAgent.models[0].key, "fast-chat");
});

test("parseAiConfigCache: rejects a bad stamp or a bad config", () => {
  assert.equal(parseAiConfigCache({ config: body() }), null);
  assert.equal(parseAiConfigCache({ fetchedAt: "yesterday", config: body() }), null);
  assert.equal(parseAiConfigCache({ fetchedAt: 1, config: { version: 2 } }), null);
  assert.equal(parseAiConfigCache(null), null);
});

test("isAiConfigFresh: fresh below the TTL, stale at or beyond it", () => {
  const now = 1_700_000_000_000;
  assert.equal(isAiConfigFresh(now, now), true);
  assert.equal(isAiConfigFresh(now - AI_CONFIG_MAX_AGE_MS + 1, now), true);
  assert.equal(isAiConfigFresh(now - AI_CONFIG_MAX_AGE_MS, now), false);
  assert.equal(isAiConfigFresh(now - 24 * 60 * 60 * 1000, now), false);
});

test("isAiConfigFresh: a future stamp counts as stale (clock skew forces a refetch)", () => {
  const now = 1_700_000_000_000;
  assert.equal(isAiConfigFresh(now + 1000, now), false);
});
