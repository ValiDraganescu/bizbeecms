/**
 * Pure parse/decode for image generation (node --test; no @/ imports). Covers the
 * response shape (image under choices[0].message.images[].image_url.url) and the
 * data-URL decode — the two bits that silently break if a provider tweaks shape.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseGeneratedImageUrl,
  decodeDataUrl,
  buildGenerateMessages,
} from "./generate-image.ts";

// A 1x1 transparent PNG, base64 — a real, decodable payload.
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PNG_DATA_URL = `data:image/png;base64,${PNG_B64}`;

test("parseGeneratedImageUrl pulls the first image data URL from the completion", () => {
  const body = JSON.stringify({
    choices: [{ message: { images: [{ image_url: { url: PNG_DATA_URL } }] } }],
  });
  assert.equal(parseGeneratedImageUrl(body), PNG_DATA_URL);
});

test("parseGeneratedImageUrl returns '' when no image / bad shape", () => {
  assert.equal(parseGeneratedImageUrl(JSON.stringify({ choices: [{ message: { content: "hi" } }] })), "");
  assert.equal(parseGeneratedImageUrl(JSON.stringify({ choices: [] })), "");
  assert.equal(parseGeneratedImageUrl("not json"), "");
  // A non-image URL (e.g. http) is rejected — we only accept data:image.
  assert.equal(
    parseGeneratedImageUrl(JSON.stringify({ choices: [{ message: { images: [{ image_url: { url: "https://x/y.png" } }] } }] })),
    "",
  );
});

test("decodeDataUrl decodes a base64 image data URL to bytes + mime", () => {
  const got = decodeDataUrl(PNG_DATA_URL);
  assert.ok(got);
  assert.equal(got.contentType, "image/png");
  // PNG magic number: 0x89 'P' 'N' 'G'.
  const head = new Uint8Array(got.bytes).subarray(0, 4);
  assert.deepEqual([...head], [0x89, 0x50, 0x4e, 0x47]);
});

test("decodeDataUrl rejects non-image / non-base64 / junk", () => {
  assert.equal(decodeDataUrl("data:text/plain;base64,aGk="), null);
  assert.equal(decodeDataUrl("https://example.com/a.png"), null);
  assert.equal(decodeDataUrl(""), null);
});

test("buildGenerateMessages wraps the prompt as a single user turn", () => {
  assert.deepEqual(buildGenerateMessages("a red bike"), [{ role: "user", content: "a red bike" }]);
});
