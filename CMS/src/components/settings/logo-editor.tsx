"use client";

/**
 * Theme LOGO section — the brand-mark sibling of ThemeEditor/FontsEditor on
 * `/admin/settings/theme`.
 *
 * One asset URL, picked (or uploaded) via the shared gallery `ImagePicker`,
 * previewed on a light AND a dark tile (logos are routinely white-on-dark, so
 * a single-surface preview hides half the story). PUT
 * `/api/settings/theme/logo { url }`; the server validates (site /media URLs
 * only) and we adopt its normalized truth. REST only, copy via next-intl.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePicker } from "@/components/page-builder/image-picker";

export function LogoEditor({ initial }: { initial: string }) {
  const t = useTranslations("theme");
  const [url, setUrl] = useState(initial);
  const [savedUrl, setSavedUrl] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = url !== savedUrl;

  function pick(next: string) {
    setSaved(false);
    setError(null);
    setUrl(next);
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/theme/logo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
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
      // Adopt the server's normalized truth (e.g. a re-stamped dims query).
      const normalized = ((await res.json()) as { url?: string }).url ?? "";
      setUrl(normalized);
      setSavedUrl(normalized);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-foreground">{t("logo.title")}</h2>
          <p className="mt-0.5 text-sm text-foreground-muted">{t("logo.subtitle")}</p>
        </div>
        <button
          type="button"
          className="rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          disabled={busy || !dirty}
          onClick={() => void save()}
        >
          {busy ? t("saving") : t("logo.save")}
        </button>
      </div>

      <div className="flex flex-col gap-4 rounded-md border border-border bg-surface-raised p-4">
        <ImagePicker value={url} onChange={pick} />

        {/* Preview on both grounds — logos are often single-color marks that
            vanish on one of the two. Fixed white/near-black tiles, NOT theme
            tokens: this previews the mark itself, not the admin palette. */}
        {url && (
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["onLight", "#ffffff"],
                ["onDark", "#171717"],
              ] as const
            ).map(([key, bg]) => (
              <figure key={key} className="flex flex-col gap-1">
                <div
                  className="flex h-28 items-center justify-center rounded-md border border-border p-4"
                  style={{ background: bg }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="max-h-full max-w-full object-contain" />
                </div>
                <figcaption className="text-xs text-foreground-muted">
                  {t(`logo.${key}`)}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>

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
          {t("logo.saved")}
        </p>
      )}
    </section>
  );
}
