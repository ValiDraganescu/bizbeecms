"use client";

/**
 * bulk-translate-missing — the per-COMPONENT "Translate missing" button in the
 * block inspector (AC 7b). One click fills every missing prop×locale slot of
 * the SELECTED block only, missing-only, in one go.
 *
 * Planning/bookkeeping are the shared dep-free libs: `blockTranslateEntries`
 * (this block's missing slots, per-field-menu source semantics) →
 * `planTranslateCalls` (grouping/chunking) → `runTranslatePlan` (sequential
 * calls, vetted `pickRequestedSlots`, one retry). Each call's vetted slots
 * commit ONLY through the T7 updater path — `onChange((latest) => …)` against
 * the block's props at commit time — never a full-props object computed before
 * an await (the stale-snapshot race).
 *
 * HIDDEN (not disabled) when there's nothing to do: single-locale site, no
 * translatable source text, or no missing slot — so it self-hides once every
 * slot is filled. It stays mounted while busy or showing an error.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Spinner } from "@/components/ui/spinner";
import {
  mergeTranslations,
  type BlockPropsUpdater,
  type PropField,
} from "@/lib/pages/page-blocks";
import { blockTranslateEntries, describeBlockEntries } from "@/lib/pages/page-translate-missing";
import { TranslateMissingDialog } from "./translate-missing-dialog";
import { planTranslateCalls } from "@/lib/content/bulk-translate-plan";
import { runTranslatePlan } from "@/lib/content/bulk-translate-run";
import { executeTranslateCall } from "@/lib/content/translate-client";

export function BlockTranslateMissingButton({
  component,
  schema,
  props,
  locales,
  onChange,
}: {
  /** The block's component name (the translate log target). */
  component: string;
  /** The FULL parsed prop schema (mergeTranslations re-validates against it). */
  schema: PropField[];
  /** The block's CURRENT props — re-plans as edits/translates fill slots. */
  props: Record<string, unknown>;
  /** Site content locales, default (source) first. */
  locales: string[];
  /** The T7 updater path: async results MUST pass an updater. */
  onChange: (props: Record<string, unknown> | BlockPropsUpdater) => void;
}) {
  const t = useTranslations("pageBuilder");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Selecting another block / switching pages unmounts this button. A run
  // still in flight must then stop: another page's draft can reuse block ids,
  // so applying the detached run's slots could contaminate it (same guard as
  // PageTranslateMissingButton). Checked per call and per merge.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // What's missing (prop + locales), shown in the confirmation dialog before
  // any call is made — the run consumes what the operator confirmed seeing.
  const [confirming, setConfirming] = useState(false);

  // Re-planned from the live props, so the button appears/disappears as the
  // operator types or per-field translates fill slots. Cheap string scans.
  const entries = useMemo(
    () => blockTranslateEntries(props, schema, { default: locales[0] ?? "", locales }),
    [props, schema, locales],
  );
  const plan = useMemo(() => planTranslateCalls(entries), [entries]);

  if (plan.calls.length === 0 && !busy && error === null) return null;

  async function run() {
    setBusy(true);
    setError(null);
    const outcome = await runTranslatePlan(
      plan,
      async (call) => {
        if (!alive.current) return { ok: false, message: "cancelled" };
        return executeTranslateCall(call, {
          target: component,
          fromLocale: locales[0],
          timeoutMessage: t("translateField.timeout"),
        });
      },
      (picked) => {
        // Vetted, requested-only slots merged against the LATEST props (T7).
        if (alive.current) onChange((latest) => mergeTranslations(latest, picked, schema, locales));
      },
    );
    if (!alive.current) return;
    if (outcome.failure) setError(outcome.failure.message);
    else if (outcome.unfilled.length > 0) {
      setError(t("translateMissingIncomplete", { count: outcome.unfilled.length }));
    }
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span className="max-w-40 truncate text-[11px] text-danger" title={error}>
          {error}
        </span>
      )}
      <button
        type="button"
        className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-surface-muted disabled:opacity-50"
        disabled={busy || plan.calls.length === 0}
        title={t("blockTranslateMissingHint")}
        onClick={() => setConfirming(true)}
      >
        {busy && <Spinner />}
        {busy ? t("translating") : t("translateMissing")}
      </button>
      {confirming && (
        <TranslateMissingDialog
          rows={describeBlockEntries(entries, component, schema)}
          onConfirm={() => {
            setConfirming(false);
            void run();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
