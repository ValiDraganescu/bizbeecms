/**
 * Pure unit tests for the AI model catalog (ai-openrouter goal — catalog swap).
 * The catalog is now OpenRouter (`vendor/model` ids, `{ data: [...] }` payload).
 * The route's `model` field is UNTRUSTED, so `resolveModel` must accept only
 * allowlisted ids and fall back to the default for everything else — never
 * throw, never forward arbitrary strings.
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
  filterByModalities,
  catalogModalities,
  providerOf,
  pricePerMillion,
  parseInputModalities,
  parseOutputModalities,
  filterByOutputModalities,
  outputCapFor,
  MAX_OUTPUT_CEILING,
  MIN_OUTPUT_FLOOR,
  DEFAULT_TRANSLATE_MODEL,
  resolveTranslateModel,
  DEFAULT_IMAGE_GEN_MODEL,
  resolveImageGenModel,
} from "../src/lib/chat/models.ts";

test("resolveTranslateModel: allowlisted id kept; untrusted/unknown → default", () => {
  const allowed = new Set(["openai/gpt-4o-mini", "anthropic/claude-3.5"]);
  assert.equal(resolveTranslateModel("anthropic/claude-3.5", allowed), "anthropic/claude-3.5");
  assert.equal(resolveTranslateModel("evil/model", allowed), DEFAULT_TRANSLATE_MODEL);
  assert.equal(resolveTranslateModel("", allowed), DEFAULT_TRANSLATE_MODEL);
  assert.equal(resolveTranslateModel(123, allowed), DEFAULT_TRANSLATE_MODEL);
  // No allowlist → can't trust anything → default.
  assert.equal(resolveTranslateModel("openai/gpt-4o-mini"), DEFAULT_TRANSLATE_MODEL);
});

const CAT = [
  { id: "a/x", label: "X", provider: "a", inputModalities: ["text"] },
  { id: "a/y", label: "Y", provider: "a", inputModalities: ["text", "image"] },
  { id: "b/z", label: "Z", provider: "b", inputModalities: ["text", "image", "file"] },
  { id: "b/w", label: "W", provider: "b" }, // no modalities → text-only
];

test("filterByModalities: empty required keeps everything", () => {
  assert.equal(filterByModalities(CAT, []).length, 4);
});

test("filterByModalities: AND — a model must have EVERY selected modality", () => {
  assert.deepEqual(filterByModalities(CAT, ["image"]).map((m) => m.id), ["a/y", "b/z"]);
  assert.deepEqual(filterByModalities(CAT, ["image", "file"]).map((m) => m.id), ["b/z"]);
});

test("filterByModalities: a model with no declared modalities is text-only", () => {
  assert.deepEqual(filterByModalities(CAT, ["text"]).map((m) => m.id), ["a/x", "a/y", "b/z", "b/w"]);
  assert.equal(filterByModalities(CAT, ["image"]).some((m) => m.id === "b/w"), false);
});

test("catalogModalities: distinct, ordered text→image→file→audio→video", () => {
  assert.deepEqual(catalogModalities(CAT), ["text", "image", "file"]);
});

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

test("DEFAULT_MODEL is an OpenRouter-style provider-prefixed id", () => {
  assert.ok(!DEFAULT_MODEL.startsWith("@cf/"), "should not be a CF id");
  assert.ok(DEFAULT_MODEL.includes("/"), "should be vendor/model");
});

test("resolveModel returns allowlisted value, else the default", () => {
  const other = CHAT_MODELS.find((m) => m.id !== DEFAULT_MODEL);
  if (other) assert.equal(resolveModel(other.id), other.id);
  // untrusted / unknown → default (never a throw, never the raw string)
  assert.equal(resolveModel("'; DROP TABLE pages; --"), DEFAULT_MODEL);
  assert.equal(resolveModel("vendor/not-real"), DEFAULT_MODEL);
  assert.equal(resolveModel(undefined), DEFAULT_MODEL);
  assert.equal(resolveModel(null), DEFAULT_MODEL);
  assert.equal(resolveModel(123), DEFAULT_MODEL);
  assert.equal(resolveModel({}), DEFAULT_MODEL);
});

test("resolveModel accepts ids from the dynamic catalog allowlist", () => {
  const allowed = new Set(["mistralai/mistral-large", "x-ai/grok-beta"]);
  assert.equal(resolveModel("mistralai/mistral-large", allowed), "mistralai/mistral-large");
  // unknown even with a catalog → default
  assert.equal(resolveModel("vendor/not-in-catalog", allowed), DEFAULT_MODEL);
  // static ids still pass even with a catalog set supplied
  assert.equal(resolveModel(DEFAULT_MODEL, allowed), DEFAULT_MODEL);
  assert.equal(isKnownModel("mistralai/mistral-large", allowed), true);
  assert.equal(isKnownModel("mistralai/mistral-large"), false); // no catalog arg
});

test("providerOf extracts the vendor segment of an OpenRouter id", () => {
  assert.equal(providerOf("openai/gpt-4o-mini"), "openai");
  assert.equal(providerOf("anthropic/claude-3.5-sonnet"), "anthropic");
  assert.equal(providerOf("weird"), "weird"); // single-segment id → itself
  assert.equal(providerOf("/leading-slash"), "other"); // empty vendor → other
});

// Sample OpenRouter /api/v1/models payload (the shape the helpers must survive).
const SAMPLE = {
  data: [
    {
      id: "anthropic/claude-3.5-sonnet",
      name: "Anthropic: Claude 3.5 Sonnet",
      pricing: { prompt: "0.000003", completion: "0.000015" },
      supported_parameters: ["tools", "temperature"],
      architecture: { input_modalities: ["text", "image"] },
    },
    {
      id: "openai/gpt-4o-mini",
      name: "OpenAI: GPT-4o-mini",
      pricing: { prompt: "0.00000015", completion: "0.0000006" },
      supported_parameters: ["tools"],
    },
    {
      id: "google/gemini-flash-1.5",
      name: "Google: Gemini Flash 1.5",
      pricing: {}, // no prompt price → sorts last
      supported_parameters: ["tools"],
    },
    {
      // not tool-capable AND text-output → filtered out of the catalog
      id: "meta/no-tools-model",
      name: "No Tools Model",
      pricing: { prompt: "0.0000001" },
      supported_parameters: ["temperature"],
    },
    {
      // not tool-capable, but OUTPUTS images → KEPT (the image-gen picker needs it)
      id: "google/gemini-2.5-flash-image-preview",
      name: "Gemini 2.5 Flash Image",
      pricing: { prompt: "0.0000003" },
      supported_parameters: ["temperature"],
      architecture: { input_modalities: ["text"], output_modalities: ["text", "image"] },
    },
    {
      // junk entry: no id → dropped
      name: "Mystery model",
      pricing: { prompt: "0.001" },
      supported_parameters: ["tools"],
    },
  ],
};

test("parseModelCatalog extracts id/name/provider/price from the OpenRouter shape", () => {
  const cat = parseModelCatalog(SAMPLE);
  const ids = cat.map((m) => m.id);
  assert.ok(ids.includes("anthropic/claude-3.5-sonnet"));
  assert.ok(ids.includes("openai/gpt-4o-mini"));
  assert.ok(ids.includes("google/gemini-flash-1.5"));
  assert.equal(cat.length, 4); // junk (no id) + text-only no-tools model dropped
  assert.ok(!ids.includes("meta/no-tools-model")); // filtered: no "tools", text output
  // A non-tool model that OUTPUTS images is KEPT (the image-gen picker needs it).
  assert.ok(ids.includes("google/gemini-2.5-flash-image-preview"));
  const small = cat.find((m) => m.id === "openai/gpt-4o-mini");
  assert.equal(small.provider, "openai");
  assert.equal(small.label, "OpenAI: GPT-4o-mini");
  assert.equal(small.price, 0.00000015);
  assert.equal(small.inputPrice, 0.00000015);
  assert.equal(small.outputPrice, 0.0000006); // pricing.completion
  const noPrice = cat.find((m) => m.id === "google/gemini-flash-1.5");
  assert.equal(noPrice.price, null);
  assert.equal(noPrice.inputPrice, null);
  assert.equal(noPrice.outputPrice, null);
  // architecture.input_modalities is parsed; default ["text"] when absent.
  const claude = cat.find((m) => m.id === "anthropic/claude-3.5-sonnet");
  assert.deepEqual(claude.inputModalities, ["text", "image"]);
  assert.deepEqual(small.inputModalities, ["text"]); // no architecture → default
});

test("parseInputModalities reads known modalities, defaults to ['text']", () => {
  assert.deepEqual(parseInputModalities({ architecture: { input_modalities: ["text", "image"] } }), [
    "text",
    "image",
  ]);
  assert.deepEqual(parseInputModalities({}), ["text"]); // absent → default
  assert.deepEqual(parseInputModalities({ architecture: { input_modalities: [] } }), ["text"]); // empty → default
  assert.deepEqual(parseInputModalities({ architecture: { input_modalities: "image" } }), ["text"]); // not an array → default
  // junk modalities filtered; an empty result falls back to ["text"]
  assert.deepEqual(parseInputModalities({ architecture: { input_modalities: ["bogus", 42] } }), [
    "text",
  ]);
  assert.deepEqual(
    parseInputModalities({ architecture: { input_modalities: ["file", "junk", "audio"] } }),
    ["file", "audio"],
  );
});

test("parseOutputModalities reads known modalities, defaults to ['text']", () => {
  assert.deepEqual(
    parseOutputModalities({ architecture: { output_modalities: ["text", "image"] } }),
    ["text", "image"],
  );
  assert.deepEqual(parseOutputModalities({}), ["text"]); // absent → default
  assert.deepEqual(parseOutputModalities({ architecture: { output_modalities: [] } }), ["text"]);
  assert.deepEqual(parseOutputModalities({ architecture: { output_modalities: "image" } }), ["text"]);
});

test("filterByOutputModalities keeps only image-OUTPUT models", () => {
  const cat = parseModelCatalog(SAMPLE);
  const gen = filterByOutputModalities(cat, ["image"]);
  assert.deepEqual(gen.map((m) => m.id), ["google/gemini-2.5-flash-image-preview"]);
  assert.deepEqual(filterByOutputModalities(cat, []), cat); // empty required → all
});

test("resolveImageGenModel: allowlisted id kept; untrusted/unknown → default", () => {
  const allowed = new Set(["google/gemini-2.5-flash-image-preview"]);
  assert.equal(resolveImageGenModel("google/gemini-2.5-flash-image-preview", allowed), "google/gemini-2.5-flash-image-preview");
  assert.equal(resolveImageGenModel("openai/gpt-4o-mini", allowed), DEFAULT_IMAGE_GEN_MODEL); // not image-output
  assert.equal(resolveImageGenModel(undefined, allowed), DEFAULT_IMAGE_GEN_MODEL);
  assert.equal(resolveImageGenModel("anything", undefined), DEFAULT_IMAGE_GEN_MODEL);
});

test("outputCapFor: scales output to a quarter of the window, clamped to the ceiling", () => {
  // 128k window → quarter is 32k = exactly the ceiling.
  assert.equal(outputCapFor(128_000), MAX_OUTPUT_CEILING);
  // 2M window (grok-4.20) → quarter is huge → clamped to the ceiling.
  assert.equal(outputCapFor(2_000_000), MAX_OUTPUT_CEILING);
  // 40k window → quarter is 10k, under the ceiling → used as-is.
  assert.equal(outputCapFor(40_000), 10_000);
});

test("outputCapFor: a tiny window gets the floor, not a uselessly small cap", () => {
  assert.equal(outputCapFor(2_000), MIN_OUTPUT_FLOOR); // quarter=500 < floor
});

test("outputCapFor: unknown/invalid window → undefined (adapter default applies)", () => {
  assert.equal(outputCapFor(null), undefined);
  assert.equal(outputCapFor(undefined), undefined);
  assert.equal(outputCapFor(0), undefined);
  assert.equal(outputCapFor(-5), undefined);
});

test("pricePerMillion formats USD/token as USD per 1M tokens, 2dp", () => {
  assert.equal(pricePerMillion(0.00000015), "0.15"); // 0.15 / 1M
  assert.equal(pricePerMillion(0.0000006), "0.60");
  assert.equal(pricePerMillion(0.000003), "3.00");
  assert.equal(pricePerMillion(0), "0.00");
  assert.equal(pricePerMillion(null), null); // no price → no string
});

test("parseModelCatalog tolerates a bare array (no data wrapper) + junk", () => {
  assert.deepEqual(parseModelCatalog(null), []);
  assert.deepEqual(parseModelCatalog({}), []);
  assert.deepEqual(parseModelCatalog([{ name: "no id" }]), []); // no id
  const bare = parseModelCatalog([{ id: "x/y", supported_parameters: ["tools"] }]);
  assert.equal(bare.length, 1);
  assert.equal(bare[0].label, "y"); // no name → tail of id
});

test("parseModelCatalog keeps only tool-call-capable models", () => {
  const cat = parseModelCatalog([
    { id: "a/with-tools", supported_parameters: ["tools", "temperature"] },
    { id: "b/no-tools", supported_parameters: ["temperature"] },
    { id: "c/missing-params" }, // no supported_parameters → dropped
    { id: "d/empty-params", supported_parameters: [] }, // dropped
    { id: "e/junk-params", supported_parameters: "tools" }, // string, not array → dropped
  ]);
  assert.deepEqual(
    cat.map((m) => m.id),
    ["a/with-tools"],
  );
});

test("sortByPrice orders LOW→HIGH; null price last", () => {
  const cat = parseModelCatalog(SAMPLE);
  const sorted = sortByPrice(cat);
  assert.equal(sorted[0].price, 0.00000015); // gpt-4o-mini cheapest
  assert.equal(sorted[1].price, 0.0000003); // gemini image (next cheapest)
  assert.equal(sorted[2].price, 0.000003); // claude
  assert.equal(sorted[sorted.length - 1].price, null); // gemini-flash (no price) last
});

test("groupByProvider groups + sorts within group + sorts providers", () => {
  const groups = groupByProvider(parseModelCatalog(SAMPLE));
  const providers = groups.map((g) => g.provider);
  assert.deepEqual(providers, ["anthropic", "google", "openai"]); // alpha
  const openai = groups.find((g) => g.provider === "openai");
  assert.equal(openai.models[0].id, "openai/gpt-4o-mini");
});

test("filterCatalog matches id/label/provider; empty query → all", () => {
  const cat = parseModelCatalog(SAMPLE);
  assert.equal(filterCatalog(cat, "").length, cat.length);
  assert.ok(filterCatalog(cat, "gpt").every((m) => m.id.includes("gpt")));
  assert.ok(filterCatalog(cat, "google").length >= 1); // provider match
  assert.equal(filterCatalog(cat, "zzz-nothing").length, 0);
});
