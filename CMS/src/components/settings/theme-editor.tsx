"use client";

/**
 * CMS per-Site theme-override editor (Milestone 2, epic E1). Set/clear a color
 * value for each purpose token; empty = use the default from globals.css. GETs /
 * PUTs `/api/settings/theme`. The server re-validates (only known tokens + safe
 * colors), so the validation source of truth stays `lib/render/theme.ts`.
 *
 * REST-only (no server actions). All copy via next-intl (EN/FI/ET). Styling uses
 * the purpose-token Tailwind utilities — never raw colors. A native
 * <input type="color"> + a free-text field cover the two ways a Site author
 * picks a color (hex swatch, or paste an oklch()).
 *
 * ponytail: optimistic local edit then one PUT; native color input over a picker
 * lib. No form lib.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  THEME_TOKENS,
  isSafeColorValue,
  type ThemeOverrides,
} from "@/lib/render/theme";

export function ThemeEditor({ initial }: { initial: ThemeOverrides }) {
  const t = useTranslations("theme");
  const [overrides, setOverrides] = useState<ThemeOverrides>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function setToken(token: string, value: string) {
    setSaved(false);
    setError(null);
    setOverrides((prev) => {
      const next = { ...prev };
      if (value.trim() === "") delete next[token];
      else next[token] = value;
      return next;
    });
  }

  async function save() {
    // Local pre-check mirrors the server allowlist for a friendly inline error.
    const bad = Object.entries(overrides).find(
      ([, v]) => !isSafeColorValue(v),
    );
    if (bad) {
      setError(t("invalidValue", { token: bad[0], value: bad[1] }));
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overrides),
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
      // The server drops unknown tokens / unsafe values — adopt its truth.
      setOverrides((await res.json()) as ThemeOverrides);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-surface-raised">
        {THEME_TOKENS.map((token) => {
          const value = overrides[token] ?? "";
          // <input type="color"> only accepts #rrggbb — pass it through only for
          // hex, else leave the swatch at a neutral default (the text field owns
          // non-hex values like oklch()).
          const swatch = /^#[0-9a-f]{6}$/i.test(value) ? value : "#888888";
          return (
            <li
              key={token}
              className="flex items-center gap-3 px-3 py-2"
            >
              <span className="w-40 shrink-0 font-mono text-sm text-foreground">
                {token}
              </span>
              <input
                type="color"
                className="h-8 w-10 shrink-0 cursor-pointer rounded border border-border bg-surface"
                value={swatch}
                onChange={(e) => setToken(token, e.target.value)}
                aria-label={t("swatchLabel", { token })}
              />
              <input
                type="text"
                className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-sm text-foreground"
                placeholder={t("placeholder")}
                value={value}
                onChange={(e) => setToken(token, e.target.value)}
                aria-label={t("valueLabel", { token })}
              />
              <button
                type="button"
                className="rounded border border-border px-2 py-1 text-sm text-foreground-muted hover:text-foreground disabled:opacity-40"
                disabled={value === ""}
                onClick={() => setToken(token, "")}
              >
                {t("reset")}
              </button>
            </li>
          );
        })}
      </ul>

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
