"use client";

/**
 * CMS page-management UI (Milestone 2, epic C2) — the NON-AI authoring surface
 * for page metadata. Lists pages and opens an inline editor to create / edit
 * (slug, parent, publish status, per-locale SEO title + description) / delete.
 * It GETs/POSTs/PUTs/DELETEs `/api/pages`. Block-tree editing is NOT here (the
 * AI's create_page / C3 own that) — saving metadata preserves a page's blocks.
 *
 * REST-only (no server actions). All copy via next-intl (EN/FI/ET). Purpose
 * Tailwind tokens only (bg-surface, text-foreground, …) — never raw colors.
 *
 * ponytail: one editor form, optimistic refetch after each write. No form lib.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  isValidSlug,
  setLocaleValue,
  type PageMetaInput,
  type PublishStatus,
} from "@/lib/pages/page-meta";
import type { PageSummary } from "@/db/page-store";

type Draft = {
  id: string | null;
  slug: string;
  parentSlug: string;
  publishStatus: PublishStatus;
  metaTitle: Record<string, string>;
  metaDescription: Record<string, string>;
};

function blankDraft(): Draft {
  return { id: null, slug: "", parentSlug: "", publishStatus: "draft", metaTitle: {}, metaDescription: {} };
}

function draftOf(p: PageSummary): Draft {
  return {
    id: p.id,
    slug: p.slug,
    parentSlug: p.parentSlug ?? "",
    publishStatus: (p.publishStatus === "published" ? "published" : "draft") as PublishStatus,
    metaTitle: { ...p.metaTitle },
    metaDescription: { ...p.metaDescription },
  };
}

export function PagesManager({
  initialPages,
  locales,
}: {
  initialPages: PageSummary[];
  locales: string[];
}) {
  const t = useTranslations("pages");
  const [pages, setPages] = useState<PageSummary[]>(initialPages);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Top-level pages are the only valid parents (one nesting level, mirrors the store).
  const parentOptions = pages.filter((p) => p.parentPageId === null);

  async function refresh() {
    const res = await fetch("/api/pages");
    if (res.ok) setPages((await res.json()) as PageSummary[]);
  }

  async function save() {
    if (!draft) return;
    setError(null);
    if (!isValidSlug(draft.slug)) {
      setError(t("invalidSlug"));
      return;
    }
    setBusy(true);
    try {
      const meta: PageMetaInput = {
        slug: draft.slug.trim(),
        parentSlug: draft.parentSlug.trim() || null,
        publishStatus: draft.publishStatus,
        metaTitle: draft.metaTitle,
        metaDescription: draft.metaDescription,
      };
      const body = draft.id ? { id: draft.id, ...meta } : meta;
      const res = await fetch("/api/pages", {
        method: draft.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(await errorOf(res));
        return;
      }
      setDraft(null);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: PageSummary) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/pages?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
      if (!res.ok) {
        setError(await errorOf(res));
        return;
      }
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!draft && (
        <button
          type="button"
          className="self-start rounded-md bg-primary px-4 py-2 text-primary-foreground"
          onClick={() => setDraft(blankDraft())}
        >
          {t("new")}
        </button>
      )}

      {draft && (
        <PageEditor
          draft={draft}
          locales={locales}
          parentOptions={parentOptions.filter((p) => p.id !== draft.id)}
          busy={busy}
          onChange={setDraft}
          onSave={() => void save()}
          onCancel={() => {
            setDraft(null);
            setError(null);
          }}
        />
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger"
        >
          {error}
        </p>
      )}

      {pages.length === 0 ? (
        <p className="text-foreground-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {pages.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-raised px-3 py-2"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-mono text-foreground">
                  {p.parentSlug ? `${p.parentSlug}/` : "/"}
                  {p.slug}
                </span>
                <span className="text-sm text-foreground-muted">
                  {p.publishStatus === "published" ? t("published") : t("draft")}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={`/admin/pages/${encodeURIComponent(p.id)}/blocks`}
                  className="rounded border border-border px-2 py-1 text-foreground-muted hover:text-foreground"
                >
                  {t("editBlocks")}
                </a>
                <button
                  type="button"
                  className="rounded border border-border px-2 py-1 text-foreground-muted hover:text-foreground disabled:opacity-40"
                  disabled={busy}
                  onClick={() => {
                    setDraft(draftOf(p));
                    setError(null);
                  }}
                >
                  {t("edit")}
                </button>
                <button
                  type="button"
                  className="rounded border border-border px-2 py-1 text-danger disabled:opacity-40"
                  disabled={busy}
                  onClick={() => void remove(p)}
                  aria-label={t("deleteOne", { slug: p.slug })}
                >
                  {t("delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PageEditor({
  draft,
  locales,
  parentOptions,
  busy,
  onChange,
  onSave,
  onCancel,
}: {
  draft: Draft;
  locales: string[];
  parentOptions: PageSummary[];
  busy: boolean;
  onChange: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("pages");
  const input =
    "rounded-md border border-border bg-surface px-3 py-2 text-foreground";

  return (
    <form
      className="flex flex-col gap-4 rounded-md border border-border bg-surface-raised p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <h2 className="text-lg font-semibold text-foreground">
        {draft.id ? t("editTitle") : t("newTitle")}
      </h2>

      <label className="flex flex-col gap-1">
        <span className="text-sm text-foreground-muted">{t("slug")}</span>
        <input
          className={`${input} font-mono`}
          value={draft.slug}
          onChange={(e) => onChange({ ...draft, slug: e.target.value })}
          placeholder={t("slugPlaceholder")}
          aria-label={t("slug")}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm text-foreground-muted">{t("parent")}</span>
        <select
          className={input}
          value={draft.parentSlug}
          onChange={(e) => onChange({ ...draft, parentSlug: e.target.value })}
          aria-label={t("parent")}
        >
          <option value="">{t("noParent")}</option>
          {parentOptions.map((p) => (
            <option key={p.id} value={p.slug}>
              {p.slug}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm text-foreground-muted">{t("status")}</span>
        <select
          className={input}
          value={draft.publishStatus}
          onChange={(e) =>
            onChange({ ...draft, publishStatus: e.target.value as PublishStatus })
          }
          aria-label={t("status")}
        >
          <option value="draft">{t("draft")}</option>
          <option value="published">{t("published")}</option>
        </select>
      </label>

      <fieldset className="flex flex-col gap-3 border-t border-border pt-3">
        <legend className="text-sm font-medium text-foreground">{t("seo")}</legend>
        {locales.map((loc) => (
          <div key={loc} className="flex flex-col gap-2">
            <span className="font-mono text-sm text-foreground-muted">{loc}</span>
            <input
              className={input}
              value={draft.metaTitle[loc] ?? ""}
              onChange={(e) =>
                onChange({ ...draft, metaTitle: setLocaleValue(draft.metaTitle, loc, e.target.value) })
              }
              placeholder={t("metaTitle")}
              aria-label={`${t("metaTitle")} (${loc})`}
            />
            <input
              className={input}
              value={draft.metaDescription[loc] ?? ""}
              onChange={(e) =>
                onChange({
                  ...draft,
                  metaDescription: setLocaleValue(draft.metaDescription, loc, e.target.value),
                })
              }
              placeholder={t("metaDescription")}
              aria-label={`${t("metaDescription")} (${loc})`}
            />
          </div>
        ))}
      </fieldset>

      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          disabled={busy}
        >
          {busy ? t("saving") : t("save")}
        </button>
        <button
          type="button"
          className="rounded-md border border-border px-4 py-2 text-foreground"
          onClick={onCancel}
          disabled={busy}
        >
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}

async function errorOf(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    if (j.error) return j.error;
  } catch {
    /* non-JSON body */
  }
  return `HTTP ${res.status}`;
}
