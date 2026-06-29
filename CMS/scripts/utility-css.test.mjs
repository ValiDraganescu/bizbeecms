/**
 * Dep-free tests for the custom (non-Tailwind) renderer CSS.
 * Run: node --test scripts/utility-css.test.mjs
 *
 * The Tailwind allowlist is gone (pages compile real Tailwind at request time,
 * see tw-compile.ts). What remains here is the per-viewport hide helpers, which
 * Tailwind would never emit (they're not utilities) and so must be appended
 * verbatim to each page's compiled sheet.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { viewportHideCss } from "../src/lib/render/utility-css.ts";

test("emits one single-band @media display:none per viewport", () => {
  const css = viewportHideCss();
  assert.ok(css.includes("@media (max-width:767px){.pb-hide-mobile{display:none}}"));
  assert.ok(
    css.includes(
      "@media (min-width:768px) and (max-width:1023px){.pb-hide-tablet{display:none}}",
    ),
  );
  assert.ok(css.includes("@media (min-width:1024px){.pb-hide-desktop{display:none}}"));
});

test("pure/deterministic — identical output across calls", () => {
  assert.equal(viewportHideCss(), viewportHideCss());
});
