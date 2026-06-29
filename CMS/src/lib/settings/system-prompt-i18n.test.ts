/**
 * The system prompt's multi-locale (i18n) guidance: translatable props are marked
 * `(t)` in each component line, and a >1-locale Site gets an explicit rule to fill
 * translatable BLOCK props as a locale object covering every language.
 *
 * Relative `.ts` import — `node --test` can't resolve the `@/` alias (CAVEATS).
 * Run: npx tsc --noEmit && node --test src/lib/settings/system-prompt-i18n.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt } from "./site-settings.ts";

const hero = {
  name: "Hero",
  props: [
    { name: "title", type: "string", translatable: true },
    { name: "backgroundImage", type: "string" },
  ],
};

test("translatable props are marked (t); non-translatable are not", () => {
  const out = buildSystemPrompt({ components: [hero], locales: ["en", "fi", "et"] });
  // The component line shows the (t) marker on the translatable prop only.
  assert.match(out, /title: string \(t\)/);
  // backgroundImage has no (t): it's followed by the line-closing ` }`, not ` (t)`.
  assert.match(out, /backgroundImage: string \}/);
});

test("a >1-locale Site gets the fill-every-locale rule with a locale-object example", () => {
  const out = buildSystemPrompt({ components: [hero], locales: ["en", "fi", "et"] });
  assert.match(out, /3 languages: en, fi, et/);
  // The example must show a locale object spanning all locales (the working path).
  assert.match(out, /"en":"…", "fi":"…", "et":"…"/);
  // And it must NOT promise a "set default then translate later" flow for blocks.
  assert.match(out, /Do NOT set just the en string/);
});

test("a single-locale Site gets NO i18n rule (no locale noise)", () => {
  const out = buildSystemPrompt({ components: [hero], locales: ["en"] });
  assert.doesNotMatch(out, /languages:/);
  // The (t) marker still renders — it's just informational with one locale.
  assert.match(out, /title: string \(t\)/);
});

test("omitting locales entirely is safe (no rule, no throw)", () => {
  const out = buildSystemPrompt({ components: [hero] });
  assert.doesNotMatch(out, /languages:/);
});
