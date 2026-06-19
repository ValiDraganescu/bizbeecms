import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DARK_DEFAULT_THEME,
  DEFAULT_THEME,
  THEME_PRESETS,
  THEME_TOKENS,
  isSafeColorValue,
  themeOverridesToCss,
} from "./theme.ts";

// Regression for the P2 theme-editor swatch bug: swatches are painted directly
// from the token value (the browser renders oklch/rgb/… natively), so every
// shipped default and preset value MUST be a safe, paintable color — otherwise
// the swatch falls back to neutral gray.
test("every DEFAULT_THEME value is a safe paintable color", () => {
  for (const token of THEME_TOKENS) {
    assert.ok(
      isSafeColorValue(DEFAULT_THEME[token]),
      `default ${token} = "${DEFAULT_THEME[token]}" is not a safe color`,
    );
  }
});

test("every DARK_DEFAULT_THEME value is a safe paintable color", () => {
  for (const token of THEME_TOKENS) {
    assert.ok(
      isSafeColorValue(DARK_DEFAULT_THEME[token]),
      `dark default ${token} = "${DARK_DEFAULT_THEME[token]}" is not a safe color`,
    );
  }
});

// The dark-override EDITOR opens on DARK_DEFAULT_THEME and stores diffs from it;
// if it drifts from globals.css's [data-theme="dark"] block, "value === default"
// (= no override) would be wrong and the editor would persist phantom overrides.
test("DARK_DEFAULT_THEME mirrors globals.css [data-theme=\"dark\"]", () => {
  const css = readFileSync(
    fileURLToPath(new URL("../../app/globals.css", import.meta.url)),
    "utf8",
  );
  // Grab the first `[data-theme="dark"] { … }` block's --color-* declarations.
  const block = css.match(/\[data-theme="dark"\]\s*\{([^}]*)\}/);
  assert.ok(block, "globals.css has no [data-theme=\"dark\"] block");
  const fromCss: Record<string, string> = {};
  for (const m of block![1].matchAll(/--color-([\w-]+):\s*([^;]+);/g)) {
    fromCss[m[1]] = m[2].trim();
  }
  for (const token of THEME_TOKENS) {
    assert.equal(
      DARK_DEFAULT_THEME[token],
      fromCss[token],
      `dark default ${token} drifted from globals.css`,
    );
  }
});

test("every THEME_PRESET override value is a safe paintable color", () => {
  for (const preset of THEME_PRESETS) {
    for (const [token, value] of Object.entries(preset.overrides)) {
      assert.ok(
        isSafeColorValue(value),
        `preset ${preset.key} ${token} = "${value}" is not a safe color`,
      );
    }
  }
});

// Sanity: oklch (the actual default grammar) is accepted, raw hex too, and the
// injection breakers that the swatch background would otherwise inherit are not.
test("isSafeColorValue accepts oklch/hex and rejects breakers", () => {
  assert.ok(isSafeColorValue("oklch(0.5 0.19 268)"));
  assert.ok(isSafeColorValue("#3366ff"));
  assert.ok(!isSafeColorValue("red; background:url(x)"));
  assert.ok(!isSafeColorValue("</style>"));
});

// Regression for the P2 dark-background bug: a Site's LIGHT override must land
// under :root ONLY (not stomp dark), and DARK overrides must scope to both the
// explicit [data-theme="dark"] and the OS-driven [data-theme="system"], so a
// token can hold DISTINCT values per mode and dark mode actually applies.
test("themeOverridesToCss scopes light to :root and dark to dark scopes", () => {
  const css = themeOverridesToCss(
    { surface: "#ffffff" },
    { surface: "#111111" },
  );
  assert.ok(css.includes(":root{--color-surface:#ffffff;}"));
  assert.ok(css.includes('[data-theme="dark"]{--color-surface:#111111;}'));
  assert.ok(
    css.includes(
      '@media (prefers-color-scheme:dark){[data-theme="system"]{--color-surface:#111111;}}',
    ),
  );
  // The light override must NOT appear inside a dark scope (would stomp dark).
  assert.ok(!css.includes('[data-theme="dark"]{--color-surface:#ffffff'));
});

test("themeOverridesToCss with only light overrides emits no dark scope", () => {
  const css = themeOverridesToCss({ surface: "#ffffff" });
  assert.equal(css, ":root{--color-surface:#ffffff;}");
});

test("themeOverridesToCss with no overrides is empty", () => {
  assert.equal(themeOverridesToCss({}, {}), "");
  assert.equal(themeOverridesToCss(undefined), "");
});
