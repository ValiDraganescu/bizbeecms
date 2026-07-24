/**
 * bulk-translate-missing — the PURE plan runner + collection sweep core.
 *
 * The T1 planner (`bulk-translate-plan.ts`) decides WHAT to call; this module
 * decides the ORDER and BOOKKEEPING of actually running a plan:
 *
 *   - `runTranslatePlan` executes one plan's calls sequentially through an
 *     injected executor, keeps only the slots each call actually requested
 *     (`pickRequestedSlots`), retries a partially-answered call ONCE
 *     (`retryPlan`, AC9), and reports what got filled / what didn't / what
 *     hard-failed. The item-level button and the page-builder action (T3) run
 *     this directly, applying slots into their draft as they arrive.
 *
 *   - `sweepTranslateItems` runs the collection-level "Translate all missing"
 *     over a list of item IDS: fetch each item FRESH through an injected
 *     reader immediately before planning it (the enumeration can be minutes
 *     old by then — planning/merging from a stale base would wholesale-revert
 *     a concurrent edit), plan (an already-complete item is skipped WITHOUT a
 *     model call, AC5), run, merge the produced slots into the fresh locale
 *     objects, and save through an injected writer. One item's failure doesn't
 *     stop the sweep; a quota denial (HTTP 429) does (AC6). Slots a
 *     partially-failed item DID produce are still saved — the model calls were
 *     already paid for.
 *
 * Everything is dep-free (executor + writer are injected) so the whole
 * decision surface runs under `node --test`; the fetch adapters live in
 * `translate-client.ts` / the components.
 */
import {
  collectionItemPlanEntries,
  pickRequestedSlots,
  planTranslateCalls,
  retryPlan,
  type TranslateCall,
  type TranslatePlan,
} from "./bulk-translate-plan.ts";
import { mergeItemTranslations, toLocalizedDraft } from "./item-locale-fields.ts";
import type { CollectionField } from "./collection-schema.ts";
import type { ContentLocales } from "../render/localize.ts";

/** field → locale → translated text (only slots that were actually requested). */
export type TranslationSlots = Record<string, Record<string, string>>;

/** What executing ONE `/api/translate` call produced (the injected boundary). */
export type TranslateCallResult =
  | { ok: true; translations: TranslationSlots }
  | { ok: false; message: string; quota?: boolean; timeout?: boolean };

export type TranslateCallRunner = (call: TranslateCall) => Promise<TranslateCallResult>;

/** A hard call failure that stopped a plan run (normalized flags). */
export interface RunFailure {
  message: string;
  quota: boolean;
  timeout: boolean;
}

export interface PlanRunOutcome {
  /** Every requested slot that came back non-blank (primary + retry calls). */
  translations: TranslationSlots;
  /** Slot count in `translations` (= "translations added" for reporting). */
  slotsFilled: number;
  /** Requested slots still unanswered AFTER the one retry (reported, AC9). */
  unfilled: { name: string; locale: string }[];
  /** Set when a call hard-failed; later calls were NOT executed. */
  failure: RunFailure | null;
}

/**
 * Execute a plan's calls in order. Slots are filtered per call (a bulk run must
 * NEVER apply extras — it could overwrite translations it was told to leave
 * alone); each call's leftover slots are retried once; a hard failure stops the
 * run and is reported (slots already produced are kept). `onSlots` fires after
 * every call that filled something, so a live editor can merge progressively.
 */
export async function runTranslatePlan(
  plan: TranslatePlan,
  exec: TranslateCallRunner,
  onSlots?: (picked: TranslationSlots) => void,
): Promise<PlanRunOutcome> {
  const outcome: PlanRunOutcome = {
    translations: {},
    slotsFilled: 0,
    unfilled: [],
    failure: null,
  };

  const absorb = (picked: TranslationSlots) => {
    let any = false;
    for (const [name, map] of Object.entries(picked)) {
      for (const [locale, text] of Object.entries(map)) {
        (outcome.translations[name] ??= {})[locale] = text;
        outcome.slotsFilled += 1;
        any = true;
      }
    }
    if (any) onSlots?.(picked);
  };

  for (const call of plan.calls) {
    const res = await exec(call);
    if (!res.ok) {
      outcome.failure = failureOf(res);
      return outcome;
    }
    absorb(pickRequestedSlots(res.translations, call));

    // One retry pass for whatever this call left unanswered (AC9). Slots the
    // RETRY also leaves unanswered are reported as unfilled — no third call.
    for (const retry of retryPlan(call, res.translations).calls) {
      const rres = await exec(retry);
      if (!rres.ok) {
        outcome.failure = failureOf(rres);
        return outcome;
      }
      absorb(pickRequestedSlots(rres.translations, retry));
      outcome.unfilled.push(...planSlots(retryPlan(retry, rres.translations)));
    }
  }
  return outcome;
}

