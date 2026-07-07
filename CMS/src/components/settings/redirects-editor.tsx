"use client";

/**
 * CMS manual redirects UI (seo-robots goal, 301-redirects track #3). Lists the
 * `redirect` rows, adds new ones, and deletes them. GET / POST / DELETE
 * `/api/settings/redirects`.
 *
 * Validation truth is server-side (`validateManualRedirect` in the route),
 * which returns a STABLE `code` this UI maps to localized copy. The list is the
 * auto-captured redirects (slug renames) PLUS manual ones — same table.
 *
 * REST-only (no server actions). Copy via next-intl (EN/FI/ET), purpose-token
 * Tailwind utilities only.
 *
 * ponytail: no optimistic add — POST then re-read the list, so the shown rows
 * always match D1 (rename auto-capture may have added rows meanwhile).
 */

import { useState } from "react";
import { useTranslations } from "next-intl";

interface Redirect {
  id: string;
  fromPath: string;
  toPath: string;
  status: number;
}

/** Stable error codes the POST route returns → localized via `errors.<code>`. */
const KNOWN_CODES = new Set([
  "fromRequired",
  "toRequired",
  "fromShape",
  "toShape",
  "selfLoop",
  "duplicate",
  "chainFromIsTarget",
  "chainToIsSource",
]);

export function RedirectsEditor({ initial }: { initial: Redirect[] }) {
  const t = useTranslations("redirects");
  const [rows, setRows] = useState<Redirect[]>(initial);
  const [fromPath, setFromPath] = useState("");
  const [toPath, setToPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/settings/redirects");
    if (res.ok) setRows((await res.json()) as Redirect[]);
  }

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/redirects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromPath, toPath }),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const j = (await res.json()) as { code?: string; error?: string };
          if (j.code && KNOWN_CODES.has(j.code)) msg = t(`errors.${j.code}`);
          else if (j.error) msg = j.error;
        } catch {
          /* non-JSON body */
        }
        setError(msg);
        return;
      }
      setFromPath("");
      setToPath("");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/settings/redirects?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Add form */}
      <section className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised p-4">
        <h2 className="text-lg font-medium text-foreground">{t("addTitle")}</h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm text-foreground-muted">{t("from")}</span>
            <input
              className="rounded-md border border-border bg-surface px-3 py-2 font-mono text-foreground"
              value={fromPath}
              onChange={(e) => setFromPath(e.target.value)}
              placeholder="/old-path"
              aria-label={t("from")}
            />
          </label>
          <span className="pb-2 text-foreground-muted">→</span>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm text-foreground-muted">{t("to")}</span>
            <input
              className="rounded-md border border-border bg-surface px-3 py-2 font-mono text-foreground"
              value={toPath}
              onChange={(e) => setToPath(e.target.value)}
              placeholder="/new-path"
              aria-label={t("to")}
            />
          </label>
          <button
            type="button"
            className="self-start rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50 sm:self-end"
            disabled={busy}
            onClick={() => void add()}
          >
            {t("add")}
          </button>
        </div>
        <p className="text-sm text-foreground-muted">{t("addHelp")}</p>
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger"
        >
          {error}
        </p>
      )}

      {/* List */}
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium text-foreground">
          {t("listTitle", { count: rows.length })}
        </h2>
        {rows.length === 0 ? (
          <p className="text-foreground-muted">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">
                  {r.fromPath} <span className="text-foreground-muted">→</span> {r.toPath}
                  <span className="ml-2 rounded bg-surface-muted px-1.5 py-0.5 text-xs text-foreground-muted">
                    {r.status}
                  </span>
                </span>
                <button
                  type="button"
                  className="rounded border border-border px-2 py-1 text-sm text-danger disabled:opacity-40"
                  disabled={busy}
                  onClick={() => void remove(r.id)}
                >
                  {t("delete")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
