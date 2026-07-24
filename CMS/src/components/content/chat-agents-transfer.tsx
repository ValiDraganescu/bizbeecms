"use client";

/**
 * chat-agent-export-import — the export/import toolbar on the Chat agents
 * screen. Export downloads the selected agents as ONE `bizbeecms.agents` JSON
 * file (selection lives in the manager; this bar just consumes the names).
 * Import uploads such a file and renders the per-agent summary: what was
 * created (as which copy name), what was dropped from allowlists, and which
 * entries failed validation. REST-only; strings via the `chatAgents` i18n
 * namespace (en/fi/et).
 */

import { useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { ghostBtn, readError } from "@/components/content/chat-agents-shared";

type ImportResult = {
  created: { name: string; as: string; dropped: string[] }[];
  failed: { name: string; errors: string[] }[];
};

export function AgentsTransferBar({
  selectedNames,
  onImported,
}: {
  selectedNames: string[];
  onImported: () => Promise<void> | void;
}) {
  const t = useTranslations("chatAgents");
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function exportSelected() {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ names: selectedNames.join(",") });
      const res = await fetch(`/api/chat-agents/export?${params.toString()}`);
      if (!res.ok) throw new Error(await readError(res));
      const blob = await res.blob();
      const filename =
        /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ??
        "chat-agents.agents.json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const text = await file.text();
      const res = await fetch("/api/chat-agents/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
      });
      if (!res.ok) throw new Error(await readError(res));
      setResult((await res.json()) as ImportResult);
      await onImported();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={ghostBtn}
          disabled={busy || selectedNames.length === 0}
          onClick={() => void exportSelected()}
        >
          {t("exportSelected", { count: selectedNames.length })}
        </button>
        <button
          type="button"
          className={ghostBtn}
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? t("importing") : t("import")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => void onFile(e)}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger"
        >
          {error}
        </p>
      )}

      {result && (
        <div className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground">
          <p className="font-medium">
            {t("importSummary", {
              created: result.created.length,
              failed: result.failed.length,
            })}
          </p>
          {result.created.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {result.created.map((c) => (
                <li key={c.as}>
                  {c.as === c.name
                    ? t("importedAs", { name: c.name })
                    : t("importedAsCopy", { name: c.name, as: c.as })}
                  {c.dropped.length > 0 && (
                    <ul className="list-disc pl-5 text-foreground-muted">
                      {c.dropped.map((d) => (
                        <li key={d}>{t("importDropped", { detail: d })}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
          {result.failed.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-danger">
              {result.failed.map((f) => (
                <li key={f.name}>
                  {t("importFailed", { name: f.name, errors: f.errors.join("; ") })}
                </li>
              ))}
            </ul>
          )}
          <button type="button" className={`${ghostBtn} mt-2`} onClick={() => setResult(null)}>
            {t("dismiss")}
          </button>
        </div>
      )}
    </div>
  );
}
