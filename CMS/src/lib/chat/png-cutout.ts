/**
 * PNG glue for background removal: decode → flood-fill alpha → re-encode. The
 * pixel logic is the PURE `removeWhiteBackground` (cutout.ts, node-tested); this
 * file is the IMPURE half — it pulls in upng-js (a Worker-compatible pure-JS PNG
 * codec) so it can't run under the dep-free node --test, hence the split.
 */
import UPNG from "upng-js";
import { removeWhiteBackground } from "./cutout.ts";

/**
 * Take PNG bytes, key out the connected white background to transparency, and
 * return new PNG bytes (RGBA). On ANY failure (not a PNG, decode error) returns
 * the input unchanged — a failed cutout should degrade to the original image,
 * never error the whole generate_image call.
 */
export function removeBackgroundFromPng(png: ArrayBuffer): ArrayBuffer {
  try {
    const img = UPNG.decode(png);
    // toRGBA8 returns one ArrayBuffer per animation frame; a still PNG has one.
    const frame = UPNG.toRGBA8(img)[0];
    const rgba = new Uint8Array(frame);
    removeWhiteBackground(rgba, img.width, img.height);
    // Re-encode lossless RGBA (cnum=0 → no palette quantization, keep full alpha).
    return UPNG.encode([rgba.buffer], img.width, img.height, 0);
  } catch {
    return png;
  }
}
