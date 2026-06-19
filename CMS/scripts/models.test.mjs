/**
 * Pure unit tests for the AI model allowlist (ai-assistant goal, Slice 4
 * sub-slice 2 — model picker). The route's `model` field is UNTRUSTED, so
 * `resolveModel` must accept only allowlisted ids and fall back to the default
 * for everything else — never throw, never forward arbitrary strings.
 *
 * Run: node --test scripts/models.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHAT_MODELS,
  DEFAULT_MODEL,
  isKnownModel,
  resolveModel,
  parseModelCatalog,
  groupByProvider,
  sortByPrice,
  filterCatalog,
  providerOf,
} from "../src/lib/chat/models.ts";

test("DEFAULT_MODEL is itself an allowlisted id", () => {
  assert.ok(CHAT_MODELS.some((m) => m.id === DEFAULT_MODEL));
});

test("CHAT_MODELS ids are unique and non-empty", () => {
  const ids = CHAT_MODELS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const m of CHAT_MODELS) {
    assert.equal(typeof m.id, "string");
    assert.ok(m.id.length > 0);
    assert.ok(m.label.length > 0);
  }
});

test("isKnownModel accepts allowlisted ids only", () => {
  for (const m of CHAT_MODELS) assert.equal(isKnownModel(m.id), true);
  assert.equal(isKnownModel("@cf/totally/made-up"), false);
  assert.equal(isKnownModel(""), false);
  assert.equal(isKnownModel(42), false);
  assert.equal(isKnownModel(undefined), false);
  assert.equal(isKnownModel(null), false);
});

test("resolveModel returns allowlisted value, else the default", () => {
  const other = CHAT_MODELS.find((m) => m.id !== DEFAULT_MODEL);
  if (other) assert.equal(resolveModel(other.id), other.id);
  // untrusted / unknown → default (never a throw, never the raw string)
  assert.equal(resolveModel("'; DROP TABLE pages; --"), DEFAULT_MODEL);
  assert.equal(resolveModel("@cf/not/real"), DEFAULT_MODEL);
  assert.equal(resolveModel(undefined), DEFAULT_MODEL);
  assert.equal(resolveModel(null), DEFAULT_MODEL);
  assert.equal(resolveModel(123), DEFAULT_MODEL);
  assert.equal(resolveModel({}), DEFAULT_MODEL);
});

test("resolveModel accepts ids from the dynamic catalog allowlist", () => {
  const allowed = new Set(["@cf/some/new-model", "@cf/another/model"]);
  assert.equal(resolveModel("@cf/some/new-model", allowed), "@cf/some/new-model");
  // unknown even with a catalog → default
  assert.equal(resolveModel("@cf/not/in-catalog", allowed), DEFAULT_MODEL);
  // static ids still pass even with a catalog set supplied
  assert.equal(resolveModel(DEFAULT_MODEL, allowed), DEFAULT_MODEL);
  assert.equal(isKnownModel("@cf/some/new-model", allowed), true);
  assert.equal(isKnownModel("@cf/some/new-model"), false); // no catalog arg
});

test("providerOf extracts the vendor segment of a CF id", () => {
  assert.equal(providerOf("@cf/meta/llama-3.1-8b-instruct"), "meta");
  assert.equal(providerOf("@hf/nousresearch/hermes-2-pro"), "nousresearch");
  assert.equal(providerOf("weird"), "other");
});

// Sample CF list-models payload (the shape the helpers must survive).
const SAMPLE = {
  result: [
    {
      name: "@cf/meta/llama-3.3-70b-instruct",
      description: "strong",
      task: { name: "Text Generation" },
      properties: [
        { property_id: "price", value: [{ unit: "per M input tokens", price: "0.29" }] },
      ],
    },
    {
      name: "@cf/meta/llama-3.1-8b-instruct",
      task: { name: "Text Generation" },
      properties: [
        { property_id: "price", value: [{ unit: "per M input tokens", price: "0.05" }] },
      ],
    },
    {
      name: "@cf/openai/whisper",
      task: { name: "Automatic Speech Recognition" }, // dropped: not text gen
    },
    {
      name: "@cf/old/deprecated-model",
      deprecated: true, // dropped
      task: { name: "Text Generation" },
    },
    {
      name: "@hf/google/gemma-7b",
      task: { name: "Text Generation" },
      properties: [], // no price → sorts last
    },
  ],
};

test("parseModelCatalog extracts id/provider/price; drops deprecated + non-text-gen", () => {
  const cat = parseModelCatalog(SAMPLE);
  const ids = cat.map((m) => m.id);
  assert.ok(ids.includes("@cf/meta/llama-3.3-70b-instruct"));
  assert.ok(ids.includes("@cf/meta/llama-3.1-8b-instruct"));
  assert.ok(ids.includes("@hf/google/gemma-7b"));
  assert.ok(!ids.includes("@cf/openai/whisper")); // not text generation
  assert.ok(!ids.includes("@cf/old/deprecated-model")); // deprecated
  const small = cat.find((m) => m.id === "@cf/meta/llama-3.1-8b-instruct");
  assert.equal(small.provider, "meta");
  assert.equal(small.price, 0.05);
  const noPrice = cat.find((m) => m.id === "@hf/google/gemma-7b");
  assert.equal(noPrice.price, null);
});

test("parseModelCatalog tolerates a bare array (no result wrapper) + junk", () => {
  assert.deepEqual(parseModelCatalog(null), []);
  assert.deepEqual(parseModelCatalog({}), []);
  assert.deepEqual(parseModelCatalog([{ task: { name: "Text Generation" } }]), []); // no name
  const bare = parseModelCatalog([
    { name: "@cf/x/y", task: { name: "Text Generation" } },
  ]);
  assert.equal(bare.length, 1);
});

test("sortByPrice orders LOW→HIGH; null price last", () => {
  const cat = parseModelCatalog(SAMPLE).filter((m) => m.provider === "meta");
  cat.push({ id: "@cf/meta/z", label: "z", provider: "meta", price: null });
  const sorted = sortByPrice(cat);
  assert.equal(sorted[0].price, 0.05);
  assert.equal(sorted[1].price, 0.29);
  assert.equal(sorted[sorted.length - 1].price, null);
});

test("groupByProvider groups + sorts within group + sorts providers", () => {
  const groups = groupByProvider(parseModelCatalog(SAMPLE));
  const providers = groups.map((g) => g.provider);
  assert.deepEqual(providers, ["google", "meta"]); // alpha
  const meta = groups.find((g) => g.provider === "meta");
  assert.equal(meta.models[0].price, 0.05); // cheapest first
});

test("filterCatalog matches id/label/provider; empty query → all", () => {
  const cat = parseModelCatalog(SAMPLE);
  assert.equal(filterCatalog(cat, "").length, cat.length);
  assert.ok(filterCatalog(cat, "llama").every((m) => m.id.includes("llama")));
  assert.ok(filterCatalog(cat, "google").length >= 1); // provider match
  assert.equal(filterCatalog(cat, "zzz-nothing").length, 0);
});
