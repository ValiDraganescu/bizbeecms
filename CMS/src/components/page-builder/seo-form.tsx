"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { setLocaleValue, buildSeoMetaBody } from "@/lib/pages/page-meta";
import type { PageSummary } from "@/db/page-store";
import { LocalePicker, useLocalePicker } from "./locale-picker";

/**
 * Per-locale OG-image picker for the SEO tab. Stores a single asset URL for the
 * active locale. Browses the existing R2 media library via GET /api/assets (the
 * same source as components/media/media-gallery.tsx) — opens a thumbnail grid on
 * demand, no upload/delete here (that lives in the Media admin). PURE-fetch, REST
 * only. Empty value = no OG image for this locale (render omits og:image).
 *
 * ponytail: lazy gallery fetch the first time the picker opens; refetch is cheap
 * and the list is small. No dep, native <img>.
 */
function MetaImagePicker({
  value,
  locale,
  onChange,
}: {
  value: string;
  locale: string;
  onChange: (url: string) => void;
}) {
  const t = useTranslations("pageBuilder");
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<{ key: string; url: string; filename: string }[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    let live = true;
    void fetch("/api/assets")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        if (live) {
          setAssets(list as { key: string; url: string; filename: string }[]);
          setLoaded(true);
        }
      })
      .catch(() => setLoaded(true));
    return () => {
      live = false;
    };
  }, [open, loaded]);

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <span className="text-xs text-foreground-muted">
        {`${t("seoMetaImage")} (${locale})`}
      </span>
      {value ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt=""
            className="h-16 w-16 rounded-md border border-border object-cover"
          />
          <div className="flex flex-col gap-1">
            <span className="truncate font-mono text-xs text-foreground-muted" title={value}>
              {value}
            </span>
            <button
              type="button"
              onClick={() => onChange("")}
              className="self-start text-xs text-danger hover:underline"
            >
              {t("seoMetaImageRemove")}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-foreground-muted">{t("seoMetaImageEmpty")}</p>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="self-start rounded-md border border-border bg-surface-raised px-3 py-1.5 text-xs text-foreground hover:bg-surface-muted"
      >
        {open ? t("seoMetaImageClose") : t("seoMetaImagePick")}
      </button>
      {open && (
        <div className="rounded-md border border-border bg-surface p-2">
          {!loaded ? (
            <p className="text-xs text-foreground-muted">{t("loading")}</p>
          ) : assets.length === 0 ? (
            <p className="text-xs text-foreground-muted">{t("seoMetaImageGalleryEmpty")}</p>
          ) : (
            <ul className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto">
              {assets.map((a) => (
                <li key={a.key}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(a.url);
                      setOpen(false);
                    }}
                    title={a.filename}
                    className={`block w-full overflow-hidden rounded-md border ${
                      value === a.url ? "border-primary" : "border-border"
                    } hover:border-primary`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt={a.filename} className="aspect-square w-full object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

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
      const body = buildSeoMetaBody(page, metaTitle, metaDescription, metaImage);
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
        <MetaImagePicker
          value={metaImage[loc] ?? ""}
          locale={loc}
          onChange={(url) => setMetaImage((m) => setLocaleValue(m, loc, url))}
        />
      </fieldset>

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
