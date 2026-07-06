/**
 * theme-fonts regression: the pure font-slot logic (catalog, grammars,
 * normalize, CSS emission) + the `theme.fonts` i18n key-parity. Dep-free
 * (`node --test scripts/fonts.test.mjs`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FONT_SLOTS,
  FONT_CATALOG,
  FALLBACK_STACKS,
  catalogFont,
  isSafeFontFamily,
  isSafeUnicodeRange,
  emptyThemeFonts,
  hasThemeFonts,
  normalizeThemeFonts,
  fontStack,
  fontFacesToCss,
  themeFontsToCss,
} from "../src/lib/render/fonts.ts";
import { buildAssetKey } from "../src/lib/render/asset.ts";

const KEY = buildAssetKey("inter-400.woff2", "font/woff2", "ab12cd", 1700000000000);

// ── catalog ───────────────────────────────────────────────────────────────────
test("catalog: every family passes the emit grammar and has valid weights", () => {
  for (const f of FONT_CATALOG) {
    assert.ok(isSafeFontFamily(f.family), f.family);
    assert.ok(f.weights.length > 0, f.family);
    for (const w of f.weights) {
      assert.ok(Number.isInteger(w) && w >= 100 && w <= 900, `${f.family} ${w}`);
    }
    assert.ok(FALLBACK_STACKS[f.category], f.family);
  }
  // No duplicate families.
  assert.equal(new Set(FONT_CATALOG.map((f) => f.family)).size, FONT_CATALOG.length);
});

test("catalogFont: lookup by exact family", () => {
  assert.equal(catalogFont("Inter")?.category, "sans");
  assert.equal(catalogFont("Playfair Display")?.category, "serif");
  assert.equal(catalogFont("Comic Sans MS"), null);
});

// ── grammars ──────────────────────────────────────────────────────────────────
test("isSafeFontFamily: rejects declaration-breakers", () => {
  for (const bad of [
    "", '"escape', "fam;ly", "a}b", "url(x)", "a\\b", "<script>", "x".repeat(60),
  ]) {
    assert.equal(isSafeFontFamily(bad), false, bad);
  }
  assert.ok(isSafeFontFamily("Source Serif 4"));
  assert.ok(isSafeFontFamily("EB Garamond"));
});

test("isSafeUnicodeRange: css2 shapes pass, junk fails", () => {
  assert.ok(isSafeUnicodeRange("U+0000-00FF, U+0131, U+0152-0153"));
  assert.ok(isSafeUnicodeRange("U+00??"));
  for (const bad of ["", "0000-00FF", "U+0;}", "U+0000 evil", "u+" + "f".repeat(600)]) {
    assert.equal(isSafeUnicodeRange(bad), false, bad);
  }
});

// ── normalize ─────────────────────────────────────────────────────────────────
test("normalizeThemeFonts: garbage in → empty", () => {
  for (const raw of [null, undefined, "x", 42, [], { slots: "no", faces: "no" }]) {
    assert.deepEqual(normalizeThemeFonts(raw), emptyThemeFonts());
  }
});

test("normalizeThemeFonts: keeps valid slots/faces, drops invalid ones", () => {
  const n = normalizeThemeFonts({
    slots: {
      body: { family: "Inter" },
      heading: { family: 'bad"family' }, // unsafe → dropped
      banner: { family: "Lato" }, // unknown slot → dropped
    },
    faces: [
      { family: "Inter", weight: 400, style: "normal", key: KEY, unicodeRange: "U+0000-00FF" },
      { family: "Inter", weight: 401.5, style: "normal", key: KEY }, // non-int weight
      { family: "Inter", weight: 400, style: "oblique", key: KEY }, // bad style
      { family: "Inter", weight: 400, style: "normal", key: "../../etc" }, // bad key
      { family: "Inter", weight: 400, style: "italic", key: KEY, unicodeRange: "}bad{" },
    ],
  });
  assert.deepEqual(Object.keys(n.slots), ["body"]);
  assert.equal(n.faces.length, 2);
  assert.equal(n.faces[0].unicodeRange, "U+0000-00FF");
  // Bad unicodeRange dropped but the face itself kept.
  assert.equal(n.faces[1].unicodeRange, undefined);
  assert.ok(hasThemeFonts(n));
  assert.equal(hasThemeFonts(emptyThemeFonts()), false);
});

// ── CSS emission ──────────────────────────────────────────────────────────────
test("fontStack: quoted family + category fallback", () => {
  assert.equal(fontStack("Lora"), `"Lora", ${FALLBACK_STACKS.serif}`);
  // Unknown family (future custom uploads) falls back to the sans stack.
  assert.equal(fontStack("Brand Face"), `"Brand Face", ${FALLBACK_STACKS.sans}`);
});

test("themeFontsToCss: faces + vars + default applications", () => {
  const css = themeFontsToCss({
    slots: { body: { family: "Inter" }, heading: { family: "Playfair Display" } },
    faces: [{ family: "Inter", weight: 400, style: "normal", key: KEY, unicodeRange: "U+0000-00FF" }],
  });
  assert.ok(css.includes(`@font-face{font-family:"Inter";font-style:normal;font-weight:400;`));
  assert.ok(css.includes(`src:url(/media/${KEY}) format("woff2");unicode-range:U+0000-00FF;`));
  assert.ok(css.includes(`--font-body:"Inter",`));
  assert.ok(css.includes(`--font-heading:"Playfair Display",`));
  assert.ok(css.includes("body{font-family:var(--font-body);}"));
  assert.ok(css.includes("h1,h2,h3,h4,h5,h6{font-family:var(--font-heading);}"));
  assert.ok(!css.includes("--font-accent"));
});

test("themeFontsToCss: accent defines its var but applies nothing", () => {
  const css = themeFontsToCss({ slots: { accent: { family: "Caveat" } }, faces: [] });
  assert.ok(css.includes(`--font-accent:"Caveat",`));
  assert.ok(!css.includes("body{"));
  assert.ok(!css.includes("h1,"));
});

test("themeFontsToCss: empty config emits nothing; hostile input can't break out", () => {
  assert.equal(themeFontsToCss(emptyThemeFonts()), "");
  assert.equal(themeFontsToCss({ slots: { body: { family: "x};</style><script>" } }, faces: [] }), "");
  const css = themeFontsToCss({ slots: { body: { family: "Inter" } }, faces: [] });
  assert.ok(!css.includes("<"), "no element breakout chars beyond CSS");
});

test("fontFacesToCss: emits only faces (editor preview use)", () => {
  const css = fontFacesToCss({
    slots: {},
    faces: [{ family: "Lora", weight: 600, style: "italic", key: KEY }],
  });
  assert.ok(css.startsWith("@font-face{"));
  assert.ok(css.includes("font-style:italic;font-weight:600;"));
  assert.ok(!css.includes(":root"));
});
