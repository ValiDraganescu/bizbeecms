/**
 * E1 regression: per-Site theme overrides.
 *
 * Three things this run added that can silently break:
 *   1. The `theme` i18n namespace must exist with IDENTICAL non-empty keys in
 *      all three admin-UI catalogs (EN/FI/ET) — a missing key throws at render.
 *   2. The value allowlist (`isSafeColorValue`) is a SECURITY boundary: the value
 *      is injected into an inline <style>, so anything that could break out of
 *      the declaration/element MUST be rejected.
 *   3. `normalizeThemeOverrides` / `themeOverridesToCss` drop unknown tokens and
 *      unsafe values and never emit declaration-breaking text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  THEME_TOKENS,
  isThemeToken,
  isSafeColorValue,
  normalizeThemeOverrides,
  themeOverridesToCss,
} from "../src/lib/render/theme.ts";

const here = dirname(fileURLToPath(import.meta.url));
const msgDir = join(here, "..", "messages");
const load = (l) => JSON.parse(readFileSync(join(msgDir, `${l}.json`), "utf8"));

function keys(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...keys(v, path));
    else out.push(path);
  }
  return out;
}

test("theme namespace exists with identical non-empty keys in EN/FI/ET", () => {
  const cats = { en: load("en"), fi: load("fi"), et: load("et") };
  for (const [l, cat] of Object.entries(cats)) {
    assert.ok(cat.theme, `${l}.json missing theme namespace`);
  }
  const en = keys(cats.en.theme).sort();
  assert.ok(en.length > 0, "EN theme has keys");
  for (const l of ["fi", "et"]) {
    assert.deepEqual(
      keys(cats[l].theme).sort(),
      en,
      `${l}.json theme keys differ from en.json`,
    );
  }
  for (const [l, cat] of Object.entries(cats)) {
    for (const path of keys(cat.theme)) {
      const v = path.split(".").reduce((o, k) => o[k], cat.theme);
      assert.ok(typeof v === "string" && v.trim() !== "", `${l}: ${path} empty`);
    }
  }
});

test("isThemeToken: only the known purpose tokens", () => {
  for (const tok of THEME_TOKENS) assert.ok(isThemeToken(tok), tok);
  for (const bad of ["", "blue", "color-primary", "--primary", "Primary", "x".repeat(40)]) {
    assert.equal(isThemeToken(bad), false, bad);
  }
});

test("isSafeColorValue: accepts real colors", () => {
  for (const ok of [
    "#abc",
    "#aabbcc",
    "#aabbccdd",
    "oklch(0.5 0.19 268)",
    "oklch(0.5 0.19 268 / 0.5)",
    "rgb(12 34 56)",
    "rgba(12,34,56,.5)",
    "hsl(210 50% 40%)",
    "transparent",
    "currentColor",
    "white",
    "rebeccapurple",
  ]) {
    assert.ok(isSafeColorValue(ok), `should accept ${ok}`);
  }
});

test("isSafeColorValue: rejects CSS/HTML breakouts (security)", () => {
  for (const bad of [
    "",
    "#xyz",
    "red; } body { display:none",
    "</style><script>alert(1)</script>",
    "url(javascript:alert(1))",
    "url(http://evil/x.png)",
    "expression(alert(1))",
    "var(--x)",
    "#abc /* comment */",
    "@import 'x'",
    "blue}",
    "x".repeat(70),
    'rgb("12")',
  ]) {
    assert.equal(isSafeColorValue(bad), false, `should reject ${JSON.stringify(bad)}`);
  }
});

test("normalizeThemeOverrides: keeps known+safe, drops the rest", () => {
  const r = normalizeThemeOverrides({
    primary: "#112233",
    surface: "oklch(0.99 0 0)",
    unknownToken: "#000000", // dropped: unknown token
    danger: "red; }", // dropped: unsafe value
    foreground: 42, // dropped: not a string
  });
  assert.deepEqual(r, { primary: "#112233", surface: "oklch(0.99 0 0)" });
});

test("normalizeThemeOverrides: garbage → empty object, never throws", () => {
  for (const junk of [null, undefined, 5, "str", [], [1, 2]]) {
    assert.deepEqual(normalizeThemeOverrides(junk), {});
  }
});

test("themeOverridesToCss: emits a safe :root rule, empty for no overrides", () => {
  assert.equal(themeOverridesToCss({}), "");
  assert.equal(themeOverridesToCss({ unknownToken: "#000" }), "");
  const css = themeOverridesToCss({ primary: "#112233", ring: "oklch(0.6 0.1 268)" });
  assert.ok(css.startsWith(":root{") && css.endsWith("}"));
  assert.match(css, /--color-primary:#112233;/);
  assert.match(css, /--color-ring:oklch\(0\.6 0\.1 268\);/);
  // Never contains an element/declaration breakout, even from hostile input.
  const hostile = themeOverridesToCss({ primary: "red;}</style><script>x" });
  assert.equal(hostile, "", "hostile value dropped entirely");
});
