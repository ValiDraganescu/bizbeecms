"use client";

/** Inline import form for a collection: paste CSV/JSON or pick a file,
 *  bulk-create items via POST .../[name]/import. Extracted from
 *  collection-items.tsx (Slice 5). */

import { useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { errorOf } from "@/lib/api-error";
import { INPUT } from "./field-input";

export function ImportForm({
  tableName,
  onCancel,
  onImported,
}: {
  tableName: string;
  onCancel: () => void;
  onImported: () => void;
}) {
  const t = useTranslations("collections");
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; failed: number; errors: { row: number; error: string }[] } | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/collections/${encodeURIComponent(tableName)}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, text }),
      });
      if (!res.ok) {
        setError(await errorOf(res));
        return;
      }
      const data = (await res.json()) as { created: number; failed: number; errors: { row: number; error: string }[] };
      setResult(data);
      if (data.failed === 0) {
        onImported();
        return;
      }
      // some rows failed → keep the modal open so the operator can see which.
      onImported();
      setBusy(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormat(file.name.toLowerCase().endsWith(".json") ? "json" : "csv");
    setText(await file.text());
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2 className="text-lg font-semibold text-foreground">{t("importTitle")}</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground-muted">{t("importFormat")}</span>
          <select className={INPUT} value={format} onChange={(e) => setFormat(e.target.value as "csv" | "json")}>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground-muted">{t("importFile")}</span>
          <input className={INPUT} type="file" accept=".csv,.json,text/csv,application/json" onChange={(e) => void onFile(e)} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-foreground-muted">{t("importPaste")}</span>
        <textarea
          className={`${INPUT} font-mono text-sm`}
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("importPlaceholder")}
        />
      </label>
      {result && (
        <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground">
          <p>{t("importResult", { created: result.created, failed: result.failed })}</p>
          {result.errors.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-danger">
              {result.errors.slice(0, 20).map((er) => (
                <li key={er.row}>{t("importRowError", { row: er.row, error: er.error })}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        >
          {busy ? t("importing") : t("import")}
        </button>
        <button type="button" className="rounded-md border border-border px-4 py-2 text-foreground" onClick={onCancel}>
          {t("close")}
        </button>
      </div>
    </form>
  );
}
