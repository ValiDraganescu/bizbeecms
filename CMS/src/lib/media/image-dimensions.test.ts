/**
 * Header-only image dimension parsing (node --test; no @/ imports). Real minimal
 * byte fixtures per format — this is the ONLY thing standing between an AI-
 * generated image and a NULL width/height (no CLS box, no srcset), so if a format
 * parse regresses this fails.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { imageDimensionsFromBytes } from "./image-dimensions.ts";

function u8(...bytes: number[]): Uint8Array {
  return Uint8Array.from(bytes);
}

test("PNG: reads IHDR width/height (big-endian)", () => {
  // signature + IHDR length/type + 0x0140 x 0x00F0 (320 x 240)
  const png = u8(
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // len + "IHDR"
    0x00, 0x00, 0x01, 0x40, // width 320
    0x00, 0x00, 0x00, 0xf0, // height 240
  );
  assert.deepEqual(imageDimensionsFromBytes(png), { width: 320, height: 240 });
});

test("PNG: the real 1x1 fixture decodes to 1x1", () => {
  const PNG_B64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const bytes = Uint8Array.from(atob(PNG_B64), (c) => c.charCodeAt(0));
  assert.deepEqual(imageDimensionsFromBytes(bytes), { width: 1, height: 1 });
});

test("GIF: reads little-endian logical screen width/height", () => {
  // "GIF89a" + 0x0080 x 0x0040 (128 x 64) little-endian
  const gif = u8(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x80, 0x00, 0x40, 0x00);
  assert.deepEqual(imageDimensionsFromBytes(gif), { width: 128, height: 64 });
});

test("JPEG: finds SOF0 dimensions past an APP0 segment", () => {
  const jpeg = u8(
    0xff, 0xd8, // SOI
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, // APP0, length 4 (2 payload bytes)
    0xff, 0xc0, 0x00, 0x11, 0x08, // SOF0, len 17, precision 8
    0x00, 0xf0, // height 240
    0x01, 0x40, // width 320
    0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // component data (padding)
  );
  assert.deepEqual(imageDimensionsFromBytes(jpeg), { width: 320, height: 240 });
});

test("WebP VP8X (extended): reads 24-bit canvas dims", () => {
  // RIFF....WEBP VP8X ; canvas w-1 = 319 (0x13F), h-1 = 239 (0xEF)
  const webp = u8(
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, // RIFF + size
    0x57, 0x45, 0x42, 0x50, // WEBP
    0x56, 0x50, 0x38, 0x58, // VP8X
    0x0a, 0x00, 0x00, 0x00, // chunk size
    0x00, 0x00, 0x00, 0x00, // flags + reserved
    0x3f, 0x01, 0x00, // width-1 = 319 (LE 24-bit)
    0xef, 0x00, 0x00, // height-1 = 239
  );
  assert.deepEqual(imageDimensionsFromBytes(webp), { width: 320, height: 240 });
});

test("returns null for unknown / truncated bytes", () => {
  assert.equal(imageDimensionsFromBytes(u8(0x00, 0x01, 0x02, 0x03)), null);
  assert.equal(imageDimensionsFromBytes(u8()), null);
  // PNG signature but truncated before IHDR
  assert.equal(imageDimensionsFromBytes(u8(0x89, 0x50, 0x4e, 0x47)), null);
});

test("rejects a zero-dimension header", () => {
  const png = u8(
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x00, // width 0
    0x00, 0x00, 0x00, 0xf0,
  );
  assert.equal(imageDimensionsFromBytes(png), null);
});
