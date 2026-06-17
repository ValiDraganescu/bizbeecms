"use client";

/**
 * CMS content-locale settings UI (Milestone 2, epic C1b) — the in-browser editor
 * for the per-Site, data-driven content-language set (distinct from the fixed
 * EN/FI/ET admin-UI locale set). It GETs / PUTs `/api/settings/content-locales`.
 *
 * REST-only (no server actions). All copy via next-intl (EN/FI/ET). Styling uses
 * the purpose-token Tailwind utilities (bg-surface, text-foreground, …) — never
 * raw colors. Admin pages get real build-time class scanning, so they are NOT
 * limited to the A3 bounded runtime vocabulary.
 *
 * ponytail: client-side optimistic edit then one PUT; the server re-normalizes,
 * so the validation source of truth stays `normalizeContentLocales`. No form lib.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  isValidLocaleCode,
  normalizeLocaleCode,
  type ContentLocales,
} from "@/lib/render/localize";

export function ContentLocalesEditor({ initial }: { initial: ContentLocales }) {
  const t = useTranslations("contentLocales");
  const [config, setConfig] = useState<ContentLocales>(initial);
  const [newCode, setNewCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function addLocale() {
    setError(null);
    setSaved(false);
    const code = normalizeLocaleCode(newCode);
    if (!isValidLocaleCode(code)) {
      setError(t("invalidCode"));
      return;
    }
    if (config.locales.includes(code)) {
      setError(t("duplicate"));
      return;
    }
    setConfig({ ...config, locales: [...config.locales, code] });
    setNewCode("");
  }

  function removeLocale(code: string) {
    setSaved(false);
    if (code === config.default) return; // can't remove the default
    const locales = config.locales.filter((l) => l !== code);
    setConfig({ ...config, locales });
  }

  function setDefault(code: string) {
    setSaved(false);
    setConfig({ ...config, default: code });
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/content-locales", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const j = (await res.json()) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          /* non-JSON body */
        }
        setError(msg);
        return;
      }
      // The server normalizes (e.g. moves default first) — adopt its truth.
      setConfig((await res.json()) as ContentLocales);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {config.locales.map((code) => (
          <li
            key={code}
            className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-raised px-3 py-2"
          >
            <span className="font-mono text-foreground">{code}</span>
            <div className="flex items-center gap-2">
              {code === config.default ? (
                <span className="rounded bg-primary-subtle px-2 py-1 text-foreground">
                  {t("default")}
                </span>
              ) : (
                <button
                  type="button"
                  className="rounded border border-border px-2 py-1 text-foreground-muted hover:text-foreground"
                  onClick={() => setDefault(code)}
                >
                  {t("makeDefault")}
                </button>
              )}
              <button
                type="button"
                className="rounded border border-border px-2 py-1 text-danger disabled:opacity-40"
                disabled={code === config.default}
                onClick={() => removeLocale(code)}
                aria-label={t("remove", { code })}
              >
                {t("remove", { code })}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          addLocale();
        }}
      >
        <input
          className="flex-1 rounded-md border border-border bg-surface px-3 py-2 font-mono text-foreground"
          placeholder={t("addPlaceholder")}
          value={newCode}
          onChange={(e) => setNewCode(e.target.value)}
          aria-label={t("addPlaceholder")}
        />
        <button
          type="submit"
          className="rounded-md border border-border px-4 py-2 text-foreground disabled:opacity-50"
          disabled={newCode.trim() === ""}
        >
          {t("add")}
        </button>
      </form>

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
