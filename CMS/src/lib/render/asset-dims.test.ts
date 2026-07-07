import { test } from "node:test";
import assert from "node:assert/strict";
import { withAssetDims, readAssetDims } from "./asset.ts";

test("withAssetDims stamps ?w=&h= from valid dims", () => {
  assert.equal(withAssetDims("/media/x.png", 800, 600), "/media/x.png?w=800&h=600");
  // numeric strings (client form fields) are honored + floored/clamped
  assert.equal(withAssetDims("/media/x.png", "400", "300"), "/media/x.png?w=400&h=300");
});

test("withAssetDims leaves URL untouched on missing/invalid dims or existing query", () => {
  assert.equal(withAssetDims("/media/x.png", null, 600), "/media/x.png");
  assert.equal(withAssetDims("/media/x.png", 0, 600), "/media/x.png");
  assert.equal(withAssetDims("/media/x.png", "junk", "600"), "/media/x.png");
  assert.equal(withAssetDims("/media/x.png?fmt=webp", 800, 600), "/media/x.png?fmt=webp"); // never double-stamp
  assert.equal(withAssetDims("", 800, 600), "");
});

test("readAssetDims round-trips withAssetDims", () => {
  const url = withAssetDims("/media/x.png", 1200, 630);
  assert.deepEqual(readAssetDims(url), { width: 1200, height: 630 });
});

test("readAssetDims returns null on no/partial/garbage query", () => {
  assert.equal(readAssetDims("/media/x.png"), null);
  assert.equal(readAssetDims("/media/x.png?w=800"), null);
  assert.equal(readAssetDims("/media/x.png?w=abc&h=600"), null);
  assert.equal(readAssetDims("/media/x.png?fmt=webp"), null);
  assert.equal(readAssetDims(undefined), null);
  assert.equal(readAssetDims(42), null);
});
