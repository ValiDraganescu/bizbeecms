"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { GalleryPicker } from "@/components/media/gallery-picker";
import { withAssetDims } from "@/lib/render/asset";

/**
 * Inline image field — stores a single asset URL, picked from a MODAL gallery
 * (the same `GalleryPicker` the chat input uses: search / upload / delete /
 * tag, browsing GET /api/assets). The field shows the current thumbnail + URL
 * with a clear button, and a button that opens the gallery modal; picking one
 * asset returns its URL and closes. Empty value = no image.
 *
 * Shared by the SEO tab's OG-image field and the Block tab's image PROPS (a prop
 * declared `type:"image"` or whose name looks image-ish — see `isImageProp`).
 *
 * ponytail: reuses the chat gallery wholesale (single-select = take the first
 * picked asset) instead of a second inline grid. Native <img> for the preview.
 */
export function ImagePicker({
  value,
  label,
  onChange,
}: {
  value: string;
  /**
   * Optional field label shown above the picker (e.g. "OG image (en)"). Omit when
   * the caller already renders the field label (the Block tab does, per prop).
   */
  label?: string;
  onChange: (url: string) => void;
}) {
  const t = useTranslations("pageBuilder");
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <span className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
          {label}
        </span>
      )}
      {value ? (
        <div className="flex items-center gap-3">
          {/* Thumbnail only — the long /media URL adds noise; the path lives in the
              title tooltip if needed. Click the thumb to re-open the gallery. */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            title={value}
            className="block h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border hover:border-primary"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" className="h-full w-full object-cover" />
          </button>
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-xs text-danger hover:underline"
          >
            {t("seoMetaImageRemove")}
          </button>
        </div>
      ) : (
        // Empty state: no thumbnail to click, so show the picker button.
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="self-start rounded-md border border-border bg-surface-raised px-3 py-1.5 text-xs text-foreground hover:bg-surface-muted"
        >
          {t("seoMetaImagePick")}
        </button>
      )}
      {open && (
        <GalleryPicker
          title={t("seoMetaImagePick")}
          confirmLabel={t("seoMetaImagePick")}
          onConfirm={(assets) => {
            const first = assets[0];
            // Bake the asset's intrinsic dims onto the URL (?w=&h=) at pick time so
            // the render path can reserve the CLS box without a per-request D1 read.
            // withAssetDims returns the plain URL when dims are absent/invalid.
            if (first) onChange(withAssetDims(first.url, first.width, first.height));
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
