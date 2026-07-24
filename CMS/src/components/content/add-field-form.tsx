"use client";

/** Inline "add a field" form (ADD-ONLY schema evolution) for a collection —
 *  PATCH /api/collections/[name] with `{ field }`. Extracted from
 *  collection-items.tsx (Slice 5). */

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { CollectionView } from "@/db/collection-store";
import { COLLECTION_FIELD_TYPES, isTranslatableField, type CollectionField } from "@/lib/content/collection-schema";
import { errorOf } from "@/lib/api-error";
import { INPUT } from "./field-input";

export function AddFieldForm({
  tableName,
  onCancel,
  onAdded,
}: {
  tableName: string;
  onCancel: () => void;
  onAdded: (updated: CollectionView) => void;
}) {
  const t = useTranslations("collections");
  const [name, setName] = useState("");
  const [type, setType] = useState<CollectionField["type"]>("string");
  const [required, setRequired] = useState(false);
  const [options, setOptions] = useState("");
  const [translatable, setTranslatable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsOptions = type === "select" || type === "multiselect";
  const canTranslate = isTranslatableField({ type, translatable: true });

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const field: CollectionField = { name: name.trim(), type };
      if (required) field.required = true;
      if (needsOptions && options.trim()) {
        field.options = options.split(",").map((s) => s.trim()).filter(Boolean).map((v) => ({ value: v, label: v }));
      }
      if (translatable && canTranslate) field.translatable = true;
      const res = await fetch(`/api/collections/${encodeURIComponent(tableName)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field }), // route reads obj.field (add-field path)
      });
      if (!res.ok) {
        setError(await errorOf(res));
        return;
      }
      onAdded((await res.json()) as CollectionView);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-surface-raised p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs text-foreground-muted">{t("fieldName")}</span>
        <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("fieldNamePlaceholder")} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-foreground-muted">{t("fieldType")}</span>
        <select
          className={INPUT}
          value={type}
          onChange={(e) => {
            const next = e.target.value as CollectionField["type"];
            setType(next);
            // A non-text type can't be translatable — clear a stale flag.
            if (!isTranslatableField({ type: next, translatable: true })) setTranslatable(false);
          }}
        >
          {[...COLLECTION_FIELD_TYPES].map((ty) => (
            <option key={ty} value={ty}>
              {ty}
            </option>
          ))}
        </select>
      </label>
      {needsOptions && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground-muted">{t("fieldOptions")}</span>
          <input className={INPUT} value={options} onChange={(e) => setOptions(e.target.value)} placeholder={t("fieldOptionsPlaceholder")} />
        </label>
      )}
      <label className="flex items-center gap-1 text-sm text-foreground">
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        {t("required")}
      </label>
      {canTranslate && (
        <label className="flex items-center gap-1 text-sm text-foreground" title={t("translatableHint")}>
          <input type="checkbox" checked={translatable} onChange={(e) => setTranslatable(e.target.checked)} />
          {t("translatable")}
        </label>
      )}
      {error && <p className="w-full text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" disabled={busy || !name.trim()}>
          {busy ? t("saving") : t("addField")}
        </button>
        <button type="button" className="rounded-md border border-border px-4 py-2 text-foreground" onClick={onCancel} disabled={busy}>
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
