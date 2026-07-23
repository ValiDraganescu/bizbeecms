import test from "node:test";
import assert from "node:assert/strict";
import {
  aliasCatalog,
  matchAlias,
  projectAliasOptions,
  selectValueFor,
  withMargin,
  type AliasOption,
} from "./alias-options.ts";
import type { CatalogModel } from "../chat/models.ts";

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

test("withMargin: adjusts a per-token price, clamps negatives, keeps null null", () => {
  assert.equal(withMargin(0.000001, 30), 0.0000013);
  assert.equal(withMargin(0.000001, 0), 0.000001);
  assert.equal(withMargin(0.000001, -50), 0.000001); // negative margin clamps to 0
  assert.equal(withMargin(null, 30), null);
  assert.equal(withMargin(undefined, 30), null);
  assert.equal(withMargin(Number.NaN, 30), null);
});

const catalog: CatalogModel[] = [
  {
    id: "openai/gpt-4o-mini",
    label: "GPT-4o mini",
    provider: "openai",
    price: 0.000001,
    inputPrice: 0.000001,
    outputPrice: 0.000002,
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    contextLength: 128_000,
  },
];

test("projectAliasOptions: joins the catalog and applies the alias margin to both prices", () => {
  const out = projectAliasOptions(
    [{ key: "standard", label: "Standard", model: "openai/gpt-4o-mini", marginPct: 50 }],
    catalog,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].inputPrice, 0.0000015);
  assert.equal(out[0].outputPrice, 0.000003);
  assert.deepEqual(out[0].inputModalities, ["text", "image"]);
  assert.equal(out[0].contextLength, 128_000);
});

test("projectAliasOptions: a model missing from the catalog keeps the alias, priceless", () => {
  const out = projectAliasOptions(
    [{ key: "retired", label: "Retired", model: "openai/gone", marginPct: 30 }],
    catalog,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].inputPrice, null);
  assert.equal(out[0].outputPrice, null);
  assert.deepEqual(out[0].inputModalities, ["text"]);
});

test("aliasCatalog: the alias key becomes the entry id and the provider comes from the model id", () => {
  const opts: AliasOption[] = [
    {
      key: "smart-chat",
      label: "Smart chat",
      model: "anthropic/claude-sonnet-5",
      inputPrice: 0.000003,
      outputPrice: 0.000015,
      inputModalities: ["text", "image"],
      outputModalities: ["text"],
      contextLength: 200_000,
    },
    { key: "bare", label: "Bare", model: "openai/gpt-4o-mini" },
  ];
  const cat = aliasCatalog(opts);
  assert.equal(cat[0].id, "smart-chat");
  assert.equal(cat[0].provider, "anthropic");
  assert.equal(cat[0].price, 0.000003); // sort key = adjusted input price
  assert.equal(cat[0].outputPrice, 0.000015);
  // Absent join fields default to render-safe values.
  assert.equal(cat[1].inputPrice, null);
  assert.deepEqual(cat[1].inputModalities, ["text"]);
  assert.equal(cat[1].contextLength, null);
});
