import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_THEME,
  THEME_PRESETS,
  THEME_TOKENS,
  isSafeColorValue,
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
