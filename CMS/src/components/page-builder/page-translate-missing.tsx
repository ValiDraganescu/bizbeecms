"use client";

/**
 * bulk-translate-missing — the page-builder "Translate missing" action (AC C7).
 *
 * One click fills every ABSENT locale slot across the selected page: meta
 * title/description + every translatable block prop, missing-only. Planning and
 * bookkeeping live in the dep-free libs (`bulk-translate-plan/-run`, the page
 * adapter `page-translate-missing.ts`); this is the thin stateful shell.
 *
 * Persistence matches a manual per-field translate exactly (`persist:false`):
 * each call's VETTED block slots merge into the builder's draft state via the
 * parent's functional merge (dirty → autosave → draft; publish purges the edge
 * cache), and filled meta slots are PUT once through the SEO form's existing
 * `/api/pages` body (which purges too). Hidden on single-locale sites (AC10);
 * disabled while busy or when nothing is missing.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { PageSummary } from "@/db/page-store";
import { buildSeoMetaBody } from "@/lib/pages/page-meta";
import {
  mergePageMeta,
  pageTranslateEntries,
  splitPageSlots,
  type PropsSchemas,
} from "@/lib/pages/page-translate-missing";
import { planTranslateCalls } from "@/lib/content/bulk-translate-plan";
import { runTranslatePlan, type TranslationSlots } from "@/lib/content/bulk-translate-run";
import { executeTranslateCall } from "@/lib/content/translate-client";
import { Spinner } from "@/components/ui/spinner";
import type { Block } from "@/lib/render/tree";

export function PageTranslateMissingButton({
  page,
  blocks,
  propsSchemas,
  locales,
  onApplyBlocks,
  onMetaSaved,
}: {
  /** The selected page's summary — meta source AND the PUT identity. */
  page: PageSummary;
  /** The draft block tree currently in the editor. */
  blocks: Block[];
  /** Component name → raw propsSchema JSON (the shell's palette map). */
  propsSchemas: PropsSchemas;
  /** Site content locales, default (source) first. */
  locales: string[];
  /** Merge one call's vetted block slots into the LATEST draft (functional
   *  merge in the shell — the same concurrency-safe path a per-field
   *  translate's onChange takes). */
  onApplyBlocks: (slots: TranslationSlots) => void;
  /** Refetch pages after the meta PUT so the picker/SEO tab stay current. */
  onMetaSaved: () => void;
}) {
  const t = useTranslations("pageBuilder");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The shell keys this button by page id, so switching pages UNMOUNTS it. A
  // run still in flight must then stop: another page's draft may reuse block
  // ids, so applying the detached run's slots could contaminate it (and every
  // further call is spend the operator no longer sees). Checked per call.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  // A run outlives the click by minutes while the SEO/Page tabs stay usable —
  // any save there refreshes the shell's `pages`, re-rendering us with a fresh
  // `page` prop. The end-of-run meta PUT must build on THAT page, not the
  // click-time closure snapshot, or it would revert the mid-run edit (title,
  // noindex, metaImage — the whole SEO body). Track the latest prop in a ref.
  const latestPage = useRef(page);
  useEffect(() => {
    latestPage.current = page;
  });

  // Re-planned from the live draft + page meta, so the button enables/disables
  // as edits or per-field translates fill slots. Cheap string scans.
  const plan = useMemo(
    () =>
      planTranslateCalls(
        pageTranslateEntries(
          { metaTitle: page.metaTitle, metaDescription: page.metaDescription },
          blocks,
          propsSchemas,
          { default: locales[0] ?? "", locales },
        ),
      ),
    [page.metaTitle, page.metaDescription, blocks, propsSchemas, locales],
  );

  if (locales.length < 2) return null;

  async function run() {
    setBusy(true);
    setError(null);

    // Block slots apply per call (progressive, like the item-level button);
    // meta slots accumulate for ONE PUT at the end (they're one page row).
    const metaSlots: TranslationSlots = {};
    const outcome = await runTranslatePlan(
      plan,
      async (call) => {
        if (!alive.current) return { ok: false, message: "cancelled" };
        return executeTranslateCall(call, {
          kind: "page",
          target: page.slug,
          fromLocale: locales[0],
          timeoutMessage: t("translateField.timeout"),
        });
      },
      (picked) => {
        if (!alive.current) return;
        const { meta, block } = splitPageSlots(picked);
        if (Object.keys(block).length > 0) onApplyBlocks(block);
        for (const [name, map] of Object.entries(meta)) {
          metaSlots[name] = { ...metaSlots[name], ...map };
        }
      },
    );
    if (!alive.current) return;
    // Save whatever meta DID come back even when the run ended in a failure —
    // the slots are valid, already-metered translations (same rule as the sweep).
    const metaError = Object.keys(metaSlots).length > 0 ? await saveMeta(metaSlots) : null;

    if (outcome.failure) setError(outcome.failure.message);
    else if (metaError) setError(metaError);
    else if (outcome.unfilled.length > 0) {
      setError(t("translateMissingIncomplete", { count: outcome.unfilled.length }));
    }
    setBusy(false);
  }

  /** PUT the merged meta maps through the SEO form's existing `/api/pages` body
   *  (slug/parent/publish/noindex preserved; edge cache purged by the route).
   *  Builds on the LATEST page (see `latestPage`), and `mergePageMeta` fills
   *  absent slots only — so a mid-run SEO save is never reverted or overwritten.
   *  Returns the error message, or null on success. */
  async function saveMeta(slots: TranslationSlots): Promise<string | null> {
    const current = latestPage.current;
    const merged = mergePageMeta(current, slots);
    try {
      const res = await fetch("/api/pages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildSeoMetaBody(
            current,
            merged.metaTitle,
            merged.metaDescription,
            current.metaImage,
            current.noindex,
          ),
        ),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        return j.error ?? `HTTP ${res.status}`;
      }
      onMetaSaved();
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span className="max-w-64 truncate text-[11px] text-danger" title={error}>
          {error}
        </span>
      )}
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
