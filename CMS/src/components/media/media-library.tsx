/**
 * THE media library UI — one component behind both surfaces:
 *   - `/admin/media` (mode "manage"): browse/upload/tag/delete the R2 library.
 *   - `GalleryPicker` (mode "pick"): the same library inside a modal, plus
 *     multi-select reported to the caller via `onSelection`.
 *
 * Features: debounced `?q=` search (AI description + filename + tags), multi
 * upload, PAGINATED thumbnail grid (client-side — the metadata list is tiny;
 * only the visible page's images load), a right-side DETAILS rail (preview,
 * description, editable tags, type/size/dimensions/date, copy-URL, delete)
 * and a LIGHTBOX with ←/→ slide-through of every image in the current search.
 *
 * REST-only; next-intl copy (chat.gallery.*); purpose-token utilities.
 * ponytail: client fetch + local state, no data lib; pagination is a client
 * slice — move LIMIT/OFFSET into /api/assets when libraries outgrow one fetch.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmModal } from "@/components/content/confirm-modal";
import { makeDescribeThumb, readImageDimensions } from "@/lib/chat/image-thumb";
import { normalizeTags } from "@/lib/components/tags";
import { TagChip } from "@/components/ui/tag-chip";
import { cycleIndex, formatBytes, pageWindow } from "@/lib/media/format";

export interface GalleryAsset {
  key: string;
  url: string;
  filename: string;
  /** MIME type when the list endpoint provides it; "" if unknown. */
  contentType?: string;
  /** AI-generated description (searchable media); "" if none. */
  description?: string;
  /** Operator tags (searchable); [] if none. */
  tags?: string[];
  /** Bytes on disk (metadata rail). */
  size?: number;
  /** Upload time (ISO string over JSON). */
  createdAt?: string | number;
}

function isImage(a: GalleryAsset): boolean {
  return (a.contentType ?? "").toLowerCase().startsWith("image/");
}

const PAGE_SIZE = 24;

