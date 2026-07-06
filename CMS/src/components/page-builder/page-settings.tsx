"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  buildCacheMaxAgeBody,
  buildLocalizedSlugsBody,
  buildPublishToggleBody,
  CACHE_MAX_AGE_OPTIONS,
  isValidSlug,
} from "@/lib/pages/page-meta";
import type { PageSummary } from "@/db/page-store";

/**
 * Right-rail PAGE tab for the selected page: a publish/unpublish toggle and a
 * delete action. Both use EXISTING REST — publish flips publishStatus via the
 * full-meta `PUT /api/pages` (pure `buildPublishToggleBody`, meta untouched);
 * delete is `DELETE /api/pages?id=`. Delete is gated by an IN-APP confirm (NOT
 * native window.confirm — that blocks browser automation), and clears the
 * builder selection on success.
 */
export function PageSettings({
  page,
  locales,
  onChanged,
  onDeleted,
}: {
  page: PageSummary;
  /** Site content locales, DEFAULT FIRST — non-default ones get a slug input. */
  locales: string[];
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("pageBuilder");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Draft per-locale slug overrides (Stage 2 localized slugs). Keyed by the
  // page id via the caller's `key={page.id}` remount, same as SeoForm drafts.
  const [slugDrafts, setSlugDrafts] = useState<Record<string, string>>({
    ...page.localizedSlugs,
  });
  const published = page.publishStatus === "published";
  const extraLocales = locales.slice(1); // default locale = the plain slug column

  async function togglePublish() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/pages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPublishToggleBody(page)),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `HTTP ${res.status}`);
        return;
      }
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setCacheMaxAge(seconds: number) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/pages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCacheMaxAgeBody(page, seconds)),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `HTTP ${res.status}`);
        return;
      }
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveLocalizedSlugs() {
    setError(null);
    const bad = extraLocales.find(
      (loc) => (slugDrafts[loc] ?? "").trim() !== "" && !isValidSlug(slugDrafts[loc]),
    );
    if (bad) {
      setError(t("page.localizedSlugInvalid", { locale: bad }));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/pages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildLocalizedSlugsBody(page, slugDrafts)),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        setError(j.code === "slugIsLocaleCode" ? t("create.slugIsLocaleCode") : j.error ?? `HTTP ${res.status}`);
        return;
      }
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/pages?id=${encodeURIComponent(page.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `HTTP ${res.status}`);
        return;
      }
      onDeleted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const btn =
    "rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50";

  return (
    <div className="flex flex-col gap-4">
      {/* PUBLISH STATE */}
      <div className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-wide text-foreground-muted">
          {t("page.statusLabel")}
        </span>
        <span className="text-sm text-foreground">
          {published ? t("page.statusPublished") : t("page.statusDraft")}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void togglePublish()}
          className={`${btn} self-start bg-primary text-primary-foreground hover:opacity-90`}
        >
          {published ? t("page.unpublish") : t("page.publish")}
        </button>
      </div>

      {/* EDGE CACHE opt-in (0 = never cache; the custom worker entrypoint
          turns a positive value into Cache-Control/Cache-Tag headers) */}
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <label
          htmlFor="bb-page-cache-max-age"
          className="text-xs uppercase tracking-wide text-foreground-muted"
        >
          {t("page.cacheLabel")}
        </label>
        <select
          id="bb-page-cache-max-age"
          disabled={busy}
          value={page.cacheMaxAge}
          onChange={(e) => void setCacheMaxAge(Number(e.target.value))}
          className="self-start rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground disabled:opacity-50"
        >
          {CACHE_MAX_AGE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {t(`page.cacheOption${s}`)}
            </option>
          ))}
        </select>
        <p className="text-xs text-foreground-muted">{t("page.cacheHint")}</p>
      </div>

      {/* LOCALIZED SLUGS (Stage 2): per-locale slug overrides for non-default
          locales; empty = fall back to the default slug */}
      {extraLocales.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <span className="text-xs uppercase tracking-wide text-foreground-muted">
            {t("page.localizedSlugsLabel")}
          </span>
          {extraLocales.map((loc) => (
            <label key={loc} className="flex items-center gap-2">
              <span className="w-8 font-mono text-xs text-foreground-muted">{loc}</span>
              <input
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted"
                value={slugDrafts[loc] ?? ""}
                placeholder={page.slug}
                disabled={busy}
                onChange={(e) =>
                  setSlugDrafts((m) => ({ ...m, [loc]: e.target.value }))
                }
                aria-label={`${t("page.localizedSlugsLabel")} (${loc})`}
              />
            </label>
          ))}
          <p className="text-xs text-foreground-muted">{t("page.localizedSlugsHint")}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveLocalizedSlugs()}
            className={`${btn} self-start bg-primary text-primary-foreground hover:opacity-90`}
          >
            {t("page.localizedSlugsSave")}
          </button>
        </div>
      )}

      {/* DELETE (in-app confirm, no native window.confirm) */}
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <span className="text-xs uppercase tracking-wide text-foreground-muted">
          {t("page.dangerLabel")}
        </span>
        {confirming ? (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-muted p-3">
            <p className="text-sm text-foreground">{t("page.deleteConfirm")}</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove()}
                className={`${btn} bg-danger text-danger-foreground hover:bg-danger-hover`}
              >
                {t("page.deleteAction")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(false)}
                className={`${btn} border border-border text-foreground hover:bg-surface-muted`}
              >
                {t("page.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(true)}
            className={`${btn} self-start border border-danger text-danger hover:bg-danger-subtle`}
          >
            {t("page.delete")}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