export interface SweepFailure {
  id: string;
  message: string;
}

export interface SweepSummary {
  /** Items successfully saved with ≥1 new translation. */
  updated: number;
  /** Total slots written across updated items. */
  translationsAdded: number;
  /** Items with nothing missing — no model call was made. */
  skipped: number;
  /** Field×item entries the planner refused (empty/oversized source). */
  skippedFields: number;
  /** One entry per item that failed (call error, save error, or unfilled slots).
   *  A partially-translated item can appear here AND count as updated. */
  failures: SweepFailure[];
  /** True when a quota denial aborted the sweep — later items were untouched. */
  quotaStopped: boolean;
}

export interface SweepPorts {
  /** Fetch one item's CURRENT parsed row values (translatable columns → locale
   *  objects) — called immediately before planning that item, so the plan and
   *  merge base are fresh, not the possibly-stale enumeration snapshot. */
  fetchItem: (
    id: string,
  ) => Promise<{ ok: true; values: Record<string, unknown> } | { ok: false; message: string }>;
  exec: TranslateCallRunner;
  /** Persist merged locale objects for the CHANGED fields only (PATCH semantics). */
  save: (
    id: string,
    changes: Record<string, unknown>,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** Fires as item `done` (1-based) of `total` STARTS processing. */
  onProgress?: (done: number, total: number) => void;
}

/**
 * The collection sweep: for each item id, fetch fresh → plan → run → merge →
 * save. Sequential on purpose (one model call in flight; progress reads
 * "item 3/6"). Never touches an item with an empty plan beyond counting it as
 * skipped; a fetch failure is a per-item failure and the sweep continues.
 */
export async function sweepTranslateItems(
  ids: string[],
  fields: CollectionField[],
  locales: ContentLocales,
  ports: SweepPorts,
): Promise<SweepSummary> {
  const summary: SweepSummary = {
    updated: 0,
    translationsAdded: 0,
    skipped: 0,
    skippedFields: 0,
    failures: [],
    quotaStopped: false,
  };

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    ports.onProgress?.(i + 1, ids.length);

    const fetched = await ports.fetchItem(id);
    if (!fetched.ok) {
      summary.failures.push({ id, message: fetched.message });
      continue;
    }
    const values = fetched.values;

    const plan = planTranslateCalls(collectionItemPlanEntries(values, fields, locales));
    summary.skippedFields += plan.skipped.length;
    if (plan.calls.length === 0) {
      summary.skipped += 1;
      continue;
    }

    const outcome = await runTranslatePlan(plan, ports.exec);

    // Save whatever DID come back — even when the run ended in a failure, the
    // produced slots are valid, already-metered translations.
    let failure: string | null = null;
    if (outcome.slotsFilled > 0) {
      const changes: Record<string, unknown> = {};
      for (const name of Object.keys(outcome.translations)) {
        changes[name] = mergeItemTranslations(
          toLocalizedDraft(values[name]),
          name,
          outcome.translations,
          locales.locales,
        );
      }
      const saved = await ports.save(id, changes);
      if (saved.ok) {
        summary.updated += 1;
        summary.translationsAdded += outcome.slotsFilled;
      } else {
        failure = saved.message;
      }
    }

    // ONE failure entry per item; a save error outranks the call diagnostics.
    if (failure === null) {
      if (outcome.failure && !outcome.failure.quota) {
        failure = outcome.failure.message;
      } else if (!outcome.failure && outcome.unfilled.length > 0) {
        failure = `${outcome.unfilled.length} translation(s) still missing after retry`;
      }
    }
    if (failure !== null) summary.failures.push({ id, message: failure });

    if (outcome.failure?.quota) {
      summary.quotaStopped = true;
      return summary;
    }
  }
  return summary;
}

function failureOf(res: { message: string; quota?: boolean; timeout?: boolean }): RunFailure {
  return { message: res.message, quota: res.quota === true, timeout: res.timeout === true };
}

/** Flatten a plan back into its field×locale slots (for unfilled reporting). */
function planSlots(plan: TranslatePlan): { name: string; locale: string }[] {
  return plan.calls.flatMap((call) =>
    Object.keys(call.fields).flatMap((name) =>
      call.toLocales.map((locale) => ({ name, locale })),
    ),
  );
}
