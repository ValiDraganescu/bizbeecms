"use client";

/**
 * Theme FONTS section (theme-fonts) — the typography sibling of ThemeEditor.
 *
 * Three purpose SLOTS (body / heading / accent), each a <select> over the
 * curated FONT_CATALOG grouped by category, with a live sample line rendered
 * in the picked family. Fonts are mode-less (no light/dark split).
 *
 * PREVIEW vs PUBLISHED sourcing: the editor loads ONE Google css2 stylesheet
 * for the whole catalog so samples render instantly while browsing (the
 * designer's own admin browser, an explicit editing choice). Published pages
 * NEVER touch Google — saving triggers the server to download + self-host the
 * WOFF2s in R2 (see /api/settings/theme/fonts), and visitors get /media/ URLs.
 *
 * PUT /api/settings/theme/fonts { slots }; the server validates against the
 * catalog, fetches the files, and returns the normalized truth we adopt.
 * ponytail: native <select>, no combobox lib; sample text carries ÄÖÕŠŽ so a
 * family missing latin-ext shows itself immediately.
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  FONT_CATALOG,
  FONT_SLOTS,
  type FontCategory,
  type FontSlot,
  type ThemeFonts,
  fontStack,
} from "@/lib/render/fonts";
import { buildCss2Url } from "@/lib/settings/google-fonts";

const CATEGORIES: FontCategory[] = ["sans", "serif", "display", "script", "mono"];

/** One css2 URL covering every catalog family+weight (editor preview only). */
function catalogPreviewUrl(): string {
  const params = FONT_CATALOG.map((f) =>
    buildCss2Url(f.family, f.weights).replace(
      "https://fonts.googleapis.com/css2?",
      "",
    ).replace("&display=swap", ""),
  ).join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

export function FontsEditor({ initial }: { initial: ThemeFonts }) {
  const t = useTranslations("theme");
  const [slots, setSlots] = useState<Partial<Record<FontSlot, string>>>(() => {
    const out: Partial<Record<FontSlot, string>> = {};
    for (const s of FONT_SLOTS) {
      const fam = initial.slots[s]?.family;
      if (fam) out[s] = fam;
    }
    return out;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const previewHref = useMemo(catalogPreviewUrl, []);

  function pick(slot: FontSlot, family: string) {
    setSaved(false);
    setError(null);
    setSlots((p) => {
      const next = { ...p };
      if (family === "") delete next[slot];
      else next[slot] = family;
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const body = {
        slots: Object.fromEntries(
          Object.entries(slots).map(([s, family]) => [s, { family }]),
        ),
      };
      const res = await fetch("/api/settings/theme/fonts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
      // Adopt the server's normalized truth (slots that survived validation).
      const normalized = (await res.json()) as ThemeFonts;
      const next: Partial<Record<FontSlot, string>> = {};
      for (const s of FONT_SLOTS) {
        const fam = normalized.slots[s]?.family;
        if (fam) next[s] = fam;
      }
      setSlots(next);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      {/* Catalog stylesheet for EDITOR samples only — published pages get
          self-hosted /media/ files (see module comment). */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={previewHref} />
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-medium text-foreground">{t("fonts.title")}</h2>
          <p className="mt-1 text-sm text-foreground-muted">{t("fonts.subtitle")}</p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? t("saving") : t("fonts.save")}
        </button>
      </header>

      <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-surface-raised">
        {FONT_SLOTS.map((slot) => {
          const family = slots[slot] ?? "";
          return (
            <li key={slot} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="w-40 shrink-0">
                  <span className="font-medium text-foreground">
                    {t(`fonts.slot.${slot}`)}
                  </span>
                  <p className="text-xs text-foreground-muted">
                    {t(`fonts.hint.${slot}`)}
                  </p>
                </div>
                <select
                  className="min-w-52 rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
                  value={family}
                  disabled={busy}
                  aria-label={t(`fonts.slot.${slot}`)}
                  onChange={(e) => pick(slot, e.target.value)}
                >
                  <option value="">{t("fonts.systemDefault")}</option>
                  {CATEGORIES.map((cat) => (
                    <optgroup key={cat} label={t(`fonts.category.${cat}`)}>
                      {FONT_CATALOG.filter((f) => f.category === cat).map((f) => (
                        <option key={f.family} value={f.family}>
                          {f.family}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              {/* Live sample — diacritics included so missing latin-ext is visible. */}
              <p
                className={
                  slot === "heading"
                    ? "text-2xl text-foreground"
                    : "text-base text-foreground"
                }
                style={family ? { fontFamily: fontStack(family) } : undefined}
              >
                {t("fonts.sample")}
              </p>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-foreground-muted">{t("fonts.selfHostNote")}</p>

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
    </section>
  );
}
