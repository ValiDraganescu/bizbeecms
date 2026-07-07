"use client";

/**
 * CMS branded-404 settings UI (seo-robots goal). Picks which PUBLISHED page the
 * site serves as its 404 (or "none" → the plain built-in 404). GETs the current
 * id + published-page options on mount, PUTs the chosen id.
 *
 * The server hard-rejects a non-published id (stable code `notPublished`); the
 * options list only ever contains published pages so that shouldn't fire from
 * this UI, but a stale list (a page unpublished elsewhere) surfaces the error.
 * next-intl copy (EN/FI/ET), purpose-token Tailwind only.
 *
 * ponytail: one select → one PUT; server is the validation truth.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface Option {
  id: string;
  label: string;
}

const NONE = "";

export function NotFoundPageEditor() {
  const t = useTranslations("notFoundPage");
  const [options, setOptions] = useState<Option[]>([]);
  const [pageId, setPageId] = useState<string>(NONE);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/settings/not-found-page");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = (await res.json()) as { pageId: string; options: Option[] };
        if (!alive) return;
        setOptions(j.options ?? []);
        setPageId(j.pageId ?? NONE);
      } catch (err) {
        if (alive) setError((err as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/not-found-page", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId }),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const j = (await res.json()) as { error?: string; code?: string };
          if (j.code) msg = t(`errors.${j.code}`, { default: j.error ?? msg });
          else if (j.error) msg = j.error;
        } catch {
          /* non-JSON body */
        }
        setError(msg);
        return;
      }
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-foreground-muted">{t("loading")}</p>;

  return (
    <div className="flex flex-col gap-6">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">{t("selectLabel")}</span>
        <span className="text-sm text-foreground-muted">{t("selectHint")}</span>
        <select
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
          value={pageId}
          onChange={(e) => {
            setSaved(false);
            setPageId(e.target.value);
          }}
          aria-label={t("selectLabel")}
        >
          <option value={NONE}>{t("none")}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger"
        >
          {error}
        </p>
      )}
      {saved && (
        <p
          role="status"
          className="rounded-md border border-success bg-success-subtle px-3 py-2 text-foreground"
        >
          {t("saved")}
        </p>
      )}

      <button
        type="button"
        className="self-start rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        disabled={busy}
        onClick={() => void save()}
      >
        {busy ? t("saving") : t("save")}
      </button>
    </div>
  );
}
