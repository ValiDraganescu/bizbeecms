/**
 * Make a small JPEG thumbnail of an image File, client-side, for the AI describe
 * call. The full-res original still goes to R2 — this tiny version is ONLY what
 * the vision model reads, so the describe request ships ~tens of KB instead of
 * the multi-MB original.
 *
 * Browser-only (canvas + createImageBitmap). Returns a `data:image/jpeg;base64,…`
 * URL, or null if the file isn't a decodable image (the caller then falls back
 * to letting the server inline the original bytes).
 *
 * ponytail: native canvas downscale, no image lib. 512px longest edge / 0.7 JPEG
 * is plenty for "what does this depict" — bump MAX/quality only if descriptions
 * measurably suffer.
 */
const MAX_EDGE = 512;
const QUALITY = 0.7;

/**
 * Read an image File's intrinsic pixel dimensions client-side (createImageBitmap).
 * Returns null for non-images or an undecodable file — the caller then just omits
 * the dims and the asset row stores null (no aspect-ratio hint). Browser-only.
 */
export async function readImageDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith("image/")) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const dims = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dims.width > 0 && dims.height > 0 ? dims : null;
  } catch {
    return null;
  }
}

export async function makeDescribeThumb(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // White matte so transparent PNGs don't go black under JPEG (no alpha).
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", QUALITY);
  } catch {
    return null;
  }
}
