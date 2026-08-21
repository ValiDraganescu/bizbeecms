/**
 * Pure arg validation for the upload_asset tool (node --test; no @/ imports).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateUploadAsset } from "./upload-asset-tool.ts";

// "hello" in base64 — a valid but not-allowed payload unless typed as text/plain.
const HELLO_B64 = Buffer.from("hello").toString("base64");
// Minimal PNG magic so image/png passes the byte decode (content sniffing is
// NOT part of validation — type comes from arg/data-URL/extension).
const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");

test("requires filename and data, naming the missing field", () => {
  const noFile = validateUploadAsset({ data: HELLO_B64 });
  assert.equal(noFile.ok, false);
  if (!noFile.ok) assert.match(noFile.error, /filename is required/);
  const noData = validateUploadAsset({ filename: "a.txt" });
  assert.equal(noData.ok, false);
  if (!noData.ok) assert.match(noData.error, /data is required/);
  assert.equal(validateUploadAsset(null).ok, false);
});

test("accepts plain base64 with type inferred from the extension", () => {
  const v = validateUploadAsset({ filename: "notes.md", data: HELLO_B64 });
  assert.equal(v.ok, true);
  if (v.ok) {
    assert.equal(v.contentType, "text/markdown");
    assert.equal(new TextDecoder().decode(v.bytes), "hello");
  }
});

test("accepts a data: URL and lifts its MIME type", () => {
  const v = validateUploadAsset({
    filename: "pixel.bin",
    data: `data:image/png;base64,${PNG_B64}`,
  });
  assert.equal(v.ok, true);
  if (v.ok) assert.equal(v.contentType, "image/png");
});

test("explicit contentType wins over inference", () => {
  const v = validateUploadAsset({ filename: "weird.bin", data: HELLO_B64, contentType: "text/plain" });
  assert.equal(v.ok, true);
  if (v.ok) assert.equal(v.contentType, "text/plain");
});

test("rejects disallowed types, naming the type and the allowlist", () => {
  const v = validateUploadAsset({ filename: "page.html", data: HELLO_B64, contentType: "text/html" });
  assert.equal(v.ok, false);
  if (!v.ok) {
    assert.match(v.error, /unsupported type: text\/html/);
    assert.match(v.error, /allowed types:/);
  }
});

test("rejects garbage base64 with a fix hint", () => {
  const v = validateUploadAsset({ filename: "a.png", data: "not!!base64" });
  assert.equal(v.ok, false);
  if (!v.ok) assert.match(v.error, /not valid base64/);
});

test("tolerates whitespace and base64url alphabets", () => {
  const urlSafe = Buffer.from([0xfb, 0xff]).toString("base64url");
  const v = validateUploadAsset({ filename: "a.txt", data: ` ${urlSafe}\n` });
  assert.equal(v.ok, true);
  const wrapped = validateUploadAsset({
    filename: "b.txt",
    data: HELLO_B64.slice(0, 4) + "\n" + HELLO_B64.slice(4),
  });
  assert.equal(wrapped.ok, true);
});

test("rejects an empty payload and normalizes tags", () => {
  const empty = validateUploadAsset({ filename: "a.txt", data: "" });
  assert.equal(empty.ok, false);
  const v = validateUploadAsset({
    filename: "a.txt",
    data: HELLO_B64,
    tags: ["Logo", "logo", " brand "],
  });
  assert.equal(v.ok, true);
  // normalizeTags trims, dedupes case-insensitively, and sorts.
  if (v.ok) assert.deepEqual(v.tags, ["brand", "Logo"]);
});