export function MediaLibrary({
  mode,
  onSelection,
  onEscape,
  className = "",
}: {
  mode: "manage" | "pick";
  /** pick mode: called with the currently selected assets on every change. */
  onSelection?: (assets: GalleryAsset[]) => void;
  /** Called on Esc when nothing internal (lightbox/confirm) is open — lets a modal host close. */
  onEscape?: () => void;
  className?: string;
}) {
  const t = useTranslations("chat");
  const [assets, setAssets] = useState<GalleryAsset[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [lightboxKey, setLightboxKey] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<GalleryAsset | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load (and re-load on search). Debounced so typing doesn't hammer the API.
  useEffect(() => {
    let live = true;
    const tid = setTimeout(() => {
      const url = query.trim()
        ? `/api/assets?q=${encodeURIComponent(query.trim())}`
        : "/api/assets";
      void fetch(url)
        .then((r) => (r.ok ? r.json() : []))
        .then((list) => {
          if (live) {
            setAssets(list as GalleryAsset[]);
            setLoaded(true);
            setPage(0);
          }
        })
        .catch(() => live && setLoaded(true));
    }, 250);
    return () => {
      live = false;
      clearTimeout(tid);
    };
  }, [query]);

  const win = pageWindow(page, PAGE_SIZE, assets.length);
  const pageAssets = assets.slice(win.page * PAGE_SIZE, win.page * PAGE_SIZE + PAGE_SIZE);
  const detail = detailKey ? (assets.find((a) => a.key === detailKey) ?? null) : null;
  const images = assets.filter(isImage);
  const lightboxIdx = lightboxKey ? images.findIndex((a) => a.key === lightboxKey) : -1;
  const lightbox = lightboxIdx >= 0 ? images[lightboxIdx] : null;

  function slideLightbox(delta: -1 | 1) {
    const next = images[cycleIndex(lightboxIdx, delta, images.length)];
    if (next) setLightboxKey(next.key);
  }

  // ONE keyboard layer, priority-ordered: an open confirm owns its keys; then
  // the lightbox (Esc closes it, arrows slide); else Esc bubbles to the host.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (pendingDelete) return;
      if (lightboxKey) {
        if (e.key === "Escape") setLightboxKey(null);
        else if (e.key === "ArrowRight") slideLightbox(1);
        else if (e.key === "ArrowLeft") slideLightbox(-1);
        return;
      }
      if (e.key === "Escape") onEscape?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  function reportSelection(next: Set<string>) {
    onSelection?.(assets.filter((a) => next.has(a.key)));
  }

  function onTileClick(a: GalleryAsset) {
    setDetailKey(a.key);
    setDims(null);
    setCopied(false);
    if (mode === "pick") {
      setSelected((cur) => {
        const next = new Set(cur);
        if (next.has(a.key)) next.delete(a.key);
        else next.add(a.key);
        reportSelection(next);
        return next;
      });
    }
  }

  // Persist a tag change for the detail asset (optimistic local update + PATCH).
  async function saveTags(key: string, tags: string[]) {
    const next = normalizeTags(tags);
    setAssets((cur) => cur.map((a) => (a.key === key ? { ...a, tags: next } : a)));
    try {
      const res = await fetch("/api/assets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, tags: next }),
      });
      if (!res.ok) setActionError(t("gallery.tagsFailed", { message: await errorOf(res) }));
    } catch (err) {
      setActionError(t("gallery.tagsFailed", { message: (err as Error).message }));
    }
  }

  async function onUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setActionError(null);
    setUploading(true);
    try {
      // Upload sequentially — each POST also runs the synchronous AI describe.
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        // Small ≤512px JPEG for the AI describe call (full file still uploads).
        const thumb = await makeDescribeThumb(file);
        if (thumb) form.append("describeThumb", thumb);
        // Intrinsic pixel dims → stored for the render aspect-ratio (CLS) hint.
        const dims = await readImageDimensions(file);
        if (dims) {
          form.append("width", String(dims.width));
          form.append("height", String(dims.height));
        }
        const res = await fetch("/api/assets", { method: "POST", body: form });
        if (!res.ok) {
          setActionError(t("gallery.uploadFailed", { message: await errorOf(res) }));
          continue;
        }
        const row = (await res.json()) as GalleryAsset;
        setAssets((cur) => [row, ...cur.filter((a) => a.key !== row.key)]);
      }
      setPage(0); // new uploads land at the top — show them
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = ""; // allow re-pick
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const key = pendingDelete.key;
    setDeleting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/assets?key=${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setActionError(t("gallery.deleteFailed", { message: await errorOf(res) }));
        return;
      }
      setAssets((cur) => cur.filter((a) => a.key !== key));
      setSelected((cur) => {
        const next = new Set(cur);
        next.delete(key);
        reportSelection(next);
        return next;
      });
      if (detailKey === key) setDetailKey(null);
      if (lightboxKey === key) setLightboxKey(null);
      setPendingDelete(null);
    } catch (err) {
      setActionError(t("gallery.deleteFailed", { message: (err as Error).message }));
    } finally {
      setDeleting(false);
    }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(new URL(url, window.location.origin).href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  const pagerBtn =
    "rounded-md border border-border px-2.5 py-1 text-sm text-foreground hover:bg-surface-muted disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      {/* Toolbar: search + upload */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <div className="relative flex-1">
          <svg
            width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-muted"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("gallery.searchPlaceholder")}
            className="w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
        >
          {uploading ? (
            t("gallery.uploading")
          ) : (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {t("gallery.upload")}
            </>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => void onUpload(e.target.files)}
        />
      </div>

      {actionError && (
        <p role="alert" className="border-b border-border bg-danger-subtle px-4 py-2 text-sm text-danger">
          {actionError}
        </p>
      )}

      {/* Grid + details rail */}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {!loaded ? (
              <p className="text-foreground-muted">{t("gallery.loading")}</p>
            ) : assets.length === 0 ? (
              <p className="text-foreground-muted">
                {query.trim() ? t("gallery.noResults") : t("gallery.empty")}
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {pageAssets.map((a) => {
                  const on = mode === "pick" ? selected.has(a.key) : detailKey === a.key;
                  const tags = a.tags ?? [];
                  return (
                    <li key={a.key} className="group relative">
                      {/* The tile IS the image — one primary action (select/inspect).
                          Hover secondaries (view large, delete) sit ON the thumbnail
                          so every tile keeps the same height. */}
                      <button
                        type="button"
                        onClick={() => onTileClick(a)}
                        title={a.description || a.filename}
                        aria-pressed={on}
                        aria-label={a.filename}
                        className={`flex w-full flex-col overflow-hidden rounded-md border text-left transition-colors ${
                          on ? "border-primary ring-2 ring-ring" : "border-border hover:border-primary"
                        }`}
                      >
                        <span className="relative block aspect-square w-full">
                          {isImage(a) ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={a.url} alt={a.description || a.filename} loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center bg-surface-muted text-foreground-muted">
                              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <path d="M14 2v6h6" />
                              </svg>
                            </span>
                          )}
                          {tags.length > 0 && (
                            <span className="pointer-events-none absolute inset-x-1 bottom-1 flex flex-wrap gap-0.5">
                              {tags.slice(0, 3).map((tag) => (
                                <TagChip key={tag} label={tag} variant="overlay" />
                              ))}
                              {tags.length > 3 && (
                                <TagChip label={`+${tags.length - 3}`} variant="overlay" />
                              )}
                            </span>
                          )}
                        </span>
                        <span className="truncate px-2 py-1.5 text-xs text-foreground">{a.filename}</span>
                      </button>

                      {/* Hover toolbar: view-large + delete, ON the thumbnail. */}
                      <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                        {isImage(a) && (
                          <button
                            type="button"
                            onClick={() => setLightboxKey(a.key)}
                            aria-label={t("gallery.viewLarge")}
                            title={t("gallery.viewLarge")}
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-surface/90 text-foreground-muted shadow-sm hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                            </svg>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setPendingDelete(a)}
                          aria-label={t("gallery.delete")}
                          title={t("gallery.delete")}
                          className="flex h-6 w-6 items-center justify-center rounded-full bg-surface/90 text-foreground-muted shadow-sm hover:text-danger focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                          </svg>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Pagination footer */}
          {loaded && assets.length > 0 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-2">
              <span className="text-xs text-foreground-muted">
                {t("gallery.pageInfo", { from: win.from, to: win.to, total: assets.length })}
              </span>
              {win.pageCount > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPage(win.page - 1)}
                    disabled={win.page === 0}
                    className={pagerBtn}
                  >
                    {t("gallery.pagePrev")}
                  </button>
                  <span className="px-1 text-xs text-foreground-muted">
                    {win.page + 1} / {win.pageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage(win.page + 1)}
                    disabled={win.page >= win.pageCount - 1}
                    className={pagerBtn}
                  >
                    {t("gallery.pageNext")}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Details rail */}
        {detail && (
          <aside className="w-64 shrink-0 overflow-y-auto border-l border-border p-3 md:w-72">
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-sm font-semibold text-foreground">{t("gallery.detailsTitle")}</h4>
              <button
                type="button"
                onClick={() => setDetailKey(null)}
                aria-label={t("gallery.close")}
                className="text-foreground-muted hover:text-foreground"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>

            {isImage(detail) && (
              <button
                type="button"
                onClick={() => setLightboxKey(detail.key)}
                title={t("gallery.viewLarge")}
                className="mt-2 block w-full overflow-hidden rounded-md border border-border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={detail.url}
                  alt={detail.description || detail.filename}
                  className="max-h-48 w-full bg-surface-muted object-contain"
                  onLoad={(e) =>
                    setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
                  }
                />
              </button>
            )}

            <p className="mt-2 break-all text-sm font-medium text-foreground">{detail.filename}</p>
            <p className="mt-1 text-xs text-foreground-muted">
              {detail.description || t("gallery.noDescription")}
            </p>

            <div className="mt-3">
              <span className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                {t("gallery.tagsLabel")}
              </span>
              <div className="mt-1">
                <TagEditor
                  key={detail.key}
                  tags={detail.tags ?? []}
                  onChange={(next) => void saveTags(detail.key, next)}
                />
              </div>
            </div>

            <dl className="mt-3 space-y-1 text-xs">
              <MetaRow label={t("gallery.typeLabel")} value={detail.contentType || "—"} />
              <MetaRow label={t("gallery.sizeLabel")} value={formatBytes(detail.size ?? NaN) || "—"} />
              {dims && (
                <MetaRow label={t("gallery.dimensionsLabel")} value={`${dims.w} × ${dims.h}px`} />
              )}
              <MetaRow
                label={t("gallery.uploadedLabel")}
                value={detail.createdAt ? new Date(detail.createdAt).toLocaleString() : "—"}
              />
              <MetaRow label={t("gallery.urlLabel")} value={detail.url} mono />
            </dl>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void copyUrl(detail.url)}
                className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs text-foreground hover:bg-surface-muted"
              >
                {copied ? t("gallery.copied") : t("gallery.copyUrl")}
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(detail)}
                className="rounded-md border border-border px-2 py-1.5 text-xs text-danger hover:bg-surface-muted"
              >
                {t("gallery.delete")}
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* Lightbox: large view + ←/→ slide through every image in the search */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-foreground/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.filename}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setLightboxKey(null);
          }}
        >
          <button
            type="button"
            onClick={() => setLightboxKey(null)}
            aria-label={t("gallery.close")}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-surface/20 text-surface hover:bg-surface/30"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => slideLightbox(-1)}
                aria-label={t("gallery.prevImage")}
                className="absolute left-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface/20 text-surface hover:bg-surface/30"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => slideLightbox(1)}
                aria-label={t("gallery.nextImage")}
                className="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface/20 text-surface hover:bg-surface/30"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox.url}
            alt={lightbox.description || lightbox.filename}
            className="max-h-[82vh] max-w-full rounded-md object-contain"
          />
          <p className="mt-3 max-w-2xl truncate text-center text-sm text-surface">
            {lightbox.filename}
            {images.length > 1 && (
              <span className="ml-2 text-surface/70">
                {lightboxIdx + 1} / {images.length}
              </span>
            )}
          </p>
        </div>
      )}

      {pendingDelete && (
        <ConfirmModal
          title={t("gallery.delete")}
          message={t("gallery.deleteConfirm", { name: pendingDelete.filename })}
          confirmLabel={t("gallery.delete")}
          cancelLabel={t("gallery.cancel")}
          danger
          busy={deleting}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

function MetaRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-foreground-muted">{label}</dt>
      <dd className={`min-w-0 break-all text-foreground ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

/**
 * Inline tag chips + add input for one asset (details rail). Enter (or comma)
 * commits the draft as a tag; × removes a chip. Changes flow up via `onChange`.
 */
function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const t = useTranslations("chat");
  const [draft, setDraft] = useState("");

  function commit() {
    const v = draft.trim();
    if (v && !tags.some((x) => x.toLowerCase() === v.toLowerCase())) {
      onChange([...tags, v]);
    }
    setDraft("");
  }

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-surface p-1">
      {tags.map((tag) => (
        <TagChip
          key={tag}
          label={tag}
          removeLabel={t("gallery.removeTag", { tag })}
          onRemove={() => onChange(tags.filter((x) => x !== tag))}
        />
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
        placeholder={t("gallery.addTag")}
        className="min-w-[4rem] flex-1 bg-transparent px-1 text-xs text-foreground focus-visible:outline-none"
      />
    </div>
  );
}

async function errorOf(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    if (j.error) return j.error;
  } catch {
    /* non-JSON */
  }
  return `HTTP ${res.status}`;
}
