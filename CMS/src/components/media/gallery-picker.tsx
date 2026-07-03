/**
 * Media gallery PICKER — a modal wrapper around the shared `MediaLibrary`
 * (pick mode). Used by the chat input (read/reference intent) AND the
 * page-builder image fields (Block-tab image props + SEO OG image). All the
 * library features (search, upload, pagination, details rail, lightbox,
 * tags, delete) live in `media-library.tsx`; this file only owns the modal
 * chrome and the select-then-confirm flow (`onConfirm` gets the picks —
 * the chat may use several, an image field takes the first).
 */
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MediaLibrary, type GalleryAsset } from "./media-library";

export type { GalleryAsset };

export function GalleryPicker({
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
  const [picked, setPicked] = useState<GalleryAsset[]>([]);

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
      <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-surface-raised shadow-xl">
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

        <MediaLibrary mode="pick" onSelection={setPicked} onEscape={onClose} className="min-h-0 flex-1" />

        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <span className="text-xs text-foreground-muted">
            {t("gallery.selectedCount", { count: picked.length })}
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
              onClick={() => picked.length > 0 && onConfirm(picked)}
              disabled={picked.length === 0}
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
