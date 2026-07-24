"use client";

/**
 * bulk-translate-missing — the two collection-side buttons (feature ACs A + B).
 *
 *  - `TranslateMissingButton` sits in the item edit form: plans from the
 *    CURRENT draft values, runs the plan sequentially against `/api/translate`
 *    and merges each response's vetted slots into the draft via the parent's
 *    concurrency-safe functional merge — the user still hits Save.
 *
 *  - `TranslateAllMissingButton` sits in the collection toolbar: enumerates
 *    every non-archived item's ID up-front (progress total), then sweeps them
 *    via the dep-free sweep core, which re-fetches each item FRESH right
 *    before planning it (a stale base would revert concurrent edits), skips
 *    complete items, retries once, aborts on quota, and saves each changed
 *    item DIRECTLY through the item PATCH endpoint (published items go live).
 *    Progress + final summary render on their own toolbar row.
 *
 * Both return null on single-locale sites (AC10). All decision logic lives in
 * `lib/content/bulk-translate-plan.ts` / `bulk-translate-run.ts`; this file is
 * the thin, stateful shell.
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { CollectionField } from "@/lib/content/collection-schema";
import type { ContentLocales } from "@/lib/render/localize";
import {
  collectionItemPlanEntries,
  planTranslateCalls,
} from "@/lib/content/bulk-translate-plan";
import {
  runTranslatePlan,
  sweepTranslateItems,
  type SweepSummary,
  type TranslateCallRunner,
  type TranslationSlots,
} from "@/lib/content/bulk-translate-run";
import { executeTranslateCall } from "@/lib/content/translate-client";
import { errorOf } from "@/lib/api-error";
import { Spinner } from "@/components/ui/spinner";

/** The fetch executor for this collection: a client timeout carries the i18n
 *  copy the per-field translate shows (server errors arrive user-readable). */
function translateExec(target: string, fromLocale: string, timeoutMessage: string): TranslateCallRunner {
  return (call) => executeTranslateCall(call, { target, fromLocale, timeoutMessage });
}

function toContentLocales(locales: string[]): ContentLocales {
  return { default: locales[0] ?? "", locales };
}

/** Item-form "Translate missing": fill every absent locale slot of the OPEN
 *  draft in one action. Disabled (not hidden) while busy or when nothing is
 *  missing; hidden only on single-locale sites. */
export function TranslateMissingButton({
  values,
  fields,
  locales,
  tableName,
  onMerge,
}: {
  /** The draft's CURRENT field values (locale objects / bare strings). */
  values: Record<string, unknown>;
  fields: CollectionField[];
  /** Site content locales, default (source) first. */
  locales: string[];
  tableName: string;
  /** Apply one call's vetted slots into the LATEST draft (functional merge —
   *  the same concurrency-safe path the per-field translate uses). */
  onMerge: (translations: TranslationSlots) => void;
}) {
  const t = useTranslations("collections");
  const tp = useTranslations("pageBuilder");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-planned from the live draft, so the button enables/disables as the
  // operator types or per-field translates fill slots. Cheap string scans.
  const plan = useMemo(
    () => planTranslateCalls(collectionItemPlanEntries(values, fields, toContentLocales(locales))),
    [values, fields, locales],
  );

  if (locales.length < 2) return null;

  async function run() {
    setBusy(true);
    setError(null);
    const outcome = await runTranslatePlan(
      plan,
      translateExec(tableName, locales[0], tp("translateField.timeout")),
      onMerge,
    );
    if (outcome.failure) setError(outcome.failure.message);
    else if (outcome.unfilled.length > 0) {
      setError(t("translateMissingIncomplete", { count: outcome.unfilled.length }));
    }
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-[11px] text-danger">{error}</span>}
      <button
        type="button"
        className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50"
        disabled={busy || plan.calls.length === 0}
        title={plan.calls.length === 0 ? t("translateMissingNone") : undefined}
        onClick={() => void run()}
      >
        {busy && <Spinner />}
        {busy ? t("translating") : t("translateMissing")}
      </button>
    </div>
  );
}

