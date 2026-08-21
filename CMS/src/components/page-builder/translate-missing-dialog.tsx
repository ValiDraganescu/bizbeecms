"use client";

/**
 * Pre-run confirmation dialog for the "Translate missing" actions (page-level
 * and per-block). Lists every item that is missing translations and the exact
 * languages each is missing, so the operator sees what a run will produce (and
 * spend) BEFORE choosing to translate. Purely presentational — the caller
 * builds the rows (`describePageEntries` / `describeBlockEntries`) and runs
 * the plan on confirm.
 */

import { useTranslations } from "next-intl";
import type { TranslateEntryRow } from "@/lib/pages/page-translate-missing";

export function TranslateMissingDialog({
  rows,
  onConfirm,
  onCancel,
}: {
  /** What's missing — one row per item, with its missing locales. */
  rows: TranslateEntryRow[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("pageBuilder.translateMissingDialog");
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("title")}
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-4 shadow-lg">
        <h2 className="text-sm font-semibold text-foreground">{t("title")}</h2>
        <p className="mt-1 text-xs text-foreground-muted">{t("intro", { count: rows.length })}</p>
        <ul className="mt-3 flex max-h-64 flex-col gap-1.5 overflow-y-auto">
          {rows.map((row) => (
            <li
              key={row.name}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-2.5 py-1.5"
            >
              <span className="min-w-0 truncate text-xs text-foreground">
                {row.kind === "meta" ? (
                  t(row.field === "metaTitle" ? "metaTitle" : "metaDescription")
                ) : (
                  <>
                    <span className="text-foreground-muted">{row.component}</span>
                    {" · "}
                    {row.field}
                  </>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {row.locales.map((code) => (
                  <span
                    key={code}
                    className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-foreground-muted"
                  >
                    {code}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground"
            onClick={onCancel}
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
            onClick={onConfirm}
          >
            {t("confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
