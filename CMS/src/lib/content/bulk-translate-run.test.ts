/**
 * bulk-translate-missing runner + sweep core (node --test; no @/ imports):
 * sequential execution, requested-slot filtering, the one-shot retry, hard-stop
 * on failure, and the collection sweep's skip / partial-save / quota-abort /
 * per-item error tolerance. Executor + writer are injected fakes — every
 * assertion is on the module's OWN orchestration decisions (which calls were
 * made, what was saved, what the summary says), never on the fakes themselves.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runTranslatePlan,
  sweepTranslateItems,
  type SweepItem,
  type TranslateCallResult,
} from "./bulk-translate-run.ts";
import type { TranslateCall, TranslatePlan } from "./bulk-translate-plan.ts";
import type { CollectionField } from "./collection-schema.ts";
import type { ContentLocales } from "../render/localize.ts";

const LOCALES: ContentLocales = { default: "en", locales: ["en", "fi", "et"] };

const FIELDS: CollectionField[] = [
  { name: "title", type: "string", translatable: true },
  { name: "body", type: "text", translatable: true },
  { name: "price", type: "number" },
];

/** A scripted executor: pops the next result, records every call it saw. */
function fakeExec(script: TranslateCallResult[]) {
  const calls: TranslateCall[] = [];
  return {
    calls,
    exec: async (call: TranslateCall): Promise<TranslateCallResult> => {
      calls.push(call);
      const next = script.shift();
      if (!next) throw new Error("executor called more times than scripted");
      return next;
    },
  };
}

function okResult(translations: Record<string, Record<string, string>>): TranslateCallResult {
  return { ok: true, translations };
}

// ── runTranslatePlan ─────────────────────────────────────────────────────────

test("runTranslatePlan: empty plan makes no calls and reports nothing", async () => {
  const { calls, exec } = fakeExec([]);
  const outcome = await runTranslatePlan({ calls: [], skipped: [] }, exec);
  assert.equal(calls.length, 0);
  assert.deepEqual(outcome, { translations: {}, slotsFilled: 0, unfilled: [], failure: null });
});

test("runTranslatePlan: fully answered call needs no retry", async () => {
  const plan: TranslatePlan = {
    calls: [{ fields: { title: "Hello" }, toLocales: ["fi", "et"] }],
    skipped: [],
  };
  const { calls, exec } = fakeExec([okResult({ title: { fi: "Hei", et: "Tere" } })]);
  const seen: unknown[] = [];
  const outcome = await runTranslatePlan(plan, exec, (picked) => seen.push(picked));

  assert.equal(calls.length, 1);
  assert.deepEqual(outcome.translations, { title: { fi: "Hei", et: "Tere" } });
  assert.equal(outcome.slotsFilled, 2);
  assert.deepEqual(outcome.unfilled, []);
  assert.equal(outcome.failure, null);
  assert.deepEqual(seen, [{ title: { fi: "Hei", et: "Tere" } }]);
});

test("runTranslatePlan: extra fields/locales in a response are never applied", async () => {
  const plan: TranslatePlan = {
    calls: [{ fields: { title: "Hello" }, toLocales: ["fi"] }],
    skipped: [],
  };
  const { exec } = fakeExec([
    okResult({
      title: { fi: "Hei", et: "Tere", en: "Hello" }, // et/en not requested
      body: { fi: "hallucinated" }, // field not requested
    }),
  ]);
  const outcome = await runTranslatePlan(plan, exec);
  assert.deepEqual(outcome.translations, { title: { fi: "Hei" } });
  assert.equal(outcome.slotsFilled, 1);
});

test("runTranslatePlan: unanswered slots are retried once with exactly the leftovers", async () => {
  const plan: TranslatePlan = {
    calls: [{ fields: { title: "Hello", body: "World" }, toLocales: ["fi", "et"] }],
    skipped: [],
  };
  const { calls, exec } = fakeExec([
    // et for body missing, blank fi for body → both retried; title complete.
    okResult({ title: { fi: "Hei", et: "Tere" }, body: { fi: "  " } }),
    okResult({ body: { fi: "Maailma", et: "Maailm" } }),
  ]);
  const outcome = await runTranslatePlan(plan, exec);

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], { fields: { body: "World" }, toLocales: ["fi", "et"] });
  assert.deepEqual(outcome.translations, {
    title: { fi: "Hei", et: "Tere" },
    body: { fi: "Maailma", et: "Maailm" },
  });
  assert.equal(outcome.slotsFilled, 4);
  assert.deepEqual(outcome.unfilled, []);
  assert.equal(outcome.failure, null);
});

