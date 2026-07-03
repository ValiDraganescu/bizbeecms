/**
 * Tests for the list_assets AI tool (M2 D1 loop-closer).
 * Dep-free node --test; imports the pure .ts module via native type-stripping.
 * Limit/offset coercion moved to the shared paging helper (paging.test.ts);
 * here we lock the schema + the pure row shaping.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  LIST_ASSETS_TOOL,
  formatAssetList,
} from "../src/lib/chat/list-assets-tool.ts";

// ── tool schema ───────────────────────────────────────────────────────────────
test("LIST_ASSETS_TOOL: well-formed function schema, no required args, paged", () => {
  assert.equal(LIST_ASSETS_TOOL.type, "function");
  assert.equal(LIST_ASSETS_TOOL.function.name, "list_assets");
  assert.deepEqual(LIST_ASSETS_TOOL.function.parameters.required, []);
  assert.ok(LIST_ASSETS_TOOL.function.parameters.properties.limit);
  assert.ok(LIST_ASSETS_TOOL.function.parameters.properties.offset);
});

// ── formatAssetList ───────────────────────────────────────────────────────────
const ROWS = [
  { key: "assets/logo_1_ab.png", filename: "logo.png", contentType: "image/png", size: 1234 },
  { key: "assets/hero_2_cd.jpg", filename: "hero.jpg", contentType: "image/jpeg", size: 5678 },
];

test("formatAssetList: maps rows to /media/<key> URLs + metadata", () => {
  const out = formatAssetList(ROWS);
  assert.deepEqual(out[0], {
    url: "/media/assets/logo_1_ab.png",
    filename: "logo.png",
    contentType: "image/png",
    size: 1234,
  });
  assert.equal(out[1].url, "/media/assets/hero_2_cd.jpg");
  assert.equal(out.length, 2); // shapes ALL rows; paging is the caller's job
  assert.equal(formatAssetList([]).length, 0);
});
