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
  DEFAULT_THEME,
  THEME_PRESETS,
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

test("DEFAULT_THEME: one safe value per token, matching globals.css :root", () => {
  // Every token has a default, and each default is itself a safe color value.
  for (const token of THEME_TOKENS) {
    const v = DEFAULT_THEME[token];
    assert.ok(typeof v === "string" && v.trim() !== "", `${token} default missing`);
    assert.ok(isSafeColorValue(v), `${token} default not a safe color: ${v}`);
  }
  assert.equal(
    Object.keys(DEFAULT_THEME).length,
    THEME_TOKENS.length,
    "DEFAULT_THEME has an entry per token and no extras",
  );

  // Drift guard: the values must equal the light-mode :root in globals.css.
  const css = readFileSync(join(here, "..", "src", "app", "globals.css"), "utf8");
  const root = css.slice(css.indexOf(":root"), css.indexOf("/* Dark token"));
  for (const token of THEME_TOKENS) {
    const m = root.match(new RegExp(`--color-${token}\\s*:\\s*([^;]+);`));
    assert.ok(m, `globals.css :root missing --color-${token}`);
    assert.equal(
      m[1].trim(),
      DEFAULT_THEME[token],
      `--color-${token} drifted from DEFAULT_THEME`,
    );
  }
});

test("THEME_PRESETS: every preset is known tokens + safe values", () => {
  assert.ok(THEME_PRESETS.length > 0);
  const keys = new Set();
  for (const preset of THEME_PRESETS) {
    assert.ok(!keys.has(preset.key), `duplicate preset key ${preset.key}`);
    keys.add(preset.key);
    // A preset is just sparse overrides — must survive normalization unchanged.
    assert.deepEqual(
      normalizeThemeOverrides(preset.overrides),
      preset.overrides,
      `preset ${preset.key} has an unknown token or unsafe value`,
    );
  }
  // The "default" preset clears everything.
  const def = THEME_PRESETS.find((p) => p.key === "default");
  assert.deepEqual(def?.overrides, {}, "default preset must be empty");
});

test("THEME_PRESETS: every non-default preset is a FULL coordinated palette", () => {
  const allTokens = new Set(THEME_TOKENS);
  for (const preset of THEME_PRESETS) {
    if (preset.key === "default") continue;
    const got = Object.keys(preset.overrides).sort();
    assert.deepEqual(
      got,
      [...THEME_TOKENS].sort(),
      `preset ${preset.key} must override every one of the ${THEME_TOKENS.length} tokens`,
    );
    for (const [tok, val] of Object.entries(preset.overrides)) {
      assert.ok(allTokens.has(tok), `preset ${preset.key}: unknown token ${tok}`);
      assert.ok(isSafeColorValue(val), `preset ${preset.key}: unsafe ${tok}=${val}`);
    }
    // Sanity: it actually re-tints surfaces/text/border, not just the brand —
    // those neutrals must differ from the global defaults.
    for (const tok of ["surface", "foreground", "border"]) {
      assert.notEqual(
        preset.overrides[tok],
        DEFAULT_THEME[tok],
        `preset ${preset.key}: ${tok} should differ from default (palette must look coordinated)`,
      );
    }
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
