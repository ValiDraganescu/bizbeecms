"use client";

/**
 * Page Builder shell (epic: page-builder) — LAYOUT ONLY.
 *
 * Top bar + 3-column shell modeled on aicms `page-builder-v2`
 * (page_builder_v2.tsx / top_bar.tsx / left_rail_components.tsx /
 * center_canvas.tsx / right_rail.tsx), adapted to this project's design system
 * (purpose Tailwind tokens, next-intl EN/FI/ET — see docs/page-builder-layout.md).
 *
 * This slice ships the regions, tabs, empty states and responsive frame sizing.
 * No page loading, no drag-to-insert, no reorder, no live preview, no settings
 * logic — those are separate backlog slices that key off this shell. The only
 * state here is pure CHROME state: which viewport is selected, which center tab
 * (Layers/Preview) and which right-rail tab (Block/Page/SEO) is active.
 *
 * REST-only / no server actions (none needed yet). Purpose tokens only.
 *
 * ponytail: local useState for tab + viewport chrome; no store/reducer until a
 * later slice actually has shared editor state to manage.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { isValidSlug } from "@/lib/pages/page-meta";
import {
  flattenPagesForPicker,
  topLevelParents,
  type PageOption,
} from "@/lib/pages/page-picker";
import type { PageSummary } from "@/db/page-store";

type Viewport = "desktop" | "tablet" | "mobile";
type CenterTab = "layers" | "preview";
type RightTab = "block" | "page" | "seo";

// Preview frame widths per viewport (desktop = full width). See layout doc.
const VIEWPORT_WIDTH: Record<Viewport, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "375px",
};

const ICON = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
} as const;

function ViewportIcon({ kind }: { kind: Viewport }) {
  switch (kind) {
    case "desktop":
      return (
        <svg {...ICON}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      );
    case "tablet":
      return (
        <svg {...ICON}>
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <line x1="12" y1="18" x2="12" y2="18" />
        </svg>
      );
    case "mobile":
      return (
        <svg {...ICON}>
          <rect x="7" y="2" width="10" height="20" rx="2" />
          <line x1="11" y1="18" x2="13" y2="18" />
        </svg>
      );
  }
}

export function PageBuilderShell() {
  const t = useTranslations("pageBuilder");
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [centerTab, setCenterTab] = useState<CenterTab>("layers");
  const [rightTab, setRightTab] = useState<RightTab>("block");

  // Real page list + the operator's current selection. The center/right panels
  // key off `selected`; later slices load that page's blocks / settings.
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [selected, setSelected] = useState<PageOption | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const res = await fetch("/api/pages");
      if (live && res.ok) setPages((await res.json()) as PageSummary[]);
    })();
    return () => {
      live = false;
    };
  }, []);

  const options = flattenPagesForPicker(pages);

  // Re-resolve the selected option against the latest list (e.g. after a create
  // refetch) so its label/publish state stays current; drop it if it's gone.
  function selectById(id: string) {
    setSelected(options.find((o) => o.id === id) ?? null);
  }

  async function refreshPages(selectId?: string) {
    const res = await fetch("/api/pages");
    if (!res.ok) return;
    const next = (await res.json()) as PageSummary[];
    setPages(next);
    if (selectId) {
      setSelected(flattenPagesForPicker(next).find((o) => o.id === selectId) ?? null);
    }
  }

  const viewports: Viewport[] = ["desktop", "tablet", "mobile"];
  const rightTabs: RightTab[] = ["block", "page", "seo"];

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* ── TOP BAR ───────────────────────────────────────────────────── */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        {/* Left: page picker — selects an existing page or creates a new one. */}
        <PagePicker
          options={options}
          selected={selected}
          parentOptions={topLevelParents(pages)}
          onSelect={selectById}
          onCreated={(id) => void refreshPages(id)}
        />

        {/* Center: viewport selector + undo/redo */}
        <div className="mx-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-border">
            {viewports.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setViewport(v)}
                aria-pressed={viewport === v}
                title={t(`viewport.${v}`)}
                className={
                  "flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors " +
                  (viewport === v
                    ? "bg-surface font-medium text-foreground"
                    : "bg-surface-muted text-foreground-muted hover:text-foreground")
                }
              >
                <ViewportIcon kind={v} />
                <span className="hidden lg:inline">{t(`viewport.${v}`)}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled
              title={t("undo")}
              aria-label={t("undo")}
              className="rounded-md border border-border p-1.5 text-foreground-muted disabled:opacity-50"
            >
              <svg {...ICON}>
                <path d="M3 7v6h6" />
                <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
              </svg>
            </button>
            <button
              type="button"
              disabled
              title={t("redo")}
              aria-label={t("redo")}
              className="rounded-md border border-border p-1.5 text-foreground-muted disabled:opacity-50"
            >
              <svg {...ICON}>
                <path d="M21 7v6h-6" />
                <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
              </svg>
            </button>
          </div>
        </div>

        {/* Right: preview + save */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground-muted disabled:opacity-60"
          >
            {t("preview")}
          </button>
          <button
            type="button"
            disabled
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {t("save")}
          </button>
        </div>
      </header>

      {/* ── 3 COLUMNS ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT RAIL — Components */}
        <aside className="flex w-[260px] shrink-0 flex-col border-r border-border bg-surface-raised">
          <div className="border-b border-border px-4 py-3">
            <p className="font-mono text-xs uppercase tracking-wide text-foreground-muted">
              {t("components")}
            </p>
            <input
              type="search"
              disabled
              placeholder={t("searchComponents")}
              className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-foreground-muted disabled:opacity-60"
            />
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-3">
            <div>
              <p className="px-1 font-mono text-[11px] uppercase tracking-wide text-foreground-muted">
                {t("categoryLayout")}
              </p>
              <ul className="mt-1.5 space-y-1">
                <li className="cursor-grab rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground">
                  {t("layoutSection")}
                </li>
              </ul>
            </div>
            <div>
              <p className="px-1 font-mono text-[11px] uppercase tracking-wide text-foreground-muted">
                {t("categoryComponents")}
              </p>
              <p className="mt-1.5 px-1 text-sm text-foreground-muted">
                {t("componentsEmpty")}
              </p>
            </div>
          </div>
        </aside>

        {/* CENTER — Layers / Preview */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-3">
            {(["layers", "preview"] as CenterTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setCenterTab(tab)}
                aria-pressed={centerTab === tab}
                className={
                  "rounded-md px-3 py-1.5 text-sm transition-colors " +
                  (centerTab === tab
                    ? "bg-surface-muted font-medium text-foreground"
                    : "text-foreground-muted hover:text-foreground")
                }
              >
                {t(`center.${tab}`)}
              </button>
            ))}
          </div>

          {/* Both panels mounted; toggled by `hidden` so a future iframe stays alive. */}
          <div className="relative flex-1 overflow-hidden bg-surface-muted">
            {/* Layers */}
            <div
              className={
                "absolute inset-0 flex items-center justify-center p-6 " +
                (centerTab === "layers" ? "" : "hidden")
              }
            >
              <div className="max-w-sm text-center">
                <p className="text-lg font-medium text-foreground">
                  {selected ? selected.path : t("title")}
                </p>
                <p className="mt-1 text-sm text-foreground-muted">
                  {selected ? t("layersEmpty") : t("emptyCanvas")}
                </p>
              </div>
            </div>

            {/* Preview */}
            <div
              className={
                "absolute inset-0 flex flex-col " + (centerTab === "preview" ? "" : "hidden")
              }
            >
              {/* URL bar + refresh */}
              <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
                <button
                  type="button"
                  disabled
                  title={t("refresh")}
                  aria-label={t("refresh")}
                  className="rounded p-1 text-foreground-muted disabled:opacity-50"
                >
                  <svg {...ICON} width={14} height={14}>
                    <path d="M23 4v6h-6" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                </button>
                <div className="flex-1 truncate rounded border border-border bg-surface-muted px-2 py-1 text-xs text-foreground-muted">
                  {selected ? selected.path : t("previewUrlPlaceholder")}
                </div>
              </div>
              {/* Responsive frame area */}
              <div className="flex flex-1 justify-center overflow-auto p-4">
                <div
                  className="h-full overflow-hidden rounded-md border border-border bg-surface shadow-sm"
                  style={{ width: VIEWPORT_WIDTH[viewport], maxWidth: "100%" }}
                >
                  <div className="flex h-full items-center justify-center p-6">
                    <p className="text-center text-sm text-foreground-muted">
                      {t("previewEmpty")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT RAIL — Block / Page / SEO */}
        <aside className="flex w-[320px] shrink-0 flex-col border-l border-border bg-surface-raised">
          <div className="flex border-b border-border">
            {rightTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setRightTab(tab)}
                aria-pressed={rightTab === tab}
                className={
                  "flex-1 px-3 py-2.5 text-sm transition-colors " +
                  (rightTab === tab
                    ? "border-b-2 border-primary font-medium text-foreground"
                    : "text-foreground-muted hover:text-foreground")
                }
              >
                {t(`right.${tab}`)}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {rightTab === "block" && (
              <p className="text-sm text-foreground-muted">{t("blockEmpty")}</p>
            )}
            {rightTab === "page" && (
              <p className="text-sm text-foreground-muted">{t("pageEmpty")}</p>
            )}
            {rightTab === "seo" && (
              <p className="text-sm text-foreground-muted">{t("seoEmpty")}</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * Top-bar page picker: a real `<select>` of the Site's pages + a "New page"
 * inline form that POSTs to `/api/pages` (reusing the C2 REST / validation) and
 * auto-selects the created page. No new page-store logic — it speaks the same
 * `/api/pages` contract as `pages-manager.tsx`.
 */
function PagePicker({
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