test("runTranslatePlan: slots the retry also misses are reported unfilled — no third call", async () => {
  const plan: TranslatePlan = {
    calls: [{ fields: { title: "Hello" }, toLocales: ["fi", "et"] }],
    skipped: [],
  };
  const { calls, exec } = fakeExec([
    okResult({ title: { fi: "Hei" } }),
    okResult({ title: {} }), // retry produces nothing
  ]);
  const outcome = await runTranslatePlan(plan, exec);

  assert.equal(calls.length, 2);
  assert.deepEqual(outcome.translations, { title: { fi: "Hei" } });
  assert.deepEqual(outcome.unfilled, [{ name: "title", locale: "et" }]);
  assert.equal(outcome.failure, null);
});

test("runTranslatePlan: hard failure stops the run — later calls never execute", async () => {
  const plan: TranslatePlan = {
    calls: [
      { fields: { title: "Hello" }, toLocales: ["fi"] },
      { fields: { body: "World" }, toLocales: ["et"] },
    ],
    skipped: [],
  };
  const { calls, exec } = fakeExec([{ ok: false, message: "AI request failed: boom" }]);
  const outcome = await runTranslatePlan(plan, exec);

  assert.equal(calls.length, 1);
  assert.deepEqual(outcome.failure, {
    message: "AI request failed: boom",
    quota: false,
    timeout: false,
  });
  assert.deepEqual(outcome.translations, {});
});

test("runTranslatePlan: a retry-call failure keeps the primary call's slots", async () => {
  const plan: TranslatePlan = {
    calls: [{ fields: { title: "Hello" }, toLocales: ["fi", "et"] }],
    skipped: [],
  };
  const { exec } = fakeExec([
    okResult({ title: { fi: "Hei" } }),
    { ok: false, message: "timed out", timeout: true },
  ]);
  const outcome = await runTranslatePlan(plan, exec);

  assert.deepEqual(outcome.translations, { title: { fi: "Hei" } });
  assert.deepEqual(outcome.failure, { message: "timed out", quota: false, timeout: true });
});

// ── sweepTranslateItems ──────────────────────────────────────────────────────

function fakeSave(failFor: Record<string, string> = {}) {
  const saved: { id: string; changes: Record<string, unknown> }[] = [];
  return {
    saved,
    save: async (id: string, changes: Record<string, unknown>) => {
      saved.push({ id, changes });
      return failFor[id] !== undefined
        ? ({ ok: false, message: failFor[id] } as const)
        : ({ ok: true } as const);
    },
  };
}

test("sweep: complete item is skipped without a model call; missing item is planned, run and saved", async () => {
  const items: SweepItem[] = [
    { id: "1", values: { title: { en: "Done", fi: "Valmis", et: "Tehtud" }, price: 3 } },
    { id: "2", values: { title: "Hello", body: { en: "World", fi: "Maailma" } } },
  ];
  const { calls, exec } = fakeExec([
    okResult({ title: { fi: "Hei", et: "Tere" } }),
    okResult({ body: { et: "Maailm" } }),
  ]);
  const { saved, save } = fakeSave();
  const progress: string[] = [];

  const summary = await sweepTranslateItems(items, FIELDS, LOCALES, {
    exec,
    save,
    onProgress: (done, total) => progress.push(`${done}/${total}`),
  });

  // Item 1 complete → zero calls for it; item 2 groups title(fi,et) + body(et).
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], { fields: { title: "Hello" }, toLocales: ["fi", "et"] });
  assert.deepEqual(calls[1], { fields: { body: "World" }, toLocales: ["et"] });

  // Save merges into the existing locale objects — nothing existing overwritten.
  assert.deepEqual(saved, [
    {
      id: "2",
      changes: {
        title: { en: "Hello", fi: "Hei", et: "Tere" },
        body: { en: "World", fi: "Maailma", et: "Maailm" },
      },
    },
  ]);

  assert.deepEqual(progress, ["1/2", "2/2"]);
  assert.deepEqual(summary, {
    updated: 1,
    translationsAdded: 3,
    skipped: 1,
    skippedFields: 0,
    failures: [],
    quotaStopped: false,
  });
});

test("sweep: one item's failure is recorded and the sweep continues", async () => {
  const items: SweepItem[] = [
    { id: "a", values: { title: "First" } },
    { id: "b", values: { title: "Second" } },
  ];
  const { exec } = fakeExec([
    { ok: false, message: "AI request failed: 502" },
    okResult({ title: { fi: "Toinen", et: "Teine" } }),
  ]);
  const { saved, save } = fakeSave();

  const summary = await sweepTranslateItems(items, FIELDS, LOCALES, { exec, save });

  assert.deepEqual(saved.map((s) => s.id), ["b"]);
  assert.equal(summary.updated, 1);
  assert.deepEqual(summary.failures, [{ id: "a", message: "AI request failed: 502" }]);
  assert.equal(summary.quotaStopped, false);
});

