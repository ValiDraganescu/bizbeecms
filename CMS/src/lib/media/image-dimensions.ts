/**
 * Read an image's intrinsic pixel dimensions straight from its FILE HEADER — no
 * decode, no canvas, no `createImageBitmap`. Pure byte math, so it runs on
 * Cloudflare Workers (where there is no `createImageBitmap`/`Image` for arbitrary
 * bytes) and under dep-free `node --test`.
 *
 * WHY this exists: AI-generated images (`generate_image` tool) are produced and
 * stored SERVER-SIDE on the Worker — there is no browser in that path to run the
 * client-side `readImageDimensions` (image-thumb.ts). So their asset rows stored
 * NULL width/height, which meant they got neither the CLS anti-layout-shift box
 * nor srcset. Parsing the header covers the formats OpenRouter image models emit
 * (PNG almost always; JPEG/GIF/WebP handled for completeness).
 *
 * Returns null for anything it can't read (unknown format, truncated header) —
 * the caller then stores null, exactly as before, so this can only ADD dims,
 * never break an asset.
 *
 * ponytail: header-only parse, no image lib. Covers PNG/JPEG/GIF/WebP — the only
 * formats an image-gen model returns. Add another format's magic only if a model
 * starts emitting it.
 */

export interface ImageDims {
  width: number;
  height: number;
}

/** PNG: 8-byte signature, then the IHDR chunk at offset 16 has 4-byte BE width/height. */
function pngDims(b: Uint8Array): ImageDims | null {
  if (b.length < 24) return null;
  // \x89 P N G \r \n \x1a \n
  if (b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}

/** GIF87a/GIF89a: 6-byte magic, then LE u16 width, LE u16 height. */
function gifDims(b: Uint8Array): ImageDims | null {
  if (b.length < 10) return null;
  if (b[0] !== 0x47 || b[1] !== 0x49 || b[2] !== 0x46) return null; // "GIF"
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
}

/** JPEG: scan the marker segments for a Start-Of-Frame (SOFn) which carries dims. */
function jpegDims(b: Uint8Array): ImageDims | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null; // SOI
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    // Standalone markers (no length): padding 0xFF, RSTn, SOI/EOI, TEM.
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    const len = dv.getUint16(i + 2);
    if (len < 2) return null;
    // SOF0..SOF15 carry dimensions, excluding the DHT/JPG/DAC markers.
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof) {
      // segment: FF marker | len(2) | precision(1) | height(2) | width(2)
      if (i + 9 >= b.length) return null;
      return { height: dv.getUint16(i + 5), width: dv.getUint16(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

/** WebP (VP8/VP8L/VP8X): RIFF container, dims depend on the sub-chunk fourCC. */
function webpDims(b: Uint8Array): ImageDims | null {
  if (b.length < 30) return null;
  // "RIFF"…"WEBP"
  if (b[0] !== 0x52 || b[1] !== 0x49 || b[2] !== 0x46 || b[3] !== 0x46) return null;
  if (b[8] !== 0x57 || b[9] !== 0x45 || b[10] !== 0x42 || b[11] !== 0x50) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const fourcc = String.fromCharCode(b[12], b[13], b[14], b[15]);
  if (fourcc === "VP8 ") {
    // Lossy: 14-bit width/height at offset 26/28 (after the 3-byte frame tag + start code).
    const w = dv.getUint16(26, true) & 0x3fff;
    const h = dv.getUint16(28, true) & 0x3fff;
    return { width: w, height: h };
  }
  if (fourcc === "VP8L") {
    // Lossless: 1-byte signature (0x2f) at 20, then 14-bit w-1 / 14-bit h-1 packed LE.
    if (b[20] !== 0x2f) return null;
    const bits = dv.getUint32(21, true);
    const w = (bits & 0x3fff) + 1;
    const h = ((bits >> 14) & 0x3fff) + 1;
    return { width: w, height: h };
  }
  if (fourcc === "VP8X") {
    // Extended: 24-bit LE canvas w-1 at 24, h-1 at 27.
    const w = (b[24] | (b[25] << 8) | (b[26] << 16)) + 1;
    const h = (b[27] | (b[28] << 8) | (b[29] << 16)) + 1;
    return { width: w, height: h };
  }
  return null;
}

/**
 * Read intrinsic pixel dims from raw image bytes by parsing the header only.
 * Returns null when the format is unknown or the header is truncated/invalid, or
 * when the parsed dims aren't a sane positive pair. Pure — node-tested.
 */
export function imageDimensionsFromBytes(bytes: ArrayBuffer | Uint8Array): ImageDims | null {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dims = pngDims(b) ?? gifDims(b) ?? jpegDims(b) ?? webpDims(b);
  if (!dims) return null;
  if (!Number.isFinite(dims.width) || !Number.isFinite(dims.height)) return null;
  if (dims.width <= 0 || dims.height <= 0) return null;
  return dims;
}
