"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { setLocaleValue, buildSeoMetaBody } from "@/lib/pages/page-meta";
import type { PageSummary } from "@/db/page-store";
import { LocalePicker, useLocalePicker } from "./locale-picker";
import { ImagePicker } from "./image-picker";

/**
 * Right-rail SEO tab: edits the selected page's per-content-locale meta title +
 * description and PUTs them back through the EXISTING C2 `/api/pages` route
 * (same body `validatePageMeta` validates — no new page-store/validation path).
 * Slug / parent / publish are kept as-is; this tab only owns SEO. After a
 * successful save it refetches pages so the picker labels stay current.
 *
 * ponytail: local draft maps seeded from the loaded page (re-keyed per page id
 * by the caller); no form lib. Reuses the pure setLocaleValue/buildSeoMetaBody
 * helpers (tested in page-meta.test.ts).
 */
export function SeoForm({
  page,
  locales,
  onSaved,
}: {
  page: PageSummary;
  locales: string[];
  onSaved: () => void;
}) {
  const t = useTranslations("pageBuilder");
  const [metaTitle, setMetaTitle] = useState<Record<string, string>>({
    ...page.metaTitle,
  });
  const [metaDescription, setMetaDescription] = useState<Record<string, string>>({
    ...page.metaDescription,
  });
  const [metaImage, setMetaImage] = useState<Record<string, string>>({
    ...page.metaImage,
  });
  const [noindex, setNoindex] = useState<boolean>(page.noindex);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const picker = useLocalePicker(locales);
  const loc = picker.active;

  async function save() {
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const body = buildSeoMetaBody(page, metaTitle, metaDescription, metaImage, noindex);
      const res = await fetch("/api/pages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `HTTP ${res.status}`);
        return;
      }
      setSaved(true);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p className="truncate font-mono text-xs text-foreground-muted">{page.slug}</p>
      <LocalePicker state={picker} label={t("localePickerLabel")} />
      <fieldset key={loc} className="flex flex-col gap-2 border-t border-border pt-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground-muted">{t("seoMetaTitle")}</span>
          <input
            className={input}
            value={metaTitle[loc] ?? ""}
            onChange={(e) =>
              setMetaTitle((m) => setLocaleValue(m, loc, e.target.value))
            }
            aria-label={`${t("seoMetaTitle")} (${loc})`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground-muted">{t("seoMetaDescription")}</span>
          <textarea
            className={input}
            rows={3}
            value={metaDescription[loc] ?? ""}
            onChange={(e) =>
              setMetaDescription((m) => setLocaleValue(m, loc, e.target.value))
            }
            aria-label={`${t("seoMetaDescription")} (${loc})`}
          />
        </label>
        <div className="border-t border-border pt-3">
          <ImagePicker
            value={metaImage[loc] ?? ""}
            label={`${t("seoMetaImage")} (${loc})`}
            onChange={(url) => setMetaImage((m) => setLocaleValue(m, loc, url))}
          />
        </div>
        <OgAutoImage pageId={page.id} locale={loc} hasManual={!!(metaImage[loc] ?? "").trim()} />
      </fieldset>

      <label className="flex items-start gap-2 border-t border-border pt-3">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={noindex}
          onChange={(e) => setNoindex(e.target.checked)}
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm text-foreground">{t("seoNoindex")}</span>
          <span className="text-xs text-foreground-muted">{t("seoNoindexHint")}</span>
        </span>
      </label>

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      {saved && !error && (
        <p role="status" className="text-xs text-foreground-muted">
          {t("seoSaved")}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {busy ? t("saving") : t("seoSave")}
      </button>
    </form>
  );
}

const OG_ERR_KEY: Record<string, string> = {
  manualWins: "ogErrManualWins",
  noUrl: "ogErrNoUrl",
  noBinding: "ogErrNoBinding",
  noOrigin: "ogErrNoOrigin",
  error: "ogErrError",
  badLocale: "ogErrError",
};

/**
 * Auto OG-image status + regenerate for the ACTIVE locale. Shows which image is
 * effective (manual upload / auto screenshot / none) and a "Generate from page"
 * button that FORCE-reshoots (skips the publish hook's idempotency). Disabled
 * when a manual image is set (an upload always wins). Best-effort: on a deploy-
 * only feature (no BROWSER binding locally) POST returns a localized reason.
 *
 * ponytail: re-keyed by pageId+locale via `key` in the parent fieldset (loc is
 * the fieldset key), so state resets on locale switch — no manual reset needed.
 */
function OgAutoImage({
  pageId,
  locale,
  hasManual,
}: {
  pageId: string;
  locale: string;
  hasManual: boolean;
}) {
  const t = useTranslations("pageBuilder");
  const [source, setSource] = useState<"manual" | "auto" | "none">(
    hasManual ? "manual" : "none",
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/pages/${pageId}/og-image?locale=${encodeURIComponent(locale)}`,
      );
      if (!res.ok) return;
      const j = (await res.json()) as { manual?: boolean; autoExists?: boolean };
      setSource(j.manual ? "manual" : j.autoExists ? "auto" : "none");
    } catch {
      /* leave last-known source */
    }
  }, [pageId, locale]);

  useEffect(() => {
    // Reflect the just-saved manual value immediately; then confirm auto from R2.
    setSource(hasManual ? "manual" : "none");
    if (!hasManual) void refresh();
  }, [hasManual, refresh]);

  async function regenerate() {
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/pages/${pageId}/og-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      const j = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) {
        setMsg({ ok: false, text: t(OG_ERR_KEY[j.code ?? "error"] ?? "ogErrError") });
        return;
      }
      setSource("auto");
      setMsg({ ok: true, text: t("ogRegenerated") });
    } catch {
      setMsg({ ok: false, text: t("ogErrError") });
    } finally {
      setBusy(false);
    }
  }

  const badge =
    source === "manual"
      ? t("ogSourceManual")
      : source === "auto"
        ? t("ogSourceAuto")
        : t("ogSourceNone");

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-foreground-muted">{t("ogAutoTitle")}</span>
        <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-foreground-muted">
          {badge}
        </span>
      </div>
      <p className="text-xs text-foreground-muted">{t("ogAutoHint")}</p>
      <button
        type="button"
        onClick={() => void regenerate()}
        disabled={busy || hasManual}
        className="self-start rounded-md border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-60"
      >
        {busy ? t("ogRegenerating") : t("ogRegenerate")}
      </button>
      {msg && (
        <p
          role={msg.ok ? "status" : "alert"}
          className={`text-xs ${msg.ok ? "text-foreground-muted" : "text-danger"}`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
