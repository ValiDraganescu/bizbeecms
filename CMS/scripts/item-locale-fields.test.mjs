/**
 * translatable-collections — Slice 5: PURE item-editor locale helpers.
 *
 * Draft read/write per locale + AI-translate merge, sharing the page-builder
 * collapse rule so a value round-trips identically between the two editors.
 *
 * Dep-free `node --test`; imports the REAL .ts via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  toLocalizedDraft,
  draftLocaleText,
  setDraftLocaleText,
  mergeItemTranslations,
} from "../src/lib/content/item-locale-fields.ts";

const LOCALES = ["en", "fi", "et"];

// ── toLocalizedDraft ─────────────────────────────────────────────────────────
test("toLocalizedDraft: a parsed locale object is kept verbatim", () => {
  const obj = { en: "Cosy", fi: "Viihtyisä" };
  assert.deepEqual(toLocalizedDraft(obj), obj);
});

test("toLocalizedDraft: a bare string (legacy/default-only) is kept as a string", () => {
  assert.equal(toLocalizedDraft("Legacy"), "Legacy");
});

test("toLocalizedDraft: null / number / array → empty string", () => {
  assert.equal(toLocalizedDraft(null), "");
  assert.equal(toLocalizedDraft(42), "");
  assert.equal(toLocalizedDraft(["a"]), "");
});

// ── draftLocaleText ──────────────────────────────────────────────────────────
test("draftLocaleText: reads the right locale; a bare string is the default only", () => {
  assert.equal(draftLocaleText({ en: "A", fi: "B" }, "fi", "en"), "B");
  assert.equal(draftLocaleText("Solo", "en", "en"), "Solo");
  assert.equal(draftLocaleText("Solo", "fi", "en"), "", "a bare string has no non-default locale");
});

// ── setDraftLocaleText (collapse rule) ───────────────────────────────────────
test("setDraftLocaleText: single default-locale value collapses to a bare string", () => {
  assert.equal(setDraftLocaleText("", "en", "Hello", LOCALES), "Hello");
});

test("setDraftLocaleText: a second locale makes it an object; empties are dropped", () => {
  const one = setDraftLocaleText("Hello", "fi", "Hei", LOCALES);
  assert.deepEqual(one, { en: "Hello", fi: "Hei" });
  // Clearing the non-default locale collapses back to the bare default.
  assert.equal(setDraftLocaleText(one, "fi", "", LOCALES), "Hello");
});

test("setDraftLocaleText: a single non-default locale stays an object", () => {
  assert.deepEqual(setDraftLocaleText("", "fi", "Vain", LOCALES), { fi: "Vain" });
});

// ── mergeItemTranslations ────────────────────────────────────────────────────
test("mergeItemTranslations: merges this field's per-locale map, keeping the default", () => {
  const draft = "Cosy bistro"; // default-only
  const translations = { name: { fi: "Viihtyisä bistro", et: "Hubane bistroo" } };
  const merged = mergeItemTranslations(draft, "name", translations, LOCALES);
  assert.deepEqual(merged, { en: "Cosy bistro", fi: "Viihtyisä bistro", et: "Hubane bistroo" });
});

test("mergeItemTranslations: ignores a field that isn't in the response", () => {
  const draft = { en: "A" };
  assert.equal(mergeItemTranslations(draft, "missing", { other: { fi: "X" } }, LOCALES), draft);
});

test("mergeItemTranslations: skips empty/unknown-locale entries", () => {
  const merged = mergeItemTranslations("A", "name", { name: { fi: "", xx: "junk", et: "Eesti" } }, LOCALES);
  // fi empty → skipped; xx not a site locale → skipped; et applied.
  assert.deepEqual(merged, { en: "A", et: "Eesti" });
});
