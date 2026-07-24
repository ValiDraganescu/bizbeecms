/**
 * bulk-translate-missing planner (node --test; no @/ imports): grouping,
 * chunking, skip reporting, the missing-slot matrix, response filtering and the
 * one-shot retry plan. Everything pure — no model, no D1.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planTranslateCalls,
  missingLocaleSlots,
  collectionItemPlanEntries,
  pickRequestedSlots,
  retryPlan,
  CALL_BUDGET_UNITS,
} from "./bulk-translate-plan.ts";
import { MAX_FIELD_TEXT_BYTES } from "../chat/translate-request.ts";
import type { CollectionField } from "./collection-schema.ts";
import type { ContentLocales } from "../render/localize.ts";

const LOCALES: ContentLocales = { default: "en", locales: ["en", "fi", "et"] };
const SINGLE: ContentLocales = { default: "en", locales: ["en"] };

// ── planTranslateCalls: grouping ─────────────────────────────────────────────

test("planTranslateCalls: identical target sets collapse to one call", () => {
  const plan = planTranslateCalls([
    { name: "title", sourceText: "Hello", targetLocales: ["fi", "et"] },
    { name: "body", sourceText: "World", targetLocales: ["fi", "et"] },
  ]);
  assert.deepEqual(plan, {
    calls: [{ fields: { title: "Hello", body: "World" }, toLocales: ["fi", "et"] }],
    skipped: [],
  });
});

test("planTranslateCalls: different target sets go in separate calls, first-appearance order", () => {
  const plan = planTranslateCalls([
    { name: "a", sourceText: "A", targetLocales: ["fi", "et"] },
    { name: "b", sourceText: "B", targetLocales: ["fi"] },
    { name: "c", sourceText: "C", targetLocales: ["fi", "et"] },
  ]);
  assert.deepEqual(plan.calls, [
    { fields: { a: "A", c: "C" }, toLocales: ["fi", "et"] },
    { fields: { b: "B" }, toLocales: ["fi"] },
  ]);
  assert.deepEqual(plan.skipped, []);
});

test("planTranslateCalls: target-set grouping is order-insensitive", () => {
  const plan = planTranslateCalls([
    { name: "a", sourceText: "A", targetLocales: ["fi", "et"] },
    { name: "b", sourceText: "B", targetLocales: ["et", "fi"] },
  ]);
  assert.equal(plan.calls.length, 1);
  assert.deepEqual(plan.calls[0].fields, { a: "A", b: "B" });
  // First-seen locale order wins for the call.
  assert.deepEqual(plan.calls[0].toLocales, ["fi", "et"]);
});

test("planTranslateCalls: empty target set is ignored (nothing missing, not an error)", () => {
  const plan = planTranslateCalls([
    { name: "done", sourceText: "Translated already", targetLocales: [] },
  ]);
  assert.deepEqual(plan, { calls: [], skipped: [] });
});

test("planTranslateCalls: empty input plans zero calls", () => {
  assert.deepEqual(planTranslateCalls([]), { calls: [], skipped: [] });
});

// ── planTranslateCalls: skips ────────────────────────────────────────────────

test("planTranslateCalls: empty and whitespace-only sources are skipped + reported", () => {
  const plan = planTranslateCalls([
    { name: "empty", sourceText: "", targetLocales: ["fi"] },
    { name: "blank", sourceText: "  \n\t", targetLocales: ["fi"] },
    { name: "ok", sourceText: "Text", targetLocales: ["fi"] },
  ]);
  assert.deepEqual(plan.calls, [{ fields: { ok: "Text" }, toLocales: ["fi"] }]);
  assert.deepEqual(plan.skipped, [
    { name: "empty", reason: "empty-source" },
    { name: "blank", reason: "empty-source" },
  ]);
});

test("planTranslateCalls: source over the per-field byte cap is skipped + reported", () => {
  const plan = planTranslateCalls([
    { name: "huge", sourceText: "x".repeat(MAX_FIELD_TEXT_BYTES + 1), targetLocales: ["fi"] },
    { name: "max", sourceText: "x".repeat(MAX_FIELD_TEXT_BYTES), targetLocales: ["fi"] },
  ]);
  assert.deepEqual(plan.skipped, [{ name: "huge", reason: "oversized-source" }]);
  assert.equal(plan.calls.length, 1);
  assert.deepEqual(Object.keys(plan.calls[0].fields), ["max"]);
});

test("planTranslateCalls: the byte cap counts UTF-8 bytes, not characters", () => {
  // "€" is 3 bytes → 6000 chars = 18000 bytes > 16384.
  const plan = planTranslateCalls([
    { name: "euros", sourceText: "€".repeat(6000), targetLocales: ["fi"] },
  ]);
  assert.deepEqual(plan.calls, []);
  assert.deepEqual(plan.skipped, [{ name: "euros", reason: "oversized-source" }]);
});

// ── planTranslateCalls: chunking ─────────────────────────────────────────────

test("planTranslateCalls: a group exactly at the budget stays one call", () => {
  // cost = srcBytes × targetCount; two targets → 4000-byte source costs 8000.
  const half = CALL_BUDGET_UNITS / 2 / 2; // 4000 bytes each
  const plan = planTranslateCalls([
    { name: "a", sourceText: "a".repeat(half), targetLocales: ["fi", "et"] },
    { name: "b", sourceText: "b".repeat(half), targetLocales: ["fi", "et"] },
  ]);
  assert.equal(plan.calls.length, 1);
  assert.deepEqual(Object.keys(plan.calls[0].fields), ["a", "b"]);
});

test("planTranslateCalls: one unit over the budget splits the group", () => {
  const half = CALL_BUDGET_UNITS / 2 / 2;
  const plan = planTranslateCalls([
    { name: "a", sourceText: "a".repeat(half), targetLocales: ["fi", "et"] },
    { name: "b", sourceText: "b".repeat(half + 1), targetLocales: ["fi", "et"] },
  ]);
  assert.equal(plan.calls.length, 2);
  assert.deepEqual(Object.keys(plan.calls[0].fields), ["a"]);
  assert.deepEqual(Object.keys(plan.calls[1].fields), ["b"]);
  // Both chunks carry the group's full locale set.
  assert.deepEqual(plan.calls[0].toLocales, ["fi", "et"]);
  assert.deepEqual(plan.calls[1].toLocales, ["fi", "et"]);
});

test("planTranslateCalls: a lone over-budget entry still gets its own call", () => {
  // 10000 bytes × 3 targets = 30000 units > budget, but a field is atomic and
  // it's under the per-field cap → must be called, not dropped.
  const plan = planTranslateCalls([
    { name: "big", sourceText: "x".repeat(10_000), targetLocales: ["fi", "et", "sv"] },
  ]);
  assert.equal(plan.calls.length, 1);
  assert.deepEqual(plan.skipped, []);
});

test("planTranslateCalls: chunking is per-group (mixed sets don't share a budget window)", () => {
  const q = CALL_BUDGET_UNITS / 2; // 8000 bytes at 1 target = half budget
  const plan = planTranslateCalls([
    { name: "a1", sourceText: "a".repeat(q), targetLocales: ["fi"] },
    { name: "b1", sourceText: "b".repeat(q), targetLocales: ["et"] },
    { name: "a2", sourceText: "a".repeat(q), targetLocales: ["fi"] },
    { name: "b2", sourceText: "b".repeat(q), targetLocales: ["et"] },
  ]);
  // Each group fits its own single call (2 × 8000 = 16000 = budget).
  assert.deepEqual(plan.calls, [
    { fields: { a1: "a".repeat(q), a2: "a".repeat(q) }, toLocales: ["fi"] },
    { fields: { b1: "b".repeat(q), b2: "b".repeat(q) }, toLocales: ["et"] },
  ]);
});

// ── missingLocaleSlots ───────────────────────────────────────────────────────

test("missingLocaleSlots: bare string = default-only → all non-default locales missing", () => {
  assert.deepEqual(missingLocaleSlots("Hello", LOCALES), {
    sourceText: "Hello",
    missing: ["fi", "et"],
  });
});

test("missingLocaleSlots: blank bare string has nothing to translate from", () => {
  assert.deepEqual(missingLocaleSlots("", LOCALES), { sourceText: "", missing: [] });
  assert.deepEqual(missingLocaleSlots("   ", LOCALES), { sourceText: "   ", missing: [] });
});

test("missingLocaleSlots: locale object — absent and blank slots are missing, filled are not", () => {
  const value = { en: "Hello", fi: "Hei", et: "  " };
  assert.deepEqual(missingLocaleSlots(value, LOCALES), {
    sourceText: "Hello",
    missing: ["et"],
  });
});

test("missingLocaleSlots: fully translated locale object → nothing missing", () => {
  const value = { en: "Hello", fi: "Hei", et: "Tere" };
  assert.deepEqual(missingLocaleSlots(value, LOCALES), { sourceText: "Hello", missing: [] });
});

test("missingLocaleSlots: locale object without default-locale text → nothing to translate from", () => {
  assert.deepEqual(missingLocaleSlots({ fi: "Hei" }, LOCALES), {
    sourceText: "",
    missing: [],
  });
  assert.deepEqual(missingLocaleSlots({ en: "", fi: "Hei" }, LOCALES), {
    sourceText: "",
    missing: [],
  });
});

test("missingLocaleSlots: non-text values are never missing", () => {
  for (const value of [null, undefined, 42, true, ["en"], { nested: { en: "x" } }]) {
    assert.deepEqual(missingLocaleSlots(value, LOCALES).missing, []);
  }
});

test("missingLocaleSlots: single-locale site never has missing slots", () => {
  assert.deepEqual(missingLocaleSlots("Hello", SINGLE), { sourceText: "", missing: [] });
  assert.deepEqual(missingLocaleSlots({ en: "Hello" }, SINGLE), { sourceText: "", missing: [] });
});

// ── collectionItemPlanEntries ────────────────────────────────────────────────

const FIELDS: CollectionField[] = [
  { name: "title", type: "string", translatable: true },
  { name: "body", type: "richtext", translatable: true },
  { name: "notes", type: "text" }, // not opted in
  { name: "price", type: "number", translatable: true }, // wrong type — not translatable
];

test("collectionItemPlanEntries: only translatable fields with missing slots become entries", () => {
  const entries = collectionItemPlanEntries(
    {
      title: "Hello", // bare string → fi+et missing
      body: { en: "Long text", fi: "Pitkä teksti" }, // et missing
      notes: "ignored", // field not translatable
      price: 12, // type not translatable
    },
    FIELDS,
    LOCALES,
  );
  assert.deepEqual(entries, [
    { name: "title", sourceText: "Hello", targetLocales: ["fi", "et"] },
    { name: "body", sourceText: "Long text", targetLocales: ["et"] },
  ]);
});

test("collectionItemPlanEntries: a fully translated item produces no entries", () => {
  const entries = collectionItemPlanEntries(
    { title: { en: "Hi", fi: "Hei", et: "Tere" }, body: { en: "B", fi: "B", et: "B" } },
    FIELDS,
    LOCALES,
  );
  assert.deepEqual(entries, []);
});

test("collectionItemPlanEntries: absent/empty values produce no entries", () => {
  const entries = collectionItemPlanEntries({ title: "", body: null }, FIELDS, LOCALES);
  assert.deepEqual(entries, []);
});

test("collectionItemPlanEntries → planTranslateCalls: single-locale site plans zero calls", () => {
  const entries = collectionItemPlanEntries({ title: "Hello", body: "World" }, FIELDS, SINGLE);
  assert.deepEqual(planTranslateCalls(entries), { calls: [], skipped: [] });
});

test("collectionItemPlanEntries → planTranslateCalls: common case is ONE call for the item", () => {
  // A new locale was added → every translated field misses exactly {et}.
  const entries = collectionItemPlanEntries(
    { title: { en: "Hi", fi: "Hei" }, body: { en: "Text", fi: "Teksti" } },
    FIELDS,
    LOCALES,
  );
  const plan = planTranslateCalls(entries);
  assert.deepEqual(plan.calls, [
    { fields: { title: "Hi", body: "Text" }, toLocales: ["et"] },
  ]);
});

// ── pickRequestedSlots ───────────────────────────────────────────────────────

const CALL = { fields: { title: "Hello", body: "World" }, toLocales: ["fi", "et"] };

test("pickRequestedSlots: keeps exactly the requested field × locale slots", () => {
  const out = pickRequestedSlots(
    {
      title: { fi: "Hei", et: "Tere" },
      body: { fi: "Maailma", et: "Maailm" },
    },
    CALL,
  );
  assert.deepEqual(out, {
    title: { fi: "Hei", et: "Tere" },
    body: { fi: "Maailma", et: "Maailm" },
  });
});

test("pickRequestedSlots: drops extra fields, extra locales and the source-locale seed", () => {
  const out = pickRequestedSlots(
    {
      title: { en: "Hello", fi: "Hei", et: "Tere", sv: "Hej" }, // en seed + sv extra
      hacked: { fi: "nope" }, // field never requested
    },
    CALL,
  );
  assert.deepEqual(out, { title: { fi: "Hei", et: "Tere" } });
});

test("pickRequestedSlots: drops blank strings and non-strings", () => {
  const out = pickRequestedSlots(
    { title: { fi: "", et: "  " }, body: { fi: 7, et: "Ok" } },
    CALL,
  );
  assert.deepEqual(out, { body: { et: "Ok" } });
});

test("pickRequestedSlots: null/garbage response → empty result", () => {
  assert.deepEqual(pickRequestedSlots(null, CALL), {});
  assert.deepEqual(pickRequestedSlots(undefined, CALL), {});
});

// ── retryPlan ────────────────────────────────────────────────────────────────

test("retryPlan: fully answered call retries nothing", () => {
  const plan = retryPlan(CALL, {
    title: { fi: "Hei", et: "Tere" },
    body: { fi: "Maailma", et: "Maailm" },
  });
  assert.deepEqual(plan, { calls: [], skipped: [] });
});

test("retryPlan: requested minus returned, regrouped by remaining locale set", () => {
  // title got both; body got only fi → retry is body×{et} alone.
  const plan = retryPlan(CALL, {
    title: { fi: "Hei", et: "Tere" },
    body: { fi: "Maailma" },
  });
  assert.deepEqual(plan.calls, [{ fields: { body: "World" }, toLocales: ["et"] }]);
  assert.deepEqual(plan.skipped, []);
});

test("retryPlan: divergent per-field misses split into separate calls", () => {
  const plan = retryPlan(CALL, {
    title: { fi: "Hei" }, // et missing
    body: { et: "Maailm" }, // fi missing
  });
  assert.deepEqual(plan.calls, [
    { fields: { title: "Hello" }, toLocales: ["et"] },
    { fields: { body: "World" }, toLocales: ["fi"] },
  ]);
});

test("retryPlan: field absent from the response retries all its locales; blank counts as missing", () => {
  const plan = retryPlan(CALL, { title: { fi: "", et: "Tere" } });
  assert.deepEqual(plan.calls, [
    { fields: { title: "Hello" }, toLocales: ["fi"] },
    { fields: { body: "World" }, toLocales: ["fi", "et"] },
  ]);
});

test("retryPlan: no response at all retries the entire call", () => {
  const plan = retryPlan(CALL, null);
  assert.deepEqual(plan.calls, [
    { fields: { title: "Hello", body: "World" }, toLocales: ["fi", "et"] },
  ]);
});
