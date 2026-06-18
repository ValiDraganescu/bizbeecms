/**
 * Tests for the list_assets AI tool (M2 D1 loop-closer).
 * Dep-free node --test; imports the pure .ts module via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  LIST_ASSETS_TOOL,
  DEFAULT_ASSET_LIMIT,
  MAX_ASSET_LIMIT,
  coerceLimit,
  formatAssetList,
} from "../src/lib/chat/list-assets-tool.ts";

// ── tool schema ───────────────────────────────────────────────────────────────
test("LIST_ASSETS_TOOL: well-formed function schema, no required args", () => {
  assert.equal(LIST_ASSETS_TOOL.type, "function");
  assert.equal(LIST_ASSETS_TOOL.function.name, "list_assets");
  assert.deepEqual(LIST_ASSETS_TOOL.function.parameters.required, []);
  assert.ok(LIST_ASSETS_TOOL.function.parameters.properties.limit);
});

// ── coerceLimit ───────────────────────────────────────────────────────────────
test("coerceLimit: missing/garbage → default", () => {
  for (const a of [undefined, null, {}, { limit: "x" }, { limit: NaN }, { limit: 0 }, { limit: -3 }]) {
    assert.equal(coerceLimit(a), DEFAULT_ASSET_LIMIT, JSON.stringify(a));
  }
});

test("coerceLimit: numeric string is parsed (open models emit numbers as strings)", () => {
  assert.equal(coerceLimit({ limit: "12" }), 12);
});

test("coerceLimit: floored and clamped to MAX", () => {
  assert.equal(coerceLimit({ limit: 7.9 }), 7);
  assert.equal(coerceLimit({ limit: 99999 }), MAX_ASSET_LIMIT);
});

// ── formatAssetList ───────────────────────────────────────────────────────────
const ROWS = [
  { key: "assets/logo_1_ab.png", filename: "logo.png", contentType: "image/png", size: 1234 },
  { key: "assets/hero_2_cd.jpg", filename: "hero.jpg", contentType: "image/jpeg", size: 5678 },
];

test("formatAssetList: maps rows to /media/<key> URLs + metadata", () => {
  const out = formatAssetList(ROWS, 50);
  assert.deepEqual(out[0], {
    url: "/media/assets/logo_1_ab.png",
    filename: "logo.png",
    contentType: "image/png",
    size: 1234,
  });
  assert.equal(out[1].url, "/media/assets/hero_2_cd.jpg");
});

test("formatAssetList: respects limit", () => {
  assert.equal(formatAssetList(ROWS, 1).length, 1);
  assert.equal(formatAssetList([], 50).length, 0);
});
