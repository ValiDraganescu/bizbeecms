/**
 * Edge flood-fill background removal (node --test, no @/ imports). The invariant
 * that matters: border-connected white → transparent; white ENCLOSED by the
 * subject (an egg) stays opaque. A global threshold would fail the second case.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { removeWhiteBackground, withWhiteBackgroundInstruction } from "./cutout.ts";

// Build a w×h RGBA buffer from an ASCII map: 'W' = white, '#' = a dark subject pixel.
function buf(rows: string[]): { rgba: Uint8Array; w: number; h: number } {
  const h = rows.length;
  const w = rows[0].length;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const white = rows[y][x] === "W";
      rgba[i] = rgba[i + 1] = rgba[i + 2] = white ? 255 : 20;
      rgba[i + 3] = 255; // start fully opaque
    }
  }
  return { rgba, w, h };
}

const alphaAt = (rgba: Uint8Array, w: number, x: number, y: number) => rgba[(y * w + x) * 4 + 3];

test("border-connected white is cleared; subject and ENCLOSED white are kept", () => {
  // A dark ring enclosing a single white pixel (the "egg"), on a white field.
  const { rgba, w } = buf([
    "WWWWW",
    "W###W",
    "W#W#W", // center white at (2,2) is enclosed by '#'
    "W###W",
    "WWWWW",
  ]);
  removeWhiteBackground(rgba, w, 5);

  // Corners (border white) → transparent.
  assert.equal(alphaAt(rgba, w, 0, 0), 0);
  assert.equal(alphaAt(rgba, w, 4, 4), 0);
  // The dark ring → opaque (not white, never touched).
  assert.equal(alphaAt(rgba, w, 1, 1), 255);
  // The ENCLOSED white pixel → still opaque (the whole point of flood-fill).
  assert.equal(alphaAt(rgba, w, 2, 2), 255);
});

test("a fully white image becomes fully transparent", () => {
  const { rgba, w, h } = buf(["WWW", "WWW"]);
  removeWhiteBackground(rgba, w, h);
  for (let p = 0; p < w * h; p++) assert.equal(rgba[p * 4 + 3], 0);
});

test("malformed (too-short) buffer is left untouched, not thrown", () => {
  const short = new Uint8Array(4); // claims 2x2 but holds 1 px
  const out = removeWhiteBackground(short, 2, 2);
  assert.equal(out, short);
  assert.equal(short[3], 0); // unchanged from its zero init
});

test("withWhiteBackgroundInstruction appends the white-bg rule", () => {
  const p = withWhiteBackgroundInstruction("a red bike");
  assert.match(p, /^a red bike/);
  assert.match(p, /pure-white/i);
});
