"use client";

/**
 * content-collections (Phase-2): the OPERATOR raw-SELECT console (NON-AI surface).
 *
 * A collapsible panel on the collections index: type ONE read-only SELECT over
 * content_* tables and see the rows in a table. POSTs to /api/collections/sql,
 * which runs it through the SAME Slice-0 fence (SELECT-only, content_*-scoped).
 * The AI never gets this — it's the operator's escape hatch for ad-hoc queries
 * the structured UI can't express. Bad SQL → inline error (the fence's reason).
 *
 * REST-only, purpose tokens, EN/FI/ET via next-intl. No form lib.
 * ponytail: results render as a plain HTML table, values String()-stringified.
 * Add CSV export / column sort here if operators ask — not before.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";

const INPUT =
  "rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground";

type Result = { columns: string[]; rows: Record<string, unknown>[]; truncated: boolean };

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function SqlConsole() {
  const t = useTranslations("collections");
  const [open, setOpen] = useState(false);
  const [sql, setSql] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function run() {
    if (!sql.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/collections/sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql }),
      });
      const data = (await res.json()) as Result & { error?: string };
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        setResult(null);
        return;
      }
      setResult({ columns: data.columns, rows: data.rows, truncated: data.truncated });
    } catch (err) {
      setError((err as Error).message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="self-start text-sm text-foreground-muted underline hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        {t("sqlConsole")}
      </button>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("sqlConsole")}</h2>
          <p className="mt-1 text-sm text-foreground-muted">{t("sqlConsoleHint")}</p>
        </div>
        <button
          type="button"
          className="text-sm text-foreground-muted hover:text-foreground"
          onClick={() => setOpen(false)}
        >
          {t("cancel")}
        </button>
      </div>

      <textarea
        className={`${INPUT} min-h-24 w-full`}
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        placeholder={t("sqlPlaceholder")}
        aria-label={t("sqlConsole")}
        spellCheck={false}
      />

      <button
        type="button"
        className="self-start rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        onClick={() => void run()}
        disabled={busy || !sql.trim()}
      >
        {busy ? t("saving") : t("sqlRun")}
      </button>

      {error && (
        <p role="alert" className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {result && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-foreground-muted">
            {t("itemCount", { count: result.rows.length })}
            {result.truncated ? ` — ${t("sqlTruncated")}` : ""}
          </p>
          {result.rows.length > 0 ? (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface text-foreground-muted">
                  <tr>
                    {result.columns.map((c) => (
                      <th key={c} className="whitespace-nowrap px-3 py-2 font-mono font-medium">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className="border-t border-border">
                      {result.columns.map((c) => (
                        <td key={c} className="whitespace-nowrap px-3 py-2 font-mono text-foreground">
                          {cell(row[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-foreground-muted">{t("noItems")}</p>
          )}
        </div>
      )}
    </section>
  );
}
