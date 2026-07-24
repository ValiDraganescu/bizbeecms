"use client";

/** The collection item list table (first 4 schema fields + slug/status +
 *  row actions) with its cell renderer. Extracted from collection-items.tsx
 *  (Slice 5). Purely presentational — the parent owns loading and the row
 *  action handlers. */

import { useLocale, useTranslations } from "next-intl";
import { resolveLocalized, isLocaleObject } from "@/lib/render/localize";
import type { CollectionField } from "@/lib/content/collection-schema";

export function ItemsTable({
  items,
  fields,
  contentDefaultLocale,
  disabled,
  onEdit,
  onToggleArchive,
  onDelete,
}: {
  items: Record<string, unknown>[];
  fields: CollectionField[];
  /** The site's first content locale — the display fallback for locale objects. */
  contentDefaultLocale: string;
  /** True while a save/op or a translate sweep is running — row actions lock. */
  disabled: boolean;
  onEdit: (item: Record<string, unknown>) => void;
  onToggleArchive: (id: string, isArchived: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations("collections");
  // The admin's active UI locale (en/fi/et) — picks which language of a
  // translatable field to SHOW, falling back to the content default locale.
  const adminLocale = useLocale();

  if (items.length === 0) return <p className="text-foreground-muted">{t("noItems")}</p>;

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-raised text-foreground-muted">
          <tr>
            <th className="px-3 py-2 font-medium">{t("itemSlug")}</th>
            {fields.slice(0, 4).map((f) => (
              <th key={f.name} className="px-3 py-2 font-medium">
                {f.label || f.name}
              </th>
            ))}
            <th className="px-3 py-2 font-medium">{t("itemStatus")}</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const id = String(it.id);
            const isArchived = it.archived_at != null;
            return (
              <tr key={id} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-foreground-muted">{String(it.slug ?? "")}</td>
                {fields.slice(0, 4).map((f) => (
                  <td key={f.name} className="px-3 py-2 text-foreground">
                    {renderCell(it[f.name], adminLocale, contentDefaultLocale)}
                  </td>
                ))}
                <td className="px-3 py-2 text-foreground-muted">
                  {isArchived ? t("archivedTag") : String(it.status ?? "")}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="rounded border border-border px-2 py-1 text-foreground-muted hover:text-foreground disabled:opacity-40"
                      disabled={disabled}
                      onClick={() => onEdit(it)}
                    >
                      {t("edit")}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-border px-2 py-1 text-foreground-muted hover:text-foreground disabled:opacity-40"
                      disabled={disabled}
                      onClick={() => onToggleArchive(id, isArchived)}
                    >
                      {isArchived ? t("unarchive") : t("archive")}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-border px-2 py-1 text-danger disabled:opacity-40"
                      disabled={disabled}
                      onClick={() => onDelete(id)}
                    >
                      {t("delete")}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function renderCell(v: unknown, locale: string, defaultLocale: string): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "✓" : "—";
  // A translatable field is a locale object here — show the admin's active locale
  // (falling back to the content default), NOT "[object Object]".
  if (isLocaleObject(v)) {
    v = resolveLocalized(v, locale, defaultLocale);
    if (v == null) return "";
  }
  if (Array.isArray(v)) return v.join(", ");
  const s = String(v);
  // multiselect is stored as a JSON array string — show it readably.
  if (s.startsWith("[") && s.endsWith("]")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.join(", ");
    } catch {
      /* not JSON */
    }
  }
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}
