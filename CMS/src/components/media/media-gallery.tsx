"use client";

/**
 * CMS media library UI (Milestone 2, epic D1) — upload images to R2 and browse
 * them. POSTs multipart to `/api/assets`, lists from GET, deletes via DELETE.
 *
 * REST-only (no server actions). All copy via next-intl (EN/FI/ET). Styling
 * uses the purpose-token Tailwind utilities (bg-surface, text-foreground, …) —
 * never raw colors. Admin pages get real build-time class scanning, so they
 * are NOT limited to the A3 bounded runtime vocabulary.
 *
 * ponytail: optimistic-ish list (refetch after each mutation); the server is
 * the validation source of truth (`validateAsset`). No form lib, no dropzone
 * dep — a native <input type="file">. "Copy URL" uses navigator.clipboard.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ALLOWED_ASSET_TYPES, MAX_ASSET_SIZE, validateAsset } from "@/lib/render/asset";

type Asset = {
  key: string;
  filename: string;
  contentType: string;
  size: number;
  url: string;
};

export function MediaGallery({ initial }: { initial: Asset[] }) {
  const t = useTranslations("media");
  const [assets, setAssets] = useState<Asset[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/assets");
    if (res.ok) setAssets((await res.json()) as Asset[]);
  }

  async function upload(file: File) {
    setError(null);
    const check = validateAsset(file.type, file.size);
    if (!check.valid) {
      setError(check.error);
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/assets", { method: "POST", body: form });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? t("uploadFailed"));
        return;
      }
      await refresh();
    } catch {
      setError(t("uploadFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(key: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/assets?key=${encodeURIComponent(key)}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? t("deleteFailed"));
        return;
      }
      setAssets((cur) => cur.filter((a) => a.key !== key));
    } catch {
      setError(t("deleteFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied((c) => (c === url ? null : c)), 1500);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="rounded-lg border border-border bg-surface-raised p-4">
        <label className="flex flex-col gap-2 text-sm text-foreground">
          <span className="font-medium">{t("uploadLabel")}</span>
          <input
            type="file"
            accept={ALLOWED_ASSET_TYPES.join(",")}
            disabled={busy}
            className="text-foreground-muted file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground hover:file:bg-primary-hover disabled:opacity-50"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
          <span className="text-xs text-foreground-muted">
            {t("uploadHint", { max: MAX_ASSET_SIZE / 1024 / 1024 })}
          </span>
        </label>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>

      {assets.length === 0 ? (
        <p className="text-foreground-muted">{t("empty")}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {assets.map((a) => (
            <li
              key={a.key}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.url}
                alt={a.filename}
                className="aspect-square w-full rounded-md border border-border object-cover"
              />
              <span className="truncate text-xs text-foreground" title={a.filename}>
                {a.filename}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void copyUrl(a.url)}
                  className="flex-1 rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-foreground hover:bg-surface-muted"
                >
                  {copied === a.url ? t("copied") : t("copyUrl")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(a.key)}
                  className="rounded-md border border-border px-2 py-1 text-xs text-danger hover:bg-surface-muted disabled:opacity-50"
                >
                  {t("delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