/** Toolbar "Translate all missing": sweep every non-archived item and save
 *  directly through the item write path. Renders the button plus, while/after a
 *  sweep, a full-width status row (the toolbar flex-wraps `w-full` children). */
export function TranslateAllMissingButton({
  tableName,
  fields,
  locales,
  disabled,
  onRunningChange,
  onDone,
}: {
  tableName: string;
  fields: CollectionField[];
  /** Site content locales, default (source) first. */
  locales: string[];
  /** True while the item edit form is open — its unsaved draft would race the
   *  sweep's direct saves. */
  disabled: boolean;
  /** The parent locks item editing while a sweep runs. */
  onRunningChange: (running: boolean) => void;
  /** Reload the list after the sweep wrote items. */
  onDone: () => void;
}) {
  const t = useTranslations("collections");
  const tp = useTranslations("pageBuilder");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<SweepSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (locales.length < 2) return null;

  async function run() {
    setRunning(true);
    onRunningChange(true);
    setSummary(null);
    setError(null);
    try {
      const ids = await fetchAllLiveItemIds(tableName);
      const result = await sweepTranslateItems(ids, fields, toContentLocales(locales), {
        // Fresh read right before planning — the id enumeration can be minutes
        // old by item N; planning/merging from it would revert concurrent edits.
        fetchItem: async (id) => {
          const res = await fetch(itemUrl(tableName, id));
          if (!res.ok) return { ok: false, message: await errorOf(res) };
          return { ok: true, values: (await res.json()) as Record<string, unknown> };
        },
        exec: translateExec(tableName, locales[0], tp("translateField.timeout")),
        save: async (id, changes) => {
          const res = await fetch(itemUrl(tableName, id), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(changes),
          });
          return res.ok ? { ok: true } : { ok: false, message: await errorOf(res) };
        },
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setSummary(result);
      if (result.updated > 0) onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProgress(null);
      setRunning(false);
      onRunningChange(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-foreground disabled:opacity-50"
        disabled={disabled || running}
        onClick={() => void run()}
      >
        {running && <Spinner />}
        {running
          ? progress
            ? t("translateSweepProgress", { done: progress.done, total: progress.total })
            : t("translating")
          : t("translateAllMissing")}
      </button>

      {(error !== null || summary !== null) && (
        <div className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground">
          {error && <p className="text-danger">{error}</p>}
          {summary && (
            <>
              <p>
                {t("translateSweepSummary", {
                  updated: summary.updated,
                  added: summary.translationsAdded,
                  skipped: summary.skipped,
                  failed: summary.failures.length,
                })}
              </p>
              {summary.skippedFields > 0 && (
                <p className="text-foreground-muted">
                  {t("translateSweepSkippedFields", { count: summary.skippedFields })}
                </p>
              )}
              {summary.quotaStopped && (
                <p className="text-danger">{t("translateSweepQuotaStop")}</p>
              )}
              {summary.failures.slice(0, 10).map((f) => (
                <p key={f.id} className="text-danger">
                  {t("translateSweepItemFailure", { id: f.id, error: f.message })}
                </p>
              ))}
            </>
          )}
        </div>
      )}
    </>
  );
}

/** The single-item endpoint — the sweep's fresh GET and its PATCH save. */
function itemUrl(tableName: string, id: string): string {
  return `/api/collections/${encodeURIComponent(tableName)}/items/${encodeURIComponent(id)}`;
}

/** Every non-archived item ID in the collection, paged past the route's 1000
 *  cap. IDs only — the sweep re-fetches each item fresh when its turn comes. */
async function fetchAllLiveItemIds(tableName: string): Promise<string[]> {
  const out: string[] = [];
  for (;;) {
    const res = await fetch(
      `/api/collections/${encodeURIComponent(tableName)}/query?archived=live&limit=1000&offset=${out.length}`,
    );
    if (!res.ok) throw new Error(await errorOf(res));
    const data = (await res.json()) as { items: Record<string, unknown>[]; total: number };
    out.push(...data.items.map((it) => String(it.id)));
    if (out.length >= data.total || data.items.length === 0) return out;
  }
}
