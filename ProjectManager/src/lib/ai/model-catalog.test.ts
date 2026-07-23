import assert from "node:assert/strict";
import { test } from "node:test";

import {
  catalogModalities,
  filterByModalities,
  filterByOutputModalities,
  filterCatalog,
  groupByProvider,
  parseModelCatalog,
  pricePerMillion,
  type CatalogModel,
} from "./model-catalog.ts";

const apiJson = {
  data: [
    {
      id: "openai/gpt-4o-mini",
      name: "OpenAI: GPT-4o mini",
      pricing: { prompt: "0.00000015", completion: "0.0000006" },
      supported_parameters: ["tools", "temperature"],
      architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
      context_length: 128000,
    },
    {
      // Image-GENERATION model: no tools, but outputs images → kept.
      id: "google/gemini-2.5-flash-image",
      name: "Gemini 2.5 Flash Image",
      pricing: { prompt: "0.0000003", completion: "0.0000025" },
      supported_parameters: ["temperature"],
      architecture: { input_modalities: ["text", "image"], output_modalities: ["image", "text"] },
    },
    {
      // Neither tools nor image output → dropped.
      id: "meta/chat-only",
      supported_parameters: ["temperature"],
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
    },
    { name: "junk entry with no id" },
  ],
};

test("parseModelCatalog: keeps tool-callers and image generators, drops the rest", () => {
  const models = parseModelCatalog(apiJson);
  assert.deepEqual(
    models.map((m) => m.id),
    ["openai/gpt-4o-mini", "google/gemini-2.5-flash-image"],
  );
  const mini = models[0];
  assert.equal(mini.label, "OpenAI: GPT-4o mini");
  assert.equal(mini.provider, "openai");
  assert.equal(mini.inputPrice, 0.00000015);
  assert.equal(mini.outputPrice, 0.0000006);
  assert.deepEqual(mini.inputModalities, ["text", "image"]);
  assert.equal(mini.contextLength, 128000);
  // No context_length on the second entry → null, not undefined-crash.
  assert.equal(models[1].contextLength, null);
});

test("parseModelCatalog: junk payloads parse to an empty catalog", () => {
  assert.deepEqual(parseModelCatalog(null), []);
  assert.deepEqual(parseModelCatalog({ data: "nope" }), []);
  assert.deepEqual(parseModelCatalog(42), []);
});

const catalog: CatalogModel[] = parseModelCatalog(apiJson);

test("filterCatalog matches id, label, and provider case-insensitively", () => {
  assert.equal(filterCatalog(catalog, "GEMINI").length, 1);
  assert.equal(filterCatalog(catalog, "openai/gpt").length, 1);
  assert.equal(filterCatalog(catalog, "").length, 2);
  assert.equal(filterCatalog(catalog, "zzz").length, 0);
});

test("modality filters AND their requirements", () => {
  assert.equal(filterByModalities(catalog, ["image"]).length, 2);
  assert.equal(filterByOutputModalities(catalog, ["image"]).length, 1);
  assert.equal(filterByOutputModalities(catalog, ["image"])[0].id, "google/gemini-2.5-flash-image");
});

test("groupByProvider sorts groups A→Z and models low→high price", () => {
  const groups = groupByProvider(catalog);
  assert.deepEqual(groups.map((g) => g.provider), ["google", "openai"]);
});

test("catalogModalities lists distinct input modalities in stable order", () => {
  assert.deepEqual(catalogModalities(catalog), ["text", "image"]);
});

test("pricePerMillion renders USD/token as USD per 1M tokens", () => {
  assert.equal(pricePerMillion(0.00000015), "0.15");
  assert.equal(pricePerMillion(null), null);
});
