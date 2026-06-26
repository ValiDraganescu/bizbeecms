/**
 * ai-attachments — a modal gallery picker for the chat input. Browses the Site's
 * R2 media library (GET /api/assets, the same source the page-builder + media
 * library use — not forked) as a thumbnail grid and lets the operator pick one or
 * more. Reused for BOTH chat attach intents:
 *   - "read"      → the chosen files are inlined (base64) so the model can read them
 *   - "reference" → the chosen files' /media URLs are handed to the model to USE
 * The caller decides which intent via the picker it opens; this component just
 * returns the selected assets. Non-image assets (PDFs/docs) still show with a
 * filename tile so they can be picked for "read".
 */
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export interface GalleryAsset {
  key: string;
  url: string;
  filename: string;
  /** MIME type when the list endpoint provides it; "" if unknown. */
  contentType?: string;
}

function isImage(a: GalleryAsset): boolean {
  return (a.contentType ?? "").toLowerCase().startsWith("image/");
}

export function ChatGalleryPicker({
  title,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  confirmLabel: string;
  onConfirm: (assets: GalleryAsset[]) => void;
  onClose: () => void;
}) {
  const t = useTranslations("chat");
  const [assets, setAssets] = useState<GalleryAsset[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    let live = true;
    void fetch("/api/assets")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        if (live) {
          setAssets(list as GalleryAsset[]);
          setLoaded(true);
        }
      })
      .catch(() => setLoaded(true));
    return () => {
      live = false;
    };
  }, []);

  // Esc closes the modal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggle(key: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function confirm() {
    const picked = assets.filter((a) => selected.has(a.key));
    if (picked.length > 0) onConfirm(picked);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-surface-raised shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="font-semibold text-foreground">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("gallery.close")}
            className="text-foreground-muted hover:text-foreground"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!loaded ? (
            <p className="text-foreground-muted">{t("gallery.loading")}</p>
          ) : assets.length === 0 ? (
            <p className="text-foreground-muted">{t("gallery.empty")}</p>
          ) : (
            <ul className="grid grid-cols-3 gap-3">
              {assets.map((a) => {
                const on = selected.has(a.key);
                return (
                  <li key={a.key}>
                    <button
                      type="button"
                      onClick={() => toggle(a.key)}
                      title={a.filename}
                      aria-pressed={on}
                      className={`flex w-full flex-col overflow-hidden rounded-md border text-left ${
                        on ? "border-primary ring-2 ring-ring" : "border-border hover:border-primary"
                      }`}
                    >
                      {isImage(a) ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={a.url} alt={a.filename} className="aspect-square w-full object-cover" />
                      ) : (
                        <span className="flex aspect-square w-full items-center justify-center bg-surface-muted text-foreground-muted">
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <path d="M14 2v6h6" />
                          </svg>
                        </span>
                      )}
                      <span className="truncate px-2 py-1 text-xs text-foreground">{a.filename}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <span className="text-xs text-foreground-muted">
            {t("gallery.selectedCount", { count: selected.size })}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-surface-muted"
            >
              {t("gallery.cancel")}
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={selected.size === 0}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
