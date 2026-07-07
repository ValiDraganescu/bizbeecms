/**
 * D1 (R2 assets) regression: the pure media-asset helpers + the `media` i18n
 * namespace key-parity. Dep-free (`node --test scripts/asset.test.mjs`).
 *
 * The R2/D1 access (db/asset-store.ts) and the routes need live bindings (HITL);
 * only the pure validate/key/url logic + catalog parity are offline-checkable.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  ALLOWED_ASSET_TYPES,
  MAX_ASSET_SIZE,
  MAX_ASSET_DIMENSION,
  validateAsset,
  buildAssetKey,
  isValidAssetKey,
  assetUrl,
  assetServeHeaders,
  filenameFromText,
  deliveryFormat,
  parseAssetDimension,
} from "../src/lib/render/asset.ts";

// ── parseAssetDimension ───────────────────────────────────────────────────────
test("parseAssetDimension: accepts sane positive dims (number or numeric string)", () => {
  assert.equal(parseAssetDimension(1200), 1200);
  assert.equal(parseAssetDimension("630"), 630);
  assert.equal(parseAssetDimension(1), 1);
  assert.equal(parseAssetDimension(MAX_ASSET_DIMENSION), MAX_ASSET_DIMENSION);
});

test("parseAssetDimension: floors fractional values", () => {
  assert.equal(parseAssetDimension(1200.9), 1200);
  assert.equal(parseAssetDimension("630.5"), 630);
});

test("parseAssetDimension: rejects bad/out-of-range/absent → null", () => {
  assert.equal(parseAssetDimension(0), null);
  assert.equal(parseAssetDimension(-5), null);
  assert.equal(parseAssetDimension(0.4), null); // floors to 0
  assert.equal(parseAssetDimension(MAX_ASSET_DIMENSION + 1), null);
  assert.equal(parseAssetDimension(NaN), null);
  assert.equal(parseAssetDimension(Infinity), null);
  assert.equal(parseAssetDimension("nope"), null);
  assert.equal(parseAssetDimension(""), null);
  assert.equal(parseAssetDimension(null), null);
  assert.equal(parseAssetDimension(undefined), null);
});

// ── filenameFromText ──────────────────────────────────────────────────────────
test("filenameFromText: 2-5 meaningful words, filler dropped, kebab-case", () => {
  assert.equal(
    filenameFromText("A rustic terrace overlooking the rolling Tuscan vineyards at sunset", "png"),
    "rustic-terrace-overlooking-rolling-tuscan.png",
  );
  // Punctuation stripped; short texts keep what they have.
  assert.equal(filenameFromText("Fresh sushi, close-up!", "jpeg"), "fresh-sushi-close-up.jpeg");
  // All-filler text falls back to the raw words rather than nothing.
  assert.equal(filenameFromText("of the at", "png"), "of-the-at.png");
  // Empty text → "generated".
  assert.equal(filenameFromText("", "png"), "generated.png");
});

// ── validateAsset ─────────────────────────────────────────────────────────────
test("validateAsset: accepts allowed image types within size", () => {
  for (const type of ALLOWED_ASSET_TYPES) {
    assert.deepEqual(validateAsset(type, 1024), { valid: true }, type);
  }
});

test("validateAsset: rejects unsupported type", () => {
  const r = validateAsset("application/pdf", 1024);
  assert.equal(r.valid, false);
});

test("validateAsset: rejects empty + oversize", () => {
  assert.equal(validateAsset("image/png", 0).valid, false);
  assert.equal(validateAsset("image/png", -5).valid, false);
  assert.equal(validateAsset("image/png", MAX_ASSET_SIZE + 1).valid, false);
  assert.equal(validateAsset("image/png", MAX_ASSET_SIZE).valid, true);
});

// ── buildAssetKey ─────────────────────────────────────────────────────────────
test("buildAssetKey: produces a safe, valid, unique-ish key", () => {
  const k = buildAssetKey("My Photo.JPG", "image/jpeg", "abc123", 1700000000000);
  assert.equal(k, "assets/my_photo_1700000000000_abc123.jpg");
  assert.ok(isValidAssetKey(k));
});

test("buildAssetKey: sanitizes nasty names + falls back", () => {
  const k = buildAssetKey("../../etc/passwd", "image/png", "ZZ!!99", 1);
  assert.ok(isValidAssetKey(k), k);
  assert.ok(!k.includes(".."), "no traversal in key");
  // empty base + empty rand still valid
  const k2 = buildAssetKey("...", "image/webp", "", 1);
  assert.ok(isValidAssetKey(k2), k2);
});

test("buildAssetKey: unknown type derives ext from filename", () => {
  // not in EXT_BY_TYPE but a valid allowed type list is enforced upstream;
  // helper still derives a safe ext from the name when type unmapped.
  const k = buildAssetKey("clip.AVIF", "image/avif", "r4nd", 2);
  assert.match(k, /\.avif$/);
});

// ── isValidAssetKey (traversal guard) ──────────────────────────────────────────
test("isValidAssetKey: rejects traversal / foreign keys", () => {
  for (const bad of [
    "../secret",
    "assets/../etc",
    "other/file_1_x.png",
    "assets/UPPER_1_x.png",
    "assets/file.png",
    "",
  ]) {
    assert.equal(isValidAssetKey(bad), false, bad);
  }
});

// ── assetUrl ──────────────────────────────────────────────────────────────────
test("assetUrl: prefixes /media/", () => {
  assert.equal(assetUrl("assets/x_1_y.png"), "/media/assets/x_1_y.png");
});

// ── assetServeHeaders (stored-XSS guard) ──────────────────────────────────────
test("assetServeHeaders: always sets nosniff", () => {
  for (const t of ["image/png", "image/jpeg", "image/svg+xml"]) {
    assert.equal(assetServeHeaders(t)["x-content-type-options"], "nosniff", t);
  }
});

test("assetServeHeaders: SVG forced to sandbox + download (no inline script exec)", () => {
  for (const t of ["image/svg+xml", "image/SVG+XML", "image/svg"]) {
    const h = assetServeHeaders(t);
    assert.equal(h["content-security-policy"], "default-src 'none'; sandbox", t);
    assert.equal(h["content-disposition"], "attachment", t);
  }
});

test("assetServeHeaders: raster images are NOT sandboxed/forced-download", () => {
  for (const t of ["image/png", "image/jpeg", "image/webp", "image/gif"]) {
    const h = assetServeHeaders(t);
    assert.equal(h["content-security-policy"], undefined, t);
    assert.equal(h["content-disposition"], undefined, t);
  }
});

// ── deliveryFormat (transform-on-delivery negotiation) ────────────────────────
const WEBP_ACCEPT = "image/avif,image/webp,image/apng,*/*;q=0.8";

