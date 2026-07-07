"use client";

import { useState } from "react";
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
