/**
 * Regression tests for the model-picker catalog coercion (ai-widget-ux — BUG [P1]).
 *
 * The picker crashed with "Cannot read properties of undefined (reading 'map')"
 * when `/api/chat/models` returned models from a D1 CACHE row written by an
 * OLDER bundle — rows missing `inputModalities` (and possibly the price fields).
 * `coerceCatalog` heals any such wire shape into render-safe `CatalogModel[]`,
 * so the picker never `.map`s `undefined`.
 *
 * Run: node --test scripts/catalog-coerce.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { coerceCatalog, coerceCatalogModel } from "../src/lib/chat/catalog-coerce.ts";

test("OLD cached row missing inputModalities → defaults to ['text'] (the crash)", () => {
  // Exactly the shape an older bundle would have cached: no inputModalities.
  const old = [{ id: "openai/gpt-4o-mini", label: "GPT-4o mini", provider: "openai" }];
  const out = coerceCatalog(old);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].inputModalities, ["text"]);
  // The renderer does `m.inputModalities.map(...)` — must not throw.
  assert.doesNotThrow(() => out[0].inputModalities.map((m) => m));
});

test("missing price fields backfill to null", () => {
  const [m] = coerceCatalog([{ id: "a/b" }]);
  assert.equal(m.price, null);
  assert.equal(m.inputPrice, null);
  assert.equal(m.outputPrice, null);
});

test("price/inputPrice cross-fill when only one is present", () => {
  const [a] = coerceCatalog([{ id: "a/b", price: 0.001 }]);
  assert.equal(a.inputPrice, 0.001);
  const [b] = coerceCatalog([{ id: "c/d", inputPrice: 0.002 }]);
  assert.equal(b.price, 0.002);
});

test("label/provider backfill from id when absent", () => {
  const [m] = coerceCatalogModel({ id: "anthropic/claude-3.5-sonnet" })
    ? [coerceCatalogModel({ id: "anthropic/claude-3.5-sonnet" })]
    : [];
  assert.equal(m.provider, "anthropic");
  assert.equal(m.label, "claude-3.5-sonnet");
});

test("junk modalities filtered; non-array → ['text']", () => {
  assert.deepEqual(coerceCatalog([{ id: "a/b", inputModalities: ["image", "bogus", 42] }])[0].inputModalities, ["image"]);
  assert.deepEqual(coerceCatalog([{ id: "a/b", inputModalities: "image" }])[0].inputModalities, ["text"]);
  assert.deepEqual(coerceCatalog([{ id: "a/b", inputModalities: [] }])[0].inputModalities, ["text"]);
});

test("drops junk entries (no id / not an object); non-array input → []", () => {
  assert.deepEqual(coerceCatalog([{ name: "no id" }, null, 5, { id: "" }]), []);
  assert.deepEqual(coerceCatalog(undefined), []);
  assert.deepEqual(coerceCatalog(null), []);
  assert.deepEqual(coerceCatalog("nope"), []);
  assert.equal(coerceCatalogModel(null), null);
  assert.equal(coerceCatalogModel({ id: 42 }), null);
});

test("a fully-formed modern row round-trips unchanged", () => {
  const modern = {
    id: "google/gemini-flash-1.5",
    label: "Gemini Flash 1.5",
    provider: "google",
    price: 0.00000015,
    inputPrice: 0.00000015,
    outputPrice: 0.0000006,
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    contextLength: 1000000,
  };
  assert.deepEqual(coerceCatalog([modern])[0], modern);
});
