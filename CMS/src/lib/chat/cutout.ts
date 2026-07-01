/**
 * Algorithmic background removal for generated images (the `transparentBackground`
 * option on generate_image). The model is prompted to render the subject on a flat
 * PURE-WHITE background; this keys that white out to alpha.
 *
 * Strategy: EDGE FLOOD-FILL, not a global white→alpha threshold. We BFS from every
 * border pixel through connected near-white pixels and clear ONLY those to alpha.
 * So white that's part of the SUBJECT (a fried egg, steam highlights) — not
 * connected to the border — is kept. A naive global threshold would punch holes in
 * those. PURE (operates on an RGBA byte buffer); the PNG decode/encode is the
 * caller's job (upng-js, which can't run under the dep-free node --test).
 *
 * ponytail: 4-neighbour flood fill + a fixed near-white threshold is the whole
 * machinery. No feathering/anti-alias matting — a hard alpha edge is fine for a
 * flat-background cutout; add edge feathering only if halos actually show.
 */

/** A pixel is "background white" when every RGB channel is at/above this (0-255). */
const WHITE_THRESHOLD = 244;

/** True when pixel `i` (RGBA byte offset) is near-white (alpha ignored). */
function isWhite(rgba: Uint8Array, i: number): boolean {
  return rgba[i] >= WHITE_THRESHOLD && rgba[i + 1] >= WHITE_THRESHOLD && rgba[i + 2] >= WHITE_THRESHOLD;
}

/**
 * Clear the connected white background to transparent, in place, on an RGBA buffer.
 * Returns the same buffer (mutated) so callers can chain. `width`/`height` are pixels.
 *
 * Flood-fills from the four edges: any near-white pixel reachable from a border
 * through other near-white pixels gets alpha=0. Interior whites stay opaque.
 */
export function removeWhiteBackground(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const n = width * height;
  if (rgba.length < n * 4) return rgba; // not RGBA8 / malformed — leave untouched

  const visited = new Uint8Array(n); // 1 = enqueued/processed (by PIXEL index, not byte)
  // Ring-buffer-free BFS queue of pixel indices. Seed with the border ring.
  const queue: number[] = [];
  const seed = (px: number) => {
    if (visited[px]) return;
    if (!isWhite(rgba, px * 4)) return; // a non-white border pixel isn't background
    visited[px] = 1;
    queue.push(px);
  };
  for (let x = 0; x < width; x++) {
    seed(x); // top row
    seed((height - 1) * width + x); // bottom row
  }
  for (let y = 0; y < height; y++) {
    seed(y * width); // left col
    seed(y * width + (width - 1)); // right col
  }

  let head = 0;
  while (head < queue.length) {
    const px = queue[head++];
    rgba[px * 4 + 3] = 0; // clear alpha — this is background

    const x = px % width;
    const y = (px / width) | 0;
    // 4-neighbours; enqueue any unvisited near-white one.
    if (x > 0) seed(px - 1);
    if (x < width - 1) seed(px + 1);
    if (y > 0) seed(px - width);
    if (y < height - 1) seed(px + width);
  }
  return rgba;
}

/**
 * Augment a generation prompt so the subject is rendered on a flat pure-white
 * background that the flood fill can cleanly key out. Idempotent enough for our
 * use (the caller only appends once). Kept here so the prompt rule and the removal
 * threshold live together — they're two halves of the same feature.
 */
export function withWhiteBackgroundInstruction(prompt: string): string {
  return (
    prompt.trim() +
    " The subject must be isolated on a plain, solid, pure-white (#FFFFFF) background " +
    "with no gradient, no shadow on the background, and no border or vignette, so the " +
    "background can be cleanly removed."
  );
}
