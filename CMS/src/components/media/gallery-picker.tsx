/**
 * The Site's ONE media gallery picker — a modal that browses the R2 media library
 * (GET /api/assets) as a thumbnail grid. Used by the chat input (read/reference
 * intent) AND the page-builder image fields (Block-tab image props + SEO OG image).
 * Lets the operator:
 *   - SEARCH by the AI-generated description (or filename) — `?q=` keyword match
 *   - UPLOAD a new file (POST /api/assets; the server describes images on upload)
 *   - DELETE an unwanted file (DELETE /api/assets?key=, in-app confirm)
 *   - PICK one or more assets (the caller takes what it needs — the chat may use
 *     several, an image field takes the first) — returned via `onConfirm`
 *
 * Non-image assets (PDFs/docs) still show with a filename tile so they can be
 * picked for "read". REST-only; next-intl copy (chat.gallery.*); purpose tokens.
 *
 * ponytail: client fetch + local state, no data lib; the API is the source of
 * truth. In-app ConfirmModal for delete (native confirm hangs review sessions).
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmModal } from "@/components/content/confirm-modal";
import { makeDescribeThumb } from "@/lib/chat/image-thumb";
import { normalizeTags } from "@/lib/components/tags";

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
}

function isImage(a: GalleryAsset): boolean {
  return (a.contentType ?? "").toLowerCase().startsWith("image/");
}

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
  const [assets, setAssets] = useState<GalleryAsset[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<GalleryAsset | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingTags, setEditingTags] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persist a tag change for one asset (optimistic local update + PATCH).
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
          }
        })
        .catch(() => live && setLoaded(true));
    }, 250);
    return () => {
      live = false;
      clearTimeout(tid);
    };
  }, [query]);

  // Esc closes the modal (unless a confirm dialog is open — it handles its own).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pendingDelete) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, pendingDelete]);

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

  async function onUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setActionError(null);
    setUploading(true);
    try {
      // Upload sequentially — each POST also runs the synchronous AI describe.
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        // Attach a small ≤512px JPEG for the AI describe call (the full file
        // still uploads). Best-effort: skip on any failure.
        const thumb = await makeDescribeThumb(file);
        if (thumb) form.append("describeThumb", thumb);
        const res = await fetch("/api/assets", { method: "POST", body: form });
        if (!res.ok) {
          const msg = await errorOf(res);
          setActionError(t("gallery.uploadFailed", { message: msg }));
          continue;
        }
        const row = (await res.json()) as GalleryAsset;
        setAssets((cur) => [row, ...cur.filter((a) => a.key !== row.key)]);
      }
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
        return next;
      });
      setPendingDelete(null);
    } catch (err) {
      setActionError(t("gallery.deleteFailed", { message: (err as Error).message }));
    } finally {
      setDeleting(false);
    }
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
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-surface-raised shadow-xl">
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

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!loaded ? (
            <p className="text-foreground-muted">{t("gallery.loading")}</p>
          ) : assets.length === 0 ? (
            <p className="text-foreground-muted">
              {query.trim() ? t("gallery.noResults") : t("gallery.empty")}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {assets.map((a) => {
                const on = selected.has(a.key);
                const tags = a.tags ?? [];
                return (
                  <li key={a.key} className="group relative">
                    {/* The tile IS the image — one primary action (pick). Filename
                        reads underneath; description lives in the tooltip. Tag +
                        delete are hover-revealed secondaries ON the thumbnail, so
                        every tile is the same height regardless of metadata. */}
                    <button
                      type="button"
                      onClick={() => toggle(a.key)}
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
                          <img src={a.url} alt={a.description || a.filename} className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center bg-surface-muted text-foreground-muted">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <path d="M14 2v6h6" />
                            </svg>
                          </span>
                        )}
                        {/* Existing tags as a gradient-free chip strip along the
                            bottom of the thumbnail — visible at rest, doesn't shift
                            layout. Capped; overflow is summarized. */}
                        {tags.length > 0 && (
                          <span className="pointer-events-none absolute inset-x-1 bottom-1 flex flex-wrap gap-0.5">
                            {tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="rounded bg-foreground/75 px-1 py-0.5 text-[10px] leading-none text-surface"
                              >
                                {tag}
                              </span>
                            ))}
                            {tags.length > 3 && (
                              <span className="rounded bg-foreground/75 px-1 py-0.5 text-[10px] leading-none text-surface">
                                +{tags.length - 3}
                              </span>
                            )}
                          </span>
                        )}
                      </span>
                      <span className="truncate px-2 py-1.5 text-xs text-foreground">{a.filename}</span>
                    </button>

                    {/* Hover toolbar: tag (left of delete) + delete. Both sit ON
                        the thumbnail, mirroring each other; neither shifts height. */}
                    <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => setEditingTags(a.key)}
                        aria-label={t("gallery.editTags")}
                        title={t("gallery.editTags")}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-surface/90 text-foreground-muted shadow-sm hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" />
                          <circle cx="7" cy="7" r="1.2" fill="currentColor" stroke="none" />
                        </svg>
                      </button>
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

                    {/* Tag editor pops OVER the tile when active (absolute, so it
                        never changes the grid's row heights). Click-away/blur closes. */}
                    {editingTags === a.key && (
                      <div className="absolute inset-x-1 bottom-1 z-10">
                        <TagEditor
                          tags={tags}
                          onChange={(next) => void saveTags(a.key, next)}
                          onDone={() => setEditingTags(null)}
                          t={t}
                        />
                      </div>
                    )}
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

/**
 * Inline tag chips + add input for one asset. Enter (or comma) commits the draft
 * as a tag; × removes a chip; blur closes. Changes flow up via `onChange`.
 */
function TagEditor({
  tags,
  onChange,
  onDone,
  t,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  onDone: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  function commit() {
    const v = draft.trim();
    if (v && !tags.some((x) => x.toLowerCase() === v.toLowerCase())) {
      onChange([...tags, v]);
    }
    setDraft("");
  }

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-surface-raised p-1 shadow-lg">
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] text-foreground"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter((x) => x !== tag))}
            aria-label={t("gallery.removeTag", { tag })}
            className="text-foreground-muted hover:text-danger"
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            onDone();
          }
        }}
        onBlur={() => {
          commit();
          onDone();
        }}
        placeholder={t("gallery.addTag")}
        className="min-w-[4rem] flex-1 bg-transparent px-1 text-[11px] text-foreground focus-visible:outline-none"
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