test("sweep: quota denial aborts — later items never planned or called", async () => {
  const items: SweepItem[] = [
    { id: "a", values: { title: "First" } },
    { id: "b", values: { title: "Second" } },
  ];
  const { calls, exec } = fakeExec([
    { ok: false, message: "monthly AI quota reached", quota: true },
  ]);
  const { saved, save } = fakeSave();

  const summary = await sweepTranslateItems(items, FIELDS, LOCALES, { exec, save });

  assert.equal(calls.length, 1);
  assert.equal(saved.length, 0);
  assert.equal(summary.quotaStopped, true);
  // The quota stop is reported via the flag, not as a per-item failure.
  assert.deepEqual(summary.failures, []);
});

test("sweep: partial slots produced before a mid-item failure are still saved", async () => {
  const items: SweepItem[] = [
    // Two groups → two calls: title(fi,et) and body(et).
    { id: "x", values: { title: "Hello", body: { en: "World", fi: "Maailma" } } },
  ];
  const { exec } = fakeExec([
    okResult({ title: { fi: "Hei", et: "Tere" } }),
    { ok: false, message: "stalled", timeout: true },
  ]);
  const { saved, save } = fakeSave();

  const summary = await sweepTranslateItems(items, FIELDS, LOCALES, { exec, save });

  // The paid-for title slots land; the item is ALSO reported failed (body call).
  assert.deepEqual(saved, [
    { id: "x", changes: { title: { en: "Hello", fi: "Hei", et: "Tere" } } },
  ]);
  assert.equal(summary.updated, 1);
  assert.equal(summary.translationsAdded, 2);
  assert.deepEqual(summary.failures, [{ id: "x", message: "stalled" }]);
});

test("sweep: save failure is recorded per item and doesn't count as updated", async () => {
  const items: SweepItem[] = [{ id: "x", values: { title: "Hello" } }];
  const { exec } = fakeExec([okResult({ title: { fi: "Hei", et: "Tere" } })]);
  const { save } = fakeSave({ x: "slug already exists" });

  const summary = await sweepTranslateItems(items, FIELDS, LOCALES, { exec, save });

  assert.equal(summary.updated, 0);
  assert.equal(summary.translationsAdded, 0);
  assert.deepEqual(summary.failures, [{ id: "x", message: "slug already exists" }]);
});

test("sweep: slots unfilled after retry mark the item failed but keep what arrived", async () => {
  const items: SweepItem[] = [{ id: "x", values: { title: "Hello" } }];
  const { calls, exec } = fakeExec([
    okResult({ title: { fi: "Hei" } }),
    okResult({}), // retry for et yields nothing
  ]);
  const { saved, save } = fakeSave();

  const summary = await sweepTranslateItems(items, FIELDS, LOCALES, { exec, save });

  assert.equal(calls.length, 2);
  assert.deepEqual(saved, [{ id: "x", changes: { title: { en: "Hello", fi: "Hei" } } }]);
  assert.equal(summary.updated, 1);
  assert.equal(summary.failures.length, 1);
  assert.match(summary.failures[0].message, /1 translation\(s\) still missing/);
});

test("sweep: planner-skipped fields (empty/oversized source) are counted", async () => {
  const items: SweepItem[] = [
    // body's source is over the 16KB/field route cap → the planner skips it.
    { id: "x", values: { title: "Hello", body: "x".repeat(17 * 1024) } },
  ];
  const { exec } = fakeExec([okResult({ title: { fi: "Hei", et: "Tere" } })]);
  const { save } = fakeSave();

  const summary = await sweepTranslateItems(items, FIELDS, LOCALES, { exec, save });

  assert.equal(summary.skippedFields, 1);
  assert.equal(summary.updated, 1);
});

test("sweep: single content locale plans nothing — no calls, everything skipped", async () => {
  const single: ContentLocales = { default: "en", locales: ["en"] };
  const items: SweepItem[] = [{ id: "x", values: { title: "Hello" } }];
  const { calls, exec } = fakeExec([]);
  const { saved, save } = fakeSave();

  const summary = await sweepTranslateItems(items, FIELDS, single, { exec, save });

  assert.equal(calls.length, 0);
  assert.equal(saved.length, 0);
  assert.equal(summary.skipped, 1);
});
