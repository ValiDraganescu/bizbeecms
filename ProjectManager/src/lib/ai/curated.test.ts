import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AI_PURPOSES,
  SEED_CURATED_PURPOSES,
  aliasKeyFromLabel,
  checkQuotasWithinPool,
  normalizeCuratedPurposes,
  oversellMessage,
  parseCuratedPurposes,
  parsePoolUsd,
  readPoolUsd,
} from "./curated.ts";

test("seed covers every purpose with one 'standard' alias at margin 30", () => {
  assert.deepEqual(Object.keys(SEED_CURATED_PURPOSES).sort(), [...AI_PURPOSES].sort());
  for (const purpose of AI_PURPOSES) {
    const [entry, ...rest] = SEED_CURATED_PURPOSES[purpose].models;
    assert.equal(rest.length, 0);
    assert.equal(entry.key, "standard");
    assert.equal(entry.label, "Standard");
    assert.equal(entry.marginPct, 30);
  }
  assert.equal(SEED_CURATED_PURPOSES.chatAgent.models[0].model, "openai/gpt-4o-mini");
  assert.equal(
    SEED_CURATED_PURPOSES.imageGenerate.models[0].model,
    "google/gemini-2.5-flash-image",
  );
});

test("aliasKeyFromLabel slugifies to [a-z0-9-]", () => {
  assert.equal(aliasKeyFromLabel("Fast chat"), "fast-chat");
  assert.equal(aliasKeyFromLabel("  GPT-4o  mini!! "), "gpt-4o-mini");
  assert.equal(aliasKeyFromLabel("Ökonomisk"), "okonomisk");
  assert.equal(aliasKeyFromLabel("***"), "alias");
  assert.match(aliasKeyFromLabel("x".repeat(80)), /^x{40}$/);
});

test("aliasKeyFromLabel dedupes against existing keys, staying within 40 chars", () => {
  assert.equal(aliasKeyFromLabel("Fast chat", ["fast-chat"]), "fast-chat-2");
  assert.equal(
    aliasKeyFromLabel("Fast chat", ["fast-chat", "fast-chat-2"]),
    "fast-chat-3",
  );
  const long = aliasKeyFromLabel("y".repeat(50), ["y".repeat(40)]);
  assert.equal(long.length, 40);
  assert.equal(long.endsWith("-2"), true);
});

test("normalize always yields all five purposes, even from junk", () => {
  for (const junk of [null, undefined, 42, "nope", {}, { chatAgent: 5 }]) {
    const { purposes, dropped } = normalizeCuratedPurposes(junk);
    assert.deepEqual(Object.keys(purposes).sort(), [...AI_PURPOSES].sort());
    for (const p of AI_PURPOSES) assert.deepEqual(purposes[p].models, []);
    assert.equal(dropped, 0); // nothing was submitted, so nothing was lost
  }
});

test("normalize preserves entry order (first = purpose default)", () => {
  const { purposes, dropped } = normalizeCuratedPurposes({
    chatAgent: {
      models: [
        { key: "cheap", label: "Cheap", model: "a/b", marginPct: 10 },
        { key: "smart", label: "Smart", model: "c/d", marginPct: 50 },
      ],
    },
  });
  assert.deepEqual(
    purposes.chatAgent.models.map((m) => m.key),
    ["cheap", "smart"],
  );
  assert.equal(dropped, 0);
});

test("normalize drops entries with an unusable key or no model, and counts them", () => {
  const { purposes, dropped } = normalizeCuratedPurposes({
    assistant: {
      models: [
        { key: "ok", label: "Ok", model: "a/b", marginPct: 0 },
        { key: "Bad Key!", label: "x", model: "a/b" },
        { key: "nomodel", label: "x", model: "   " },
        { key: "x".repeat(41), label: "x", model: "a/b" },
        "not-an-object",
      ],
    },
  });
  assert.deepEqual(
    purposes.assistant.models.map((m) => m.key),
    ["ok"],
  );
  assert.equal(dropped, 4);
});

test("normalize drops duplicate keys, keeping the first", () => {
  const { purposes, dropped } = normalizeCuratedPurposes({
    translate: {
      models: [
        { key: "dup", label: "First", model: "a/b", marginPct: 5 },
        { key: "DUP", label: "Second", model: "c/d", marginPct: 9 },
      ],
    },
  });
  assert.equal(purposes.translate.models.length, 1);
  assert.equal(purposes.translate.models[0].label, "First");
  assert.equal(dropped, 1);
});

test("normalize repairs a missing label and a bad margin", () => {
  const [entry] = normalizeCuratedPurposes({
    imageGenerate: { models: [{ key: "nano", model: "g/nano", marginPct: -3 }] },
  }).purposes.imageGenerate.models;
  assert.deepEqual(entry, {
    key: "nano",
    label: "nano",
    model: "g/nano",
    marginPct: 0,
  });
});

test("normalize accepts a numeric-string margin", () => {
  const [entry] = normalizeCuratedPurposes({
    chatAgent: { models: [{ key: "k", label: "K", model: "a/b", marginPct: "30" }] },
  }).purposes.chatAgent.models;
  assert.equal(entry.marginPct, 30);
});

test("parseCuratedPurposes: absent/blank/corrupt JSON → null", () => {
  assert.equal(parseCuratedPurposes(null), null);
  assert.equal(parseCuratedPurposes(undefined), null);
  assert.equal(parseCuratedPurposes("  "), null);
  assert.equal(parseCuratedPurposes("{not json"), null);
});

test("parseCuratedPurposes round-trips a stored catalog", () => {
  const stored = JSON.stringify(SEED_CURATED_PURPOSES);
  assert.deepEqual(parseCuratedPurposes(stored), SEED_CURATED_PURPOSES);
});

test("parsePoolUsd accepts numbers and numeric strings", () => {
  assert.equal(parsePoolUsd(250), 250);
  assert.equal(parsePoolUsd("250.5"), 250.5);
  assert.equal(parsePoolUsd(0), 0);
});

test("parsePoolUsd: blank/absent = unset (null), junk = invalid", () => {
  assert.equal(parsePoolUsd(""), null);
  assert.equal(parsePoolUsd("   "), null);
  assert.equal(parsePoolUsd(null), null);
  assert.equal(parsePoolUsd(undefined), null);
  // A typo must NOT read as "no limit" — the write path rejects it.
  assert.equal(parsePoolUsd("abc"), "invalid");
  assert.equal(parsePoolUsd(-5), "invalid");
  assert.equal(parsePoolUsd(Number.NaN), "invalid");
});

test("readPoolUsd degrades a corrupt stored value to unset", () => {
  assert.equal(readPoolUsd("500"), 500);
  assert.equal(readPoolUsd("garbage"), null);
  assert.equal(readPoolUsd(""), null);
  assert.equal(readPoolUsd(null), null);
});

test("no oversell: sum within pool passes, null quotas count as 0", () => {
  assert.equal(checkQuotasWithinPool([10, 20, null], 100), null);
  assert.equal(checkQuotasWithinPool([50, 50], 100), null); // exactly the pool
  assert.equal(checkQuotasWithinPool([], 100), null);
});

test("no oversell: exceeding the pool reports the overshoot", () => {
  const over = checkQuotasWithinPool([60, 50, null], 100);
  assert.deepEqual(over, { totalUsd: 110, poolUsd: 100, overUsd: 10 });
  assert.match(oversellMessage(over!), /\$110/);
  assert.match(oversellMessage(over!), /\$100/);
});

test("no pool configured → no constraint at all", () => {
  assert.equal(checkQuotasWithinPool([1000, 1000], null), null);
});
