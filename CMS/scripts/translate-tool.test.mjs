/**
 * Dep-free unit tests for the translate tool's pure parts (epic B4):
 *  - validateTranslationInput / mergePageFields (lib/chat/translate-tool.ts)
 * Run: node --test scripts/translate-tool.test.mjs
 *
 * Imports the TS modules directly via Node type-stripping (project convention;
 * no @/ alias — translate-tool.ts imports render/localize.ts relatively).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateTranslationInput,
  mergePageFields,
  CREATE_TRANSLATION_TOOL,
} from "../src/lib/chat/translate-tool.ts";

// ── tool schema ──────────────────────────────────────────────────────────────
test("CREATE_TRANSLATION_TOOL: well-formed OpenAI function schema", () => {
  assert.equal(CREATE_TRANSLATION_TOOL.type, "function");
  assert.equal(CREATE_TRANSLATION_TOOL.function.name, "translate");
  assert.deepEqual(CREATE_TRANSLATION_TOOL.function.parameters.required, [
    "kind",
    "target",
    "fields",
  ]);
});

// ── validator happy paths ────────────────────────────────────────────────────
test("validate: accepts a minimal page translation", () => {
  const res = validateTranslationInput({
    kind: "page",
    target: "pricing",
    fields: { metaTitle: { en: "Pricing", fi: "Hinnoittelu" } },
  });
  assert.equal(res.ok, true);
  assert.equal(res.input.kind, "page");
  assert.equal(res.input.target, "pricing");
  assert.deepEqual(res.input.fields.metaTitle, { en: "Pricing", fi: "Hinnoittelu" });
});

test("validate: lowercases (normalizes) locale codes", () => {
  const res = validateTranslationInput({
    kind: "page",
    target: "home",
    fields: { metaTitle: { EN: "Home", FI: "Koti" } },
  });
  assert.equal(res.ok, true);
  assert.deepEqual(res.input.fields.metaTitle, { en: "Home", fi: "Koti" });
});

test("validate: accepts fields as a JSON string (open-model shape)", () => {
  const res = validateTranslationInput({
    kind: "page",
    target: "home",
    fields: JSON.stringify({ "hero1.title": { en: "Hi", fi: "Moi" } }),
  });
  assert.equal(res.ok, true);
  assert.deepEqual(res.input.fields["hero1.title"], { en: "Hi", fi: "Moi" });
});

// ── validator: allowedLocales gating (the C1 link) ──────────────────────────
test("validate: rejects locales not in the site's configured set", () => {
  const res = validateTranslationInput(
    { kind: "page", target: "home", fields: { metaTitle: { en: "Hi", de: "Hallo" } } },
    { allowedLocales: ["en", "fi"] },
  );
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("de") && e.includes("configured")));
});

test("validate: allows configured locales when constrained", () => {
  const res = validateTranslationInput(
    { kind: "page", target: "home", fields: { metaTitle: { en: "Hi", fi: "Moi" } } },
    { allowedLocales: ["en", "fi"] },
  );
  assert.equal(res.ok, true);
});

// ── validator: shape errors ──────────────────────────────────────────────────
test("validate: rejects bad kind", () => {
  const res = validateTranslationInput({ kind: "thing", target: "x", fields: { a: { en: "y" } } });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("kind")));
});

test("validate: rejects empty target", () => {
  const res = validateTranslationInput({ kind: "page", target: "  ", fields: { a: { en: "y" } } });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("target")));
});

test("validate: rejects empty fields", () => {
  const res = validateTranslationInput({ kind: "page", target: "home", fields: {} });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("at least one field")));
});

test("validate: rejects invalid locale code and non-string value", () => {
  const res = validateTranslationInput({
    kind: "page",
    target: "home",
    fields: { metaTitle: { "not a locale": "x" }, metaDescription: { en: 42 } },
  });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("not a valid locale code")));
  assert.ok(res.errors.some((e) => e.includes("must be a string")));
});

test("validate: non-object args rejected", () => {
  assert.equal(validateTranslationInput(null).ok, false);
  assert.equal(validateTranslationInput("nope").ok, false);
});

// ── mergePageFields (pure) ───────────────────────────────────────────────────
const docOf = () => ({
  blocks: [
    { id: "hero", component: "Hero", props: { title: { en: "Welcome" } } },
    {
      id: "sec",
      component: "Section",
      children: [{ id: "cta", component: "Cta", props: {} }],
    },
  ],
  metaTitle: { en: "Home" },
  metaDescription: {},
});

test("merge: meta fields merge (preserving existing locales)", () => {
  const out = mergePageFields(docOf(), {
    metaTitle: { fi: "Koti" },
    metaDescription: { en: "A page", fi: "Sivu" },
  });
  assert.deepEqual(out.errors, []);
  assert.equal(out.applied, 2);
  assert.deepEqual(out.metaTitle, { en: "Home", fi: "Koti" });
  assert.deepEqual(out.metaDescription, { en: "A page", fi: "Sivu" });
});

test("merge: block prop becomes a locale object, merging existing", () => {
  const out = mergePageFields(docOf(), { "hero.title": { fi: "Tervetuloa" } });
  assert.deepEqual(out.errors, []);
  assert.equal(out.applied, 1);
  assert.deepEqual(out.blocks[0].props.title, { en: "Welcome", fi: "Tervetuloa" });
});

test("merge: sets a prop on a nested child block with no prior value", () => {
  const out = mergePageFields(docOf(), { "cta.label": { en: "Go", fi: "Mene" } });
  assert.deepEqual(out.errors, []);
  assert.equal(out.applied, 1);
  assert.deepEqual(out.blocks[1].children[0].props.label, { en: "Go", fi: "Mene" });
});

test("merge: unknown meta field / missing block / bad path are reported", () => {
  const out = mergePageFields(docOf(), {
    nope: { en: "x" },
    "ghost.title": { en: "x" },
    "badpath": { en: "x" },
  });
  assert.equal(out.applied, 0);
  assert.equal(out.errors.length, 3);
  assert.ok(out.errors.some((e) => e.includes('unknown field "nope"')));
  assert.ok(out.errors.some((e) => e.includes('block "ghost" not found')));
  assert.ok(out.errors.some((e) => e.includes('unknown field "badpath"')));
});

test("merge: does not mutate the input doc", () => {
  const doc = docOf();
  mergePageFields(doc, { metaTitle: { fi: "Koti" }, "hero.title": { fi: "x" } });
  assert.deepEqual(doc.metaTitle, { en: "Home" });
  assert.deepEqual(doc.blocks[0].props.title, { en: "Welcome" });
});
