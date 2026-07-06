/**
 * components-gallery zip export/import: the PURE kit-zip bookkeeping.
 *
 * Covers the `assets.json` sidecar build (intersect deps with Site rows) and
 * parse (untrusted: bad keys/shapes dropped, strings bounded, tags
 * re-normalized), the export route's `?names=` selection (missing names
 * reported, never silently dropped), and the zip magic sniff.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAssetsManifest,
  parseAssetsManifest,
  parseNamesParam,
  selectByNames,
  defaultKitName,
  kitZipFilename,
  isZipMagic,
} from "../src/lib/components/kit-zip.ts";

const K1 = "assets/logo_1_aa.png";
const K2 = "assets/hero_2_bb.jpg";

test("buildAssetsManifest intersects dep keys with site rows, in dep order", () => {
  const rows = [
    { key: K2, filename: "hero.jpg", contentType: "image/jpeg", description: "a hero", tags: ["b", "a"] },
    { key: K1, filename: "logo.png", contentType: "image/png", description: null },
  ];
  const m = buildAssetsManifest([K1, K2, "assets/missing_3_cc.png"], rows);
  assert.deepEqual(m.map((e) => e.key), [K1, K2]); // dep order, missing skipped
  assert.equal(m[0].filename, "logo.png");
  assert.equal(m[0].description, ""); // null → ""
  assert.deepEqual(m[1].tags, ["a", "b"]); // normalized (sorted)
});

test("parseAssetsManifest drops bad entries, keeps valid ones, never throws", () => {
  const good = { key: K1, filename: "logo.png", contentType: "image/png", description: "d", tags: ["x"] };
  const parsed = parseAssetsManifest(
    JSON.stringify([
      good,
      { key: "../../etc/passwd", filename: "f", contentType: "t" }, // traversal → dropped
      { key: K2, filename: "", contentType: "image/jpeg" }, // no filename → dropped
      { key: K2, contentType: "image/jpeg" }, // missing filename → dropped
      "not-an-object",
      good, // duplicate key → dropped
    ]),
  );
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].key, K1);
  assert.deepEqual(parsed[0].tags, ["x"]);
});

test("parseAssetsManifest tolerates garbage documents", () => {
  assert.deepEqual(parseAssetsManifest("not json"), []);
  assert.deepEqual(parseAssetsManifest({ nope: 1 }), []);
  assert.deepEqual(parseAssetsManifest(null), []);
});

test("parseAssetsManifest bounds untrusted strings", () => {
  const [e] = parseAssetsManifest([
    { key: K1, filename: "f".repeat(1000), contentType: "image/png", description: "d".repeat(10000) },
  ]);
  assert.equal(e.filename.length, 256);
  assert.equal(e.description.length, 4000);
});

test("parseNamesParam trims, dedupes, drops empties, keeps order", () => {
  assert.deepEqual(parseNamesParam(" Hero , Card ,,Hero,Footer "), ["Hero", "Card", "Footer"]);
  assert.deepEqual(parseNamesParam(""), []);
});

test("selectByNames returns rows in request order and reports missing", () => {
  const rows = [{ name: "A" }, { name: "B" }, { name: "C" }];
  const { selected, missing } = selectByNames(rows, ["C", "A", "Nope"]);
  assert.deepEqual(selected.map((r) => r.name), ["C", "A"]);
  assert.deepEqual(missing, ["Nope"]);
});

test("defaultKitName: single selection uses the component name", () => {
  assert.equal(defaultKitName(["Hero"]), "Hero");
  assert.equal(defaultKitName(["Hero", "Card"]), "components");
});

test("kitZipFilename slugs the kit name", () => {
  assert.equal(kitZipFilename("My Landing Kit!"), "my-landing-kit.kit.zip");
  assert.equal(kitZipFilename("???"), "kit.kit.zip");
});

test("isZipMagic detects PK header", () => {
  assert.equal(isZipMagic(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9])), true);
  assert.equal(isZipMagic(new TextEncoder().encode('{"a"')), false);
});
