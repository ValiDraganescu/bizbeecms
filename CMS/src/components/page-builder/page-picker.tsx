"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { isValidSlug } from "@/lib/pages/page-meta";
import type { PageOption } from "@/lib/pages/page-picker";

/**
 * Top-bar page picker: a real `<select>` of the Site's pages + a "New page"
 * inline form that POSTs to `/api/pages` (reusing the C2 REST / validation) and
 * auto-selects the created page. No new page-store logic — it speaks the same
 * `/api/pages` contract as `pages-manager.tsx`.
 */
export function PagePicker({
  options,
  selected,
  parentOptions,
  onSelect,
  onCreated,
}: {
  options: PageOption[];
  selected: PageOption | null;
  parentOptions: PageOption[];
  onSelect: (id: string) => void;
  onCreated: (id: string) => void;
}) {
  const t = useTranslations("pageBuilder");
  const [creating, setCreating] = useState(false);
  const [slug, setSlug] = useState("");
  const [parentSlug, setParentSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    if (!isValidSlug(slug)) {
      setError(t("create.invalidSlug"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: slug.trim(),
          parentSlug: parentSlug.trim() || null,
          publishStatus: "draft",
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
      };
      if (!res.ok || !body.id) {
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      onCreated(body.id);
      setCreating(false);
      setSlug("");
      setParentSlug("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const field =
    "rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground";

  return (
    <div className="relative flex items-center gap-2">
      <select
        aria-label={t("pageSelector")}
        value={selected?.id ?? ""}
        onChange={(e) => onSelect(e.target.value)}
        className={`w-56 ${field} ${selected ? "" : "text-foreground-muted"}`}
      >
        <option value="" disabled>
          {t("noPageSelected")}
        </option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.path}
            {o.published ? "" : ` · ${t("create.draft")}`}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => {
          setCreating((c) => !c);
          setError(null);
        }}
        aria-expanded={creating}
        className="rounded-md border border-border px-2.5 py-1.5 text-sm text-foreground hover:bg-surface-muted"
      >
        {t("newPage")}
      </button>

      {creating && (
        <div className="absolute left-0 top-full z-10 mt-2 w-72 rounded-md border border-border bg-surface-raised p-3 shadow-md">
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <label className="flex flex-col gap-1">
              <span className="text-xs text-foreground-muted">{t("create.slug")}</span>
              <input
                autoFocus
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={t("create.slugPlaceholder")}
                aria-label={t("create.slug")}
                className={`${field} font-mono`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-foreground-muted">{t("create.parent")}</span>
              <select
                value={parentSlug}
                onChange={(e) => setParentSlug(e.target.value)}
                aria-label={t("create.parent")}
                className={field}
              >
                <option value="">{t("create.noParent")}</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.slug}>
                    {p.slug}
                  </option>
                ))}
              </select>
            </label>
            {error && (
              <p role="alert" className="text-xs text-danger">
                {error}
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {busy ? t("create.creating") : t("create.create")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setError(null);
                }}
                className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground"
              >
                {t("create.cancel")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
