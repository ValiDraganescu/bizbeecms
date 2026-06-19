/**
 * Dep-free tests for the precompiled utility CSS (Milestone 2, epic A3).
 * Run: node --test scripts/utility-css.test.mjs
 *
 * Imports the .ts module directly via Node native type-stripping (project
 * convention — no @/ alias, no React/D1/CF imports; that's why utility-css.ts
 * is a pure string-builder).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  utilityRules,
  allowedClasses,
  generateUtilityCss,
} from "../src/lib/render/utility-css.ts";

test("generator is pure/deterministic — identical output across calls", () => {
  assert.equal(generateUtilityCss(), generateUtilityCss());
});

test("every rule becomes exactly one CSS block in the sheet", () => {
  const rules = utilityRules();
  const css = generateUtilityCss();
  // One `{...}` block per rule. The 3 per-viewport hide rules each emit an
  // EXTRA inner block (`@media …{.cls{display:none}}`) on top of utilityRules.
  const blocks = css.match(/\.[a-z0-9\\:-]+\{[^}]*\}/g) ?? [];
  assert.equal(blocks.length, rules.length + 3);
});

test("per-viewport hide classes emit a single-band @media display:none", () => {
  const css = generateUtilityCss();
  assert.ok(
    css.includes("@media (max-width:767px){.pb-hide-mobile{display:none}}"),
    "missing pb-hide-mobile media rule",
  );
  assert.ok(
    css.includes(
      "@media (min-width:768px) and (max-width:1023px){.pb-hide-tablet{display:none}}",
    ),
    "missing pb-hide-tablet media rule",
  );
  assert.ok(
    css.includes("@media (min-width:1024px){.pb-hide-desktop{display:none}}"),
    "missing pb-hide-desktop media rule",
  );
  // They're allowed classes too (so docs/validation know about them).
  const allowed = allowedClasses();
  for (const c of ["pb-hide-mobile", "pb-hide-tablet", "pb-hide-desktop"]) {
    assert.ok(allowed.has(c), `${c} not in allowedClasses()`);
  }
});

test("vocabulary is non-trivial and has no duplicate class names", () => {
  const rules = utilityRules();
  assert.ok(rules.length > 100, `expected a substantial vocabulary, got ${rules.length}`);
  const names = rules.map((r) => r.cls);
  assert.equal(new Set(names).size, names.length, "duplicate class names present");
});

test("color utilities reference the SAME purpose CSS vars as globals.css", () => {
  const css = generateUtilityCss();
  // Spot-check the core purpose tokens are wired to their --color-* var.
  for (const [cls, decl] of [
    [".text-foreground", "color:var(--color-foreground)"],
    [".bg-surface", "background-color:var(--color-surface)"],
    [".bg-primary", "background-color:var(--color-primary)"],
    [".border-border", "border-color:var(--color-border)"],
    [".text-danger", "color:var(--color-danger)"],
  ]) {
    assert.ok(css.includes(`${cls}{${decl}}`), `missing rule: ${cls}{${decl}}`);
  }
});

test("color utilities NEVER emit raw color literals (purpose-token rule)", () => {
  const css = generateUtilityCss();
  // No hex, no oklch literals, no Tailwind color-name scales in color decls.
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css.replace(/rgb\([^)]*\)/g, "")), "hex literal found");
  assert.ok(!/oklch\(/.test(css), "oklch literal found (use the var)");
  assert.ok(!/\b(blue|red|green|gray|slate|indigo)-\d{2,3}\b/.test(css), "color-scale name found");
});

test("common layout/typography/spacing classes are in the vocabulary", () => {
  const allowed = allowedClasses();
  for (const cls of [
    "flex", "grid", "hidden", "flex-col", "items-center", "justify-between",
    "gap-4", "p-4", "px-6", "mx-auto", "mt-2", "w-full", "max-w-3xl",
    "text-2xl", "font-bold", "text-center", "leading-relaxed", "truncate",
    "rounded", "rounded-lg", "border", "shadow-md", "relative", "overflow-hidden",
  ]) {
    assert.ok(allowed.has(cls), `expected "${cls}" in allowed vocabulary`);
  }
});

test("selectors are valid and start with a dot + class name", () => {
  const css = generateUtilityCss();
  for (const line of css.split("\n")) {
    // Either a plain `.cls{decl}` rule, or a per-viewport `@media …{.cls{decl}}`.
    const ok =
      /^\.[a-zA-Z0-9\\-]+\{[^{}]+\}$/.test(line) ||
      /^@media [^{]+\{\.[a-zA-Z0-9\\-]+\{[^{}]+\}\}$/.test(line);
    assert.ok(ok, `bad CSS line: ${line}`);
  }
});

test("PROOF of A3: a class never written in JSX still gets CSS", () => {
  // `bg-primary-subtle` + `max-w-prose` are valid AI vocabulary that the
  // existing app source does not reference — the build scanner would miss them,
  // but the generated sheet covers them.
  const css = generateUtilityCss();
  assert.ok(css.includes(".bg-primary-subtle{background-color:var(--color-primary-subtle)}"));
  assert.ok(css.includes(".max-w-prose{max-width:65ch}"));
});