test("deliveryFormat: PNG/JPEG keys + webp-capable Accept → webp", () => {
  for (const key of ["assets/photo_1_x.png", "assets/photo_1_x.jpg", "assets/photo_1_x.jpeg"]) {
    assert.equal(deliveryFormat(key, WEBP_ACCEPT), "image/webp", key);
  }
});

test("deliveryFormat: non-transcodable types pass through untouched", () => {
  for (const key of [
    "assets/anim_1_x.gif", // may be animated
    "assets/logo_1_x.svg", // vector + locked-down serve path
    "assets/pic_1_x.webp", // already the target
    "assets/blob_1_x.bin",
  ]) {
    assert.equal(deliveryFormat(key, WEBP_ACCEPT), null, key);
  }
});

test("deliveryFormat: no webp in Accept (or no Accept) → original", () => {
  assert.equal(deliveryFormat("assets/photo_1_x.png", "image/png,*/*;q=0.8"), null);
  assert.equal(deliveryFormat("assets/photo_1_x.png", null), null);
  assert.equal(deliveryFormat("assets/photo_1_x.png", undefined), null);
  assert.equal(deliveryFormat("assets/photo_1_x.png", ""), null);
});

// ── i18n parity ───────────────────────────────────────────────────────────────
const here = dirname(fileURLToPath(import.meta.url));
const msgDir = join(here, "..", "messages");
const load = (l) => JSON.parse(readFileSync(join(msgDir, `${l}.json`), "utf8"));

function keys(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...keys(v, path));
    else out.push(path);
  }
  return out;
}

test("media namespace exists with identical non-empty keys in EN/FI/ET", () => {
  const cats = { en: load("en"), fi: load("fi"), et: load("et") };
  for (const [l, cat] of Object.entries(cats)) {
    assert.ok(cat.media, `${l}.json missing media namespace`);
  }
  const en = keys(cats.en.media).sort();
  assert.ok(en.length > 0);
  for (const l of ["fi", "et"]) {
    assert.deepEqual(keys(cats[l].media).sort(), en, `${l}.json media keys differ`);
  }
  for (const [l, cat] of Object.entries(cats)) {
    for (const path of keys(cat.media)) {
      const v = path.split(".").reduce((o, k) => o[k], cat.media);
      assert.ok(typeof v === "string" && v.trim() !== "", `${l}: ${path} empty`);
    }
  }
});
