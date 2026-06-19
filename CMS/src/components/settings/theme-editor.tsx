"use client";

/**
 * CMS per-Site theme configurator (Milestone 2, epic E1). Groups the purpose
 * color tokens into collapsible families (Brand, Surfaces, Text, …) — inspired
 * by the aicms theme editor — each row showing a swatch-cluster summary that
 * expands to per-token swatch + free-text controls. A live preview panel re-
 * themes instantly as you edit (overrides applied as inline --color-* vars).
 *
 * Storage is single-palette: overrides serialize to `:root{}` and win over
 * globals.css on the published route (see lib/render/theme.ts). The published
 * site's dark mode comes from globals' [data-theme="dark"], which overrides
 * don't touch — so there's no Light/Dark split here (unlike aicms).
 *
 * GET/PUT `/api/settings/theme`; the server re-validates (known tokens + safe
 * colors), so the validation source of truth stays lib/render/theme.ts. REST
 * only, copy via next-intl. ponytail: optimistic local edit then one PUT;
 * native <input type="color"> + text field; no form lib, no picker lib.
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  THEME_TOKENS,
  isSafeColorValue,
  type ThemeOverrides,
  type ThemeToken,
} from "@/lib/render/theme";

/** Token families — keys are i18n labels (theme.group.<key>). Every entry must
 * be a real THEME_TOKEN; the groups below partition all 24 tokens exactly. */
const GROUPS: { key: string; tokens: ThemeToken[] }[] = [
  {
    key: "brand",
    tokens: ["primary", "primary-hover", "primary-foreground", "primary-subtle", "ring"],
  },
  { key: "surfaces", tokens: ["surface", "surface-muted", "surface-raised"] },
  { key: "text", tokens: ["foreground", "foreground-muted"] },
  { key: "borders", tokens: ["border"] },
  { key: "success", tokens: ["success", "success-foreground", "success-subtle"] },
  { key: "warning", tokens: ["warning", "warning-foreground", "warning-subtle"] },
  { key: "info", tokens: ["info", "info-foreground", "info-subtle"] },
  {
    key: "danger",
    tokens: ["danger", "danger-hover", "danger-foreground", "danger-subtle"],
  },
];

/** Default swatch shown when a token has no override or a non-hex value. */
const NEUTRAL = "#888888";
const hexOf = (v: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : NEUTRAL);

/** Inline --color-* vars for the live-preview container, from current edits. */
function previewVars(overrides: ThemeOverrides): React.CSSProperties {
  const style: Record<string, string> = {};
  for (const [token, value] of Object.entries(overrides)) {
    if (isSafeColorValue(value)) style[`--color-${token}`] = value;
  }
  return style as React.CSSProperties;
}

export function ThemeEditor({ initial }: { initial: ThemeOverrides }) {
  const t = useTranslations("theme");
  const [overrides, setOverrides] = useState<ThemeOverrides>(initial);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirtyCount = useMemo(() => Object.keys(overrides).length, [overrides]);

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

  function resetAll() {
    setSaved(false);
    setError(null);
    setOverrides({});
  }

  async function save() {
    const bad = Object.entries(overrides).find(([, v]) => !isSafeColorValue(v));
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
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-foreground-muted">
          {t("overrideCount", { count: dirtyCount })}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground-muted hover:text-foreground disabled:opacity-40"
            disabled={dirtyCount === 0}
            onClick={resetAll}
          >
            {t("resetAll")}
          </button>
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? t("saving") : t("save")}
          </button>
        </div>
      </div>

      {/* Grouped, collapsible families */}
      <ul className="flex flex-col gap-2">
        {GROUPS.map((group) => {
          const isOpen = open[group.key] ?? false;
          return (
            <li
              key={group.key}
              className="rounded-md border border-border bg-surface-raised"
            >
              <button
                type="button"
                onClick={() =>
                  setOpen((p) => ({ ...p, [group.key]: !isOpen }))
                }
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className="flex-1 font-medium text-foreground">
                  {t(`group.${group.key}`)}
                </span>
                {/* Swatch-cluster summary */}
                <span className="flex -space-x-1.5" aria-hidden>
                  {group.tokens.map((token) => (
                    <span
                      key={token}
                      className="h-4 w-4 rounded-full border border-border"
                      style={{ background: hexOf(overrides[token] ?? "") }}
                    />
                  ))}
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={
                    "shrink-0 text-foreground-muted transition-transform " +
                    (isOpen ? "rotate-180" : "")
                  }
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {isOpen && (
                <ul className="flex flex-col divide-y divide-border border-t border-border">
                  {group.tokens.map((token) => {
                    const value = overrides[token] ?? "";
                    return (
                      <li
                        key={token}
                        className="flex items-center gap-3 px-4 py-2"
                      >
                        <span className="w-40 shrink-0 font-mono text-sm text-foreground">
                          {token}
                        </span>
                        <input
                          type="color"
                          className="h-8 w-10 shrink-0 cursor-pointer rounded border border-border bg-surface"
                          value={hexOf(value)}
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
              )}
            </li>
          );
        })}
      </ul>

      {/* Live preview — overrides applied as inline vars so the sample re-themes
          instantly without affecting the admin chrome. */}
      <section
        style={previewVars(overrides)}
        className="rounded-md border border-border bg-surface p-4"
      >
        <h3 className="mb-3 text-sm font-medium text-foreground-muted">
          {t("preview")}
        </h3>
        <div className="flex flex-col gap-3 rounded-md bg-surface-raised p-4">
          <p className="text-foreground">{t("previewHeading")}</p>
          <p className="text-sm text-foreground-muted">{t("previewBody")}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
            >
              {t("previewPrimary")}
            </button>
            <button
              type="button"
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
            >
              {t("previewSecondary")}
            </button>
            <span className="rounded-md bg-success-subtle px-2 py-1 text-xs text-success">
              {t("previewSuccess")}
            </span>
            <span className="rounded-md bg-danger-subtle px-2 py-1 text-xs text-danger">
              {t("previewDanger")}
            </span>
          </div>
        </div>
      </section>

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
    </div>
  );
}

/** Compile-time guard: GROUPS must cover every THEME_TOKEN exactly once. */
const _grouped = GROUPS.flatMap((g) => g.tokens);
if (
  _grouped.length !== THEME_TOKENS.length ||
  new Set(_grouped).size !== THEME_TOKENS.length
) {
  // ponytail: cheap dev-time assert so a future token added to THEME_TOKENS
  // can't silently drop out of the configurator.
  console.error("theme-editor: GROUPS do not partition THEME_TOKENS");
}
