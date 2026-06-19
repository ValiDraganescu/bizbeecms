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
import {
  isValidSlug,
  setLocaleValue,
  buildSeoMetaBody,
  buildPublishToggleBody,
} from "@/lib/pages/page-meta";
import {
  flattenPagesForPicker,
  topLevelParents,
  type PageOption,
} from "@/lib/pages/page-picker";
import type { PageSummary } from "@/db/page-store";
import { filterGroups } from "@/lib/components/rail-filter";
import type { ComponentGroup } from "@/lib/components/grouped";
import {
  addSection,
  addComponentToSection,
  addComponentToColumn,
  sectionColumns,
  sectionGridCols,
  isSection,
  isSectionColumn,
  mergeSectionProps,
  deleteColumn,
  targetSectionId,
  moveNode,
  findBlock,
  mergeBlockProps,
  parsePropsSchema,
  validateBlockProps,
  setLocalizedProp,
  localeFieldValue,
  type PropField,
} from "@/lib/pages/page-blocks";
import type { Block } from "@/lib/render/tree";
import { LocalePicker, useLocalePicker } from "./locale-picker";

type Viewport = "desktop" | "tablet" | "mobile";
type CenterTab = "layers" | "preview";
type RightTab = "block" | "page" | "seo";

// ── Native HTML5 drag-and-drop payload (no dnd dependency) ──────────────────
// A rail item carries a small JSON payload on a custom MIME type. Slice 1 only
// drags the LAYOUT "Section" (`{kind:"section"}`); slice 2 adds `{kind:"component",
// name}`. Drop targets read it back via `readDragPayload`.
const DND_MIME = "application/x-page-builder";
type DragPayload =
  | { kind: "section" }
  | { kind: "component"; name: string }
  | { kind: "move"; id: string };

function setDragPayload(e: React.DragEvent, payload: DragPayload) {
  e.dataTransfer.setData(DND_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "copy";
}

function readDragPayload(e: React.DragEvent): DragPayload | null {
  const raw = e.dataTransfer.getData(DND_MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DragPayload;
  } catch {
    return null;
  }
}

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

/** Preview color-mode toggle icons: sun (light) / monitor (system) / moon (dark). */
function PreviewThemeIcon({ kind }: { kind: "light" | "system" | "dark" }) {
  switch (kind) {
    case "light":
      return (
        <svg {...ICON} width={14} height={14}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" />
        </svg>
      );
    case "system":
      return (
        <svg {...ICON} width={14} height={14}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      );
    case "dark":
      return (
        <svg {...ICON} width={14} height={14}>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      );
  }
}

export function PageBuilderShell({
  contentLocales,
}: {
  // Site content locales (default first) — the SEO tab edits one title +
  // description per locale, mirroring the C2 pages-manager SEO legend.
  contentLocales: string[];
}) {
  const t = useTranslations("pageBuilder");
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [centerTab, setCenterTab] = useState<CenterTab>("layers");
  const [rightTab, setRightTab] = useState<RightTab>("block");
  // Bumped to force the preview iframe to reload (refresh button + after Save).
  const [previewNonce, setPreviewNonce] = useState(0);
  // Forces the preview iframe's color mode via /preview/[id]?theme=.
  // "system" = no param (follows OS); "light"/"dark" force data-theme.
  const [previewTheme, setPreviewTheme] = useState<"system" | "light" | "dark">("system");

  // Real page list + the operator's current selection. The center/right panels
  // key off `selected`; later slices load that page's blocks / settings.
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [selected, setSelected] = useState<PageOption | null>(null);

  // Components rail: the Site's kit/component groups + the search query.
  const [groups, setGroups] = useState<ComponentGroup[]>([]);
  const [search, setSearch] = useState("");
  // name → raw propsSchema JSON (Block tab renders a settings form per declared prop).
  const [propsSchemas, setPropsSchemas] = useState<Record<string, string | null>>({});

  // The selected page's block tree (sections + their dropped components) and the
  // currently-selected node id (drives which section a rail click drops into and,
  // later, the right rail). Loaded from / persisted to the C3 block REST.
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // True while a draggable rail item hovers the Layers drop zone (blue indicator).
  const [layersDropActive, setLayersDropActive] = useState(false);

  // Load the selected page's blocks (or reset when nothing is selected).
  useEffect(() => {
    if (!selected) {
      setBlocks([]);
      setSelectedBlockId(null);
      setDirty(false);
      return;
    }
    let live = true;
    void (async () => {
      const res = await fetch(`/api/pages/${selected.id}/blocks`);
      if (!live) return;
      if (res.ok) {
        const body = (await res.json()) as { blocks?: Block[] };
        setBlocks(body.blocks ?? []);
      } else {
        setBlocks([]);
      }
      setSelectedBlockId(null);
      setDirty(false);
    })();
    return () => {
      live = false;
    };
  }, [selected]);

  function onAddSection() {
    setBlocks((b) => addSection(b));
    setDirty(true);
  }

  // Drop a rail component into the selected section (or the last one). Returns
  // false if there's no section yet so the caller can prompt to add one.
  function onInsertComponent(component: string): boolean {
    const target = targetSectionId(blocks, selectedBlockId);
    if (!target) return false;
    setBlocks((b) => addComponentToSection(b, target, component));
    setDirty(true);
    return true;
  }

  // Drop a rail component into a specific Section COLUMN (DnD slice 2). No-op if
  // the target isn't a valid section/column (the pure helper guards range).
  function onDropComponentToColumn(sectionId: string, colIndex: number, component: string) {
    setBlocks((b) => addComponentToColumn(b, sectionId, colIndex, component));
    setDirty(true);
  }

  // Move a Layers node (DnD slice 3): reorder Sections, reorder within a column,
  // or move a component across columns/sections. The pure helper guards no-ops.
  function onMoveNode(dragId: string, targetId: string, position: "before" | "after" | "into") {
    setBlocks((b) => moveNode(b, dragId, targetId, position));
    setDirty(true);
  }

  // Merge a Section settings patch into the selected Section's props (columns
  // reflows its column children). Marks dirty; persisted by the existing Save.
  function onUpdateSection(sectionId: string, patch: Record<string, unknown>) {
    setBlocks((b) => mergeSectionProps(b, sectionId, patch));
    setDirty(true);
  }

  // Replace a (nested) component block's full props (tree-walk merge). The Block
  // tab computes the validated props from its schema-driven form and calls this.
  function onUpdateComponentProps(blockId: string, props: Record<string, unknown>) {
    setBlocks((b) => mergeBlockProps(b, blockId, props));
    setDirty(true);
  }

  // Patch-merge a single column's own props (e.g. per-viewport visibility). Reads
  // the live column, applies the patch (undefined deletes a key), and writes the
  // full props back via the tree-walking mergeBlockProps.
  function onUpdateColumnProps(columnId: string, patch: Record<string, unknown>) {
    setBlocks((b) => {
      const col = findBlock(b, columnId);
      const next: Record<string, unknown> = { ...(col?.props ?? {}) };
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === false) delete next[k];
        else next[k] = v;
      }
      return mergeBlockProps(b, columnId, next);
    });
    setDirty(true);
  }

  // Delete a SPECIFIC column, discarding its components (distinct from the
  // COLUMNS control's shrink-reflow). Decrements the Section's columns via the
  // pure deleteColumn; clears selection if the deleted column was selected.
  function onDeleteColumn(columnId: string) {
    setBlocks((b) => deleteColumn(b, columnId));
    setSelectedBlockId((cur) => (cur === columnId ? null : cur));
    setDirty(true);
  }

  async function onSave() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/pages/${selected.id}/blocks`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks }),
      });
      if (res.ok) {
        setDirty(false);
        setPreviewNonce((n) => n + 1); // reflect persisted blocks in the iframe
      }
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    let live = true;
    void (async () => {
      const res = await fetch("/api/pages");
      if (live && res.ok) setPages((await res.json()) as PageSummary[]);
    })();
    void (async () => {
      const res = await fetch("/api/components/grouped");
      if (live && res.ok) {
        const body = (await res.json()) as { groups?: ComponentGroup[] };
        setGroups(body.groups ?? []);
      }
    })();
    void (async () => {
      const res = await fetch("/api/components/palette");
      if (live && res.ok) {
        const body = (await res.json()) as {
          palette?: { name: string; propsSchema: string | null }[];
        };
        setPropsSchemas(
          Object.fromEntries((body.palette ?? []).map((p) => [p.name, p.propsSchema])),
        );
      }
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
            onClick={() => void onSave()}
            disabled={!selected || !dirty || saving}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {saving ? t("saving") : t("save")}
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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchComponents")}
              aria-label={t("searchComponents")}
              className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-foreground-muted"
            />
          </div>
          <ComponentsRail
            groups={groups}
            search={search}
            canEdit={!!selected}
            onAddSection={onAddSection}
            onInsertComponent={onInsertComponent}
          />
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
            {/* Layers — drop target for dragging a Section from the LAYOUT rail. */}
            <div
              onDragOver={(e) => {
                if (!selected) return;
                // Must preventDefault to allow a drop; show the indicator.
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
                if (!layersDropActive) setLayersDropActive(true);
              }}
              onDragLeave={(e) => {
                // Only clear when truly leaving the panel (not entering a child).
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setLayersDropActive(false);
                }
              }}
              onDrop={(e) => {
                setLayersDropActive(false);
                if (!selected) return;
                const payload = readDragPayload(e);
                if (payload?.kind !== "section") return;
                e.preventDefault();
                onAddSection();
              }}
              className={
                "absolute inset-0 overflow-y-auto p-6 " +
                (centerTab === "layers" ? "" : "hidden")
              }
            >
              {!selected ? (
                <div className="flex h-full items-center justify-center">
                  <div className="max-w-sm text-center">
                    <p className="text-lg font-medium text-foreground">{t("title")}</p>
                    <p className="mt-1 text-sm text-foreground-muted">{t("emptyCanvas")}</p>
                  </div>
                </div>
              ) : blocks.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="max-w-sm text-center">
                    <p className="text-lg font-medium text-foreground">{selected.path}</p>
                    <p className="mt-1 text-sm text-foreground-muted">{t("layersEmpty")}</p>
                  </div>
                </div>
              ) : (
                <LayersTree
                  blocks={blocks}
                  selectedId={selectedBlockId}
                  onSelect={setSelectedBlockId}
                  onDropComponent={onDropComponentToColumn}
                  onMoveNode={onMoveNode}
                  onDeleteColumn={onDeleteColumn}
                />
              )}
              {/* Drop indicator: a blue line where the new Section appends. */}
              {selected && layersDropActive && (
                <div className="mx-auto mt-3 flex max-w-xl items-center gap-2">
                  <span className="h-0.5 flex-1 rounded bg-primary" />
                  <span className="text-xs font-medium text-primary">
                    {t("dropSectionHint")}
                  </span>
                  <span className="h-0.5 flex-1 rounded bg-primary" />
                </div>
              )}
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
                  disabled={!selected}
                  onClick={() => setPreviewNonce((n) => n + 1)}
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
                {/* Light / system / dark toggle — forces the iframe's color mode
                    so the operator can SEE dark without changing their OS. */}
                <div className="flex shrink-0 items-center gap-0.5 rounded border border-border bg-surface-muted p-0.5">
                  {(["light", "system", "dark"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPreviewTheme(mode)}
                      aria-pressed={previewTheme === mode}
                      title={t(`previewTheme.${mode}`)}
                      aria-label={t(`previewTheme.${mode}`)}
                      className={
                        "rounded px-1.5 py-0.5 " +
                        (previewTheme === mode
                          ? "bg-surface text-foreground shadow-sm"
                          : "text-foreground-muted hover:text-foreground")
                      }
                    >
                      <PreviewThemeIcon kind={mode} />
                    </button>
                  ))}
                </div>
              </div>
              {/* Responsive frame area — draft preview reuses the REAL renderer
                  via /preview/<id> (any publish status), so it's true-to-site. */}
              <div className="flex flex-1 justify-center overflow-auto p-4">
                <div
                  className="h-full overflow-hidden rounded-md border border-border bg-surface shadow-sm"
                  style={{ width: VIEWPORT_WIDTH[viewport], maxWidth: "100%" }}
                >
                  {selected ? (
                    <iframe
                      key={`${selected.id}-${previewNonce}-${previewTheme}`}
                      src={
                        previewTheme === "system"
                          ? `/preview/${selected.id}`
                          : `/preview/${selected.id}?theme=${previewTheme}`
                      }
                      title={t("previewIframeTitle")}
                      className="h-full w-full border-0 bg-surface"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center p-6">
                      <p className="text-center text-sm text-foreground-muted">
                        {t("previewEmpty")}
                      </p>
                    </div>
                  )}
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
            {rightTab === "block" &&
              (() => {
                // Selected node can be nested (a component inside a column), so
                // tree-walk — a top-level find would miss it.
                const sel = selectedBlockId ? findBlock(blocks, selectedBlockId) : null;
                if (sel && isSection(sel)) {
                  return (
                    <SectionSettings
                      key={sel.id}
                      section={sel}
                      onChange={(patch) => onUpdateSection(sel.id, patch)}
                    />
                  );
                }
                // A column shell: show its own settings (per-viewport visibility).
                if (sel && isSectionColumn(sel)) {
                  return (
                    <ColumnSettings
                      key={sel.id}
                      column={sel}
                      onChange={(patch) => onUpdateColumnProps(sel.id, patch)}
                    />
                  );
                }
                // A component block (not a Section or a column shell): show its
                // schema-driven settings form.
                if (sel && !isSectionColumn(sel)) {
                  return (
                    <ComponentSettings
                      key={sel.id}
                      block={sel}
                      schema={parsePropsSchema(propsSchemas[sel.component])}
                      locales={contentLocales}
                      onChange={(props) => onUpdateComponentProps(sel.id, props)}
                    />
                  );
                }
                return <p className="text-sm text-foreground-muted">{t("blockEmpty")}</p>;
              })()}
            {rightTab === "page" &&
              (() => {
                const page = selected
                  ? pages.find((p) => p.id === selected.id) ?? null
                  : null;
                return page ? (
                  <PageSettings
                    key={page.id}
                    page={page}
                    onChanged={() => void refreshPages(page.id)}
                    onDeleted={() => {
                      setSelected(null);
                      void refreshPages();
                    }}
                  />
                ) : (
                  <p className="text-sm text-foreground-muted">{t("pageEmpty")}</p>
                );
              })()}
            {rightTab === "seo" &&
              (() => {
                const page = selected
                  ? pages.find((p) => p.id === selected.id) ?? null
                  : null;
                return page ? (
                  <SeoForm
                    key={page.id}
                    page={page}
                    locales={contentLocales}
                    onSaved={() => void refreshPages(page.id)}
                  />
                ) : (
                  <p className="text-sm text-foreground-muted">{t("seoEmpty")}</p>
                );
              })()}
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * Left-rail Components panel: the LAYOUT primitive (Section) above the real
 * COMPONENTS source — kit groups from `GET /api/components/grouped`, each an
 * expandable header (kit display name or the "individually-imported" bucket)
 * listing its component names, filtered live by the search box.
 *
 * Clicking the LAYOUT "Section" adds a Section to the page; clicking a component
 * inserts it into the selected (or last) Section. Both are inert until a page is
 * selected (`canEdit`).
 *
 * ponytail: groups expanded by default (small lists); collapse state is local
 * useState keyed by group label. Click-to-insert only this slice; drag is later.
 */
function ComponentsRail({
  groups,
  search,
  canEdit,
  onAddSection,
  onInsertComponent,
}: {
  groups: ComponentGroup[];
  search: string;
  canEdit: boolean;
  onAddSection: () => void;
  onInsertComponent: (component: string) => boolean;
}) {
  const t = useTranslations("pageBuilder");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [hint, setHint] = useState<string | null>(null);

  function insert(component: string) {
    if (onInsertComponent(component)) setHint(null);
    else setHint(t("addSectionFirst"));
  }

  const visible = filterGroups(groups, search);

  // Map a kit id to a display label; null = the individually-imported bucket.
  function groupLabel(kit: string | null): string {
    if (kit == null) return t("kitIndividual");
    // i18n keys kit.blog/kit.landing/kit.docs; fall back to the raw id.
    const key = `kit.${kit}`;
    const label = t(key);
    return label === key ? kit : label;
  }

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-3">
      {hint && (
        <p role="status" className="rounded-md bg-surface-muted px-3 py-2 text-xs text-foreground-muted">
          {hint}
        </p>
      )}
      {/* LAYOUT — the Section primitive (always present). */}
      <div>
        <p className="px-1 font-mono text-[11px] uppercase tracking-wide text-foreground-muted">
          {t("categoryLayout")}
        </p>
        <ul className="mt-1.5 space-y-1">
          <li>
            <button
              type="button"
              disabled={!canEdit}
              draggable={canEdit}
              onDragStart={(e) => setDragPayload(e, { kind: "section" })}
              onClick={onAddSection}
              className="w-full cursor-grab rounded-md border border-border bg-surface px-3 py-2 text-left text-sm text-foreground hover:bg-surface-muted active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("layoutSection")}
            </button>
          </li>
        </ul>
      </div>

      {/* COMPONENTS — grouped by source kit. */}
      <div>
        <p className="px-1 font-mono text-[11px] uppercase tracking-wide text-foreground-muted">
          {t("categoryComponents")}
        </p>
        {visible.length === 0 ? (
          <p className="mt-1.5 px-1 text-sm text-foreground-muted">
            {search.trim() ? t("componentsNoMatch") : t("componentsEmpty")}
          </p>
        ) : (
          <div className="mt-1.5 space-y-2">
            {visible.map((g) => {
              const label = groupLabel(g.kit);
              const isCollapsed = collapsed[label] ?? false;
              return (
                <div key={g.kit ?? "__ungrouped"}>
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsed((c) => ({ ...c, [label]: !isCollapsed }))
                    }
                    aria-expanded={!isCollapsed}
                    className="flex w-full items-center justify-between rounded px-1 py-1 text-left text-xs font-medium text-foreground hover:bg-surface-muted"
                  >
                    <span>{label}</span>
                    <span className="text-foreground-muted">
                      {isCollapsed ? "+" : "−"}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <ul className="mt-1 space-y-1">
                      {g.components.map((name) => (
                        <li key={name}>
                          <button
                            type="button"
                            disabled={!canEdit}
                            draggable={canEdit}
                            onDragStart={(e) =>
                              setDragPayload(e, { kind: "component", name })
                            }
                            onClick={() => insert(name)}
                            className="w-full cursor-grab rounded-md border border-border bg-surface px-3 py-2 text-left text-sm text-foreground hover:bg-surface-muted active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
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

/**
 * Center Layers tree: the selected page's Sections and, nested under each, the
 * component blocks dropped into it. Selecting a node sets the builder's selected
 * block (which a rail click then inserts into, and a later slice's right rail
 * reads). This renders the SAME `Block[]` shape the C3 block REST persists, so
 * the Center "Layers ⟷ Preview" task can reuse it. ponytail: two fixed levels
 * (section → component) — matches the section model; deeper nesting isn't a thing
 * the editor exposes yet.
 */
function LayersTree({
  blocks,
  selectedId,
  onSelect,
  onDropComponent,
  onMoveNode,
  onDeleteColumn,
}: {
  blocks: Block[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDropComponent: (sectionId: string, colIndex: number, name: string) => void;
  onMoveNode: (dragId: string, targetId: string, position: "before" | "after" | "into") => void;
  onDeleteColumn: (columnId: string) => void;
}) {
  const t = useTranslations("pageBuilder");
  // The column-drop slot under the cursor, keyed `${sectionId}:${colIndex}`.
  const [hoverSlot, setHoverSlot] = useState<string | null>(null);
  // Reorder hover: which node + which half (before/after) the cursor is over.
  const [hoverEdge, setHoverEdge] = useState<{ id: string; pos: "before" | "after" } | null>(null);
  // Which column's delete is awaiting in-app confirm (NOT native window.confirm).
  const [confirmDeleteCol, setConfirmDeleteCol] = useState<string | null>(null);

  function nodeClass(id: string): string {
    return (
      "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors " +
      (selectedId === id
        ? "border-primary bg-primary-subtle text-foreground"
        : "border-border bg-surface text-foreground hover:bg-surface-muted")
    );
  }

  // Top half of the node = drop BEFORE it, bottom half = drop AFTER it.
  function edgeOf(e: React.DragEvent): "before" | "after" {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientY - r.top < r.height / 2 ? "before" : "after";
  }

  // Reorder drop handlers shared by Section + component node buttons. Only a
  // `move` payload reorders (a rail section/component is handled elsewhere).
  function reorderProps(id: string) {
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        setDragPayload(e, { kind: "move", id });
        e.stopPropagation();
      },
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const pos = edgeOf(e);
        setHoverEdge((h) => (h?.id === id && h.pos === pos ? h : { id, pos }));
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setHoverEdge((h) => (h?.id === id ? null : h));
        }
      },
      onDrop: (e: React.DragEvent) => {
        const pos = edgeOf(e);
        setHoverEdge(null);
        const payload = readDragPayload(e);
        if (payload?.kind !== "move") return;
        e.preventDefault();
        e.stopPropagation();
        onMoveNode(payload.id, id, pos);
      },
    };
  }

  function edgeClass(id: string): string {
    if (hoverEdge?.id !== id) return "";
    return hoverEdge.pos === "before"
      ? " ring-2 ring-primary ring-offset-1 [box-shadow:0_-2px_0_var(--color-primary)]"
      : " ring-2 ring-primary ring-offset-1 [box-shadow:0_2px_0_var(--color-primary)]";
  }

  return (
    <ul className="mx-auto max-w-xl space-y-2">
      {blocks.map((b, i) => (
        <li key={b.id}>
          <button
            type="button"
            onClick={() => onSelect(b.id)}
            className={nodeClass(b.id) + edgeClass(b.id)}
            {...reorderProps(b.id)}
          >
            {isSection(b) ? `${t("layoutSection")} ${i + 1}` : b.component}
          </button>
          {isSection(b) && (
            // Lay columns as a ROW (grid), mirroring the real render in
            // tree.ts planSection: N equal tracks, or collapse → empty cols 0fr.
            <ul
              className="mt-2 grid gap-2 border-l border-border pl-4"
              style={{ gridTemplateColumns: sectionGridCols(b) }}
            >
              {sectionColumns(b).map((col, ci) => {
                const slotKey = `${b.id}:${ci}`;
                const active = hoverSlot === slotKey;
                return (
                  <li
                    key={col.id}
                    // Each COLUMN is its own drop target → addComponentToColumn.
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "copy";
                      if (hoverSlot !== slotKey) setHoverSlot(slotKey);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                        setHoverSlot((s) => (s === slotKey ? null : s));
                      }
                    }}
                    onDrop={(e) => {
                      setHoverSlot(null);
                      const payload = readDragPayload(e);
                      e.stopPropagation();
                      // A rail component → new block in this column. A `move` of an
                      // existing component → drop INTO this column (cross-column).
                      if (payload?.kind === "component") {
                        e.preventDefault();
                        onDropComponent(b.id, ci, payload.name);
                      } else if (payload?.kind === "move") {
                        e.preventDefault();
                        onMoveNode(payload.id, col.id, "into");
                      }
                    }}
                    className={
                      "rounded-md border border-dashed p-2 transition-colors " +
                      (active
                        ? "border-primary bg-primary-subtle"
                        : "border-border bg-surface-muted")
                    }
                  >
                    <div className="flex items-center gap-1 pb-1">
                      <button
                        type="button"
                        onClick={() => onSelect(col.id)}
                        aria-pressed={selectedId === col.id}
                        className={
                          "flex-1 rounded px-1 text-left font-mono text-[11px] uppercase tracking-wide transition-colors " +
                          (selectedId === col.id
                            ? "text-primary"
                            : "text-foreground-muted hover:text-foreground")
                        }
                      >
                        {t("column")} {ci + 1}
                      </button>
                      {sectionColumns(b).length > 1 && (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteCol(col.id)}
                          title={t("deleteColumn.action")}
                          aria-label={t("deleteColumn.action")}
                          className="rounded p-0.5 text-foreground-muted transition-colors hover:text-foreground"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M3 6h18M8 6V4h8v2m-9 0v14a2 2 0 002 2h6a2 2 0 002-2V6" />
                          </svg>
                        </button>
                      )}
                    </div>
                    {confirmDeleteCol === col.id && (
                      <div className="mb-1.5 rounded-md border border-border bg-surface p-2">
                        <p className="mb-1.5 text-xs text-foreground">
                          {t("deleteColumn.confirm")}
                        </p>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteColumn(col.id);
                              setConfirmDeleteCol(null);
                            }}
                            className="rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground"
                          >
                            {t("deleteColumn.action")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteCol(null)}
                            className="rounded border border-border px-2 py-1 text-[11px] text-foreground hover:bg-surface-muted"
                          >
                            {t("deleteColumn.cancel")}
                          </button>
                        </div>
                      </div>
                    )}
                    {(col.children?.length ?? 0) > 0 ? (
                      <ul className="space-y-1.5">
                        {col.children!.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => onSelect(c.id)}
                              className={nodeClass(c.id) + edgeClass(c.id)}
                              {...reorderProps(c.id)}
                            >
                              {c.component}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="px-1 py-1 text-xs text-foreground-muted">
                        {t("dropComponentHint")}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Per-locale OG-image picker for the SEO tab. Stores a single asset URL for the
 * active locale. Browses the existing R2 media library via GET /api/assets (the
 * same source as components/media/media-gallery.tsx) — opens a thumbnail grid on
 * demand, no upload/delete here (that lives in the Media admin). PURE-fetch, REST
 * only. Empty value = no OG image for this locale (render omits og:image).
 *
 * ponytail: lazy gallery fetch the first time the picker opens; refetch is cheap
 * and the list is small. No dep, native <img>.
 */
function MetaImagePicker({
  value,
  locale,
  onChange,
}: {
  value: string;
  locale: string;
  onChange: (url: string) => void;
}) {
  const t = useTranslations("pageBuilder");
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<{ key: string; url: string; filename: string }[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    let live = true;
    void fetch("/api/assets")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        if (live) {
          setAssets(list as { key: string; url: string; filename: string }[]);
          setLoaded(true);
        }
      })
      .catch(() => setLoaded(true));
    return () => {
      live = false;
    };
  }, [open, loaded]);

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <span className="text-xs text-foreground-muted">
        {`${t("seoMetaImage")} (${locale})`}
      </span>
      {value ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt=""
            className="h-16 w-16 rounded-md border border-border object-cover"
          />
          <div className="flex flex-col gap-1">
            <span className="truncate font-mono text-xs text-foreground-muted" title={value}>
              {value}
            </span>
            <button
              type="button"
              onClick={() => onChange("")}
              className="self-start text-xs text-danger hover:underline"
            >
              {t("seoMetaImageRemove")}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-foreground-muted">{t("seoMetaImageEmpty")}</p>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="self-start rounded-md border border-border bg-surface-raised px-3 py-1.5 text-xs text-foreground hover:bg-surface-muted"
      >
        {open ? t("seoMetaImageClose") : t("seoMetaImagePick")}
      </button>
      {open && (
        <div className="rounded-md border border-border bg-surface p-2">
          {!loaded ? (
            <p className="text-xs text-foreground-muted">{t("loading")}</p>
          ) : assets.length === 0 ? (
            <p className="text-xs text-foreground-muted">{t("seoMetaImageGalleryEmpty")}</p>
          ) : (
            <ul className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto">
              {assets.map((a) => (
                <li key={a.key}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(a.url);
                      setOpen(false);
                    }}
                    title={a.filename}
                    className={`block w-full overflow-hidden rounded-md border ${
                      value === a.url ? "border-primary" : "border-border"
                    } hover:border-primary`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt={a.filename} className="aspect-square w-full object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Right-rail SEO tab: edits the selected page's per-content-locale meta title +
 * description and PUTs them back through the EXISTING C2 `/api/pages` route
 * (same body `validatePageMeta` validates — no new page-store/validation path).
 * Slug / parent / publish are kept as-is; this tab only owns SEO. After a
 * successful save it refetches pages so the picker labels stay current.
 *
 * ponytail: local draft maps seeded from the loaded page (re-keyed per page id
 * by the caller); no form lib. Reuses the pure setLocaleValue/buildSeoMetaBody
 * helpers (tested in page-meta.test.ts).
 */
function SeoForm({
  page,
  locales,
  onSaved,
}: {
  page: PageSummary;
  locales: string[];
  onSaved: () => void;
}) {
  const t = useTranslations("pageBuilder");
  const [metaTitle, setMetaTitle] = useState<Record<string, string>>({
    ...page.metaTitle,
  });
  const [metaDescription, setMetaDescription] = useState<Record<string, string>>({
    ...page.metaDescription,
  });
  const [metaImage, setMetaImage] = useState<Record<string, string>>({
    ...page.metaImage,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const picker = useLocalePicker(locales);
  const loc = picker.active;

  async function save() {
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const body = buildSeoMetaBody(page, metaTitle, metaDescription, metaImage);
      const res = await fetch("/api/pages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `HTTP ${res.status}`);
        return;
      }
      setSaved(true);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p className="truncate font-mono text-xs text-foreground-muted">{page.slug}</p>
      <LocalePicker state={picker} label={t("localePickerLabel")} />
      <fieldset key={loc} className="flex flex-col gap-2 border-t border-border pt-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground-muted">{t("seoMetaTitle")}</span>
          <input
            className={input}
            value={metaTitle[loc] ?? ""}
            onChange={(e) =>
              setMetaTitle((m) => setLocaleValue(m, loc, e.target.value))
            }
            aria-label={`${t("seoMetaTitle")} (${loc})`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground-muted">{t("seoMetaDescription")}</span>
          <textarea
            className={input}
            rows={3}
            value={metaDescription[loc] ?? ""}
            onChange={(e) =>
              setMetaDescription((m) => setLocaleValue(m, loc, e.target.value))
            }
            aria-label={`${t("seoMetaDescription")} (${loc})`}
          />
        </label>
        <MetaImagePicker
          value={metaImage[loc] ?? ""}
          locale={loc}
          onChange={(url) => setMetaImage((m) => setLocaleValue(m, loc, url))}
        />
      </fieldset>

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      {saved && !error && (
        <p role="status" className="text-xs text-foreground-muted">
          {t("seoSaved")}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {busy ? t("saving") : t("seoSave")}
      </button>
    </form>
  );
}

/**
 * Right-rail Block tab when a Section is selected — the visual settings panel
 * (mirrors aicms `page_structure_diagram.tsx`). Edits the Section's `props` via
 * the parent's `mergeSectionProps` (columns reflows column children); the
 * existing top-bar Save persists. All editing is PURE prop merges — no store.
 *
 * Background swatches are the SITE THEME purpose tokens (`var(--color-*)`), not
 * hardcoded hex — they resolve against the live theme at render (the renderer
 * writes `style.backgroundColor` inline, so the var applies on the public page).
 * Padding has a rem/px unit toggle per side (rem default — render reads
 * `padding<Side>Unit`).
 */
/**
 * Per-column settings panel. Today it holds the per-viewport VISIBILITY control:
 * hide this column on mobile / tablet / desktop. Storage is per-column boolean
 * props (`hideMobile`/`hideTablet`/`hideDesktop`); the renderer (tree.ts
 * `columnVisibilityClass`) maps them to `pb-hide-*` responsive utility classes.
 * (When the fuller Column settings task lands — align/padding/margin/gap/bg — it
 * extends THIS panel; keep it one panel, not two.)
 */
function ColumnSettings({
  column,
  onChange,
}: {
  column: Block;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const t = useTranslations("pageBuilder");
  const p = (column.props ?? {}) as Record<string, unknown>;
  const label = "text-xs font-medium uppercase tracking-wide text-foreground-muted";
  const seg = "flex-1 rounded-md border px-2 py-1 text-sm transition-colors";
  const segOn = "border-primary bg-primary-subtle text-foreground font-medium";
  const segOff = "border-border text-foreground-muted hover:text-foreground";

  const viewports: { key: "hideMobile" | "hideTablet" | "hideDesktop"; label: string }[] = [
    { key: "hideMobile", label: t("colVisibility.mobile") },
    { key: "hideTablet", label: t("colVisibility.tablet") },
    { key: "hideDesktop", label: t("colVisibility.desktop") },
  ];

  return (
    <div className="flex flex-col gap-5">
      <h3 className="text-sm font-medium text-foreground">{t("columnSettings")}</h3>
      <div className="flex flex-col gap-1.5">
        <span className={label}>{t("colVisibility.label")}</span>
        <p className="text-[11px] text-foreground-muted">{t("colVisibility.hint")}</p>
        <div className="flex gap-1">
          {viewports.map((v) => {
            const hidden = Boolean(p[v.key]);
            return (
              <button
                key={v.key}
                type="button"
                onClick={() => onChange({ [v.key]: !hidden })}
                aria-pressed={hidden}
                className={`${seg} ${hidden ? segOn : segOff}`}
              >
                {v.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SectionSettings({
  section,
  onChange,
}: {
  section: Block;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const t = useTranslations("pageBuilder");
  const p = (section.props ?? {}) as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === "number" ? v : d);
  const s = (v: unknown, d: string) => (typeof v === "string" && v ? v : d);

  const columns = num(p.columns, 1);
  const behavior = s(p.columnBehavior, "equal");
  const vAlign = s(p.verticalAlign, "top");
  const hAlign = s(p.horizontalAlign, "left");
  const maxWidth = s(p.maxWidth, "1280px");
  const bg = s(p.backgroundColor, "transparent");

  const label = "text-xs font-medium uppercase tracking-wide text-foreground-muted";
  const seg =
    "flex-1 rounded-md border px-2 py-1 text-sm transition-colors";
  const segOn = "border-primary bg-primary-subtle text-foreground font-medium";
  const segOff = "border-border text-foreground-muted hover:text-foreground";

  // Background swatches reuse the design-system purpose tokens (theme palette).
  const swatches: { value: string; key: string }[] = [
    { value: "transparent", key: "bgNone" },
    { value: "var(--color-surface)", key: "bgSurface" },
    { value: "var(--color-surface-raised)", key: "bgRaised" },
    { value: "var(--color-surface-muted)", key: "bgMuted" },
    { value: "var(--color-primary)", key: "bgPrimary" },
    { value: "var(--color-primary-subtle)", key: "bgPrimarySubtle" },
    { value: "var(--color-foreground)", key: "bgForeground" },
  ];

  const sides: ("Top" | "Right" | "Bottom" | "Left")[] = ["Top", "Right", "Bottom", "Left"];
  const aligns: { v: string; h: string }[] = [
    { v: "top", h: "left" }, { v: "top", h: "center" }, { v: "top", h: "right" },
    { v: "center", h: "left" }, { v: "center", h: "center" }, { v: "center", h: "right" },
    { v: "bottom", h: "left" }, { v: "bottom", h: "center" }, { v: "bottom", h: "right" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <h3 className="text-sm font-medium text-foreground">{t("sectionSettings")}</h3>

      {/* Columns */}
      <div className="flex flex-col gap-1.5">
        <span className={label}>{t("sectionColumnsLabel")}</span>
        <div className="flex gap-1">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange({ columns: n })}
              aria-pressed={columns === n}
              className={`${seg} ${columns === n ? segOn : segOff}`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Empty columns behavior */}
      <div className="flex flex-col gap-1.5">
        <span className={label}>{t("sectionEmptyCols")}</span>
        <div className="flex gap-1">
          {(["equal", "collapse"] as const).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => onChange({ columnBehavior: b })}
              aria-pressed={behavior === b}
              className={`${seg} ${behavior === b ? segOn : segOff}`}
            >
              {t(`sectionBehavior.${b}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Content alignment (vertical × horizontal) */}
      <div className="flex flex-col gap-1.5">
        <span className={label}>{t("sectionAlign")}</span>
        <div className="grid w-[84px] grid-cols-3 gap-0.5">
          {aligns.map(({ v, h }) => {
            const on = vAlign === v && hAlign === h;
            return (
              <button
                key={`${v}-${h}`}
                type="button"
                onClick={() => onChange({ verticalAlign: v, horizontalAlign: h })}
                aria-pressed={on}
                aria-label={`${v} ${h}`}
                className={`flex h-6 items-center justify-center rounded-sm border text-xs ${on ? segOn : segOff}`}
              >
                <span className="block h-1.5 w-1.5 rounded-full bg-current" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Padding — one input + rem/px unit toggle per side (rem default) */}
      <div className="flex flex-col gap-1.5">
        <span className={label}>{t("sectionPadding")}</span>
        <div className="grid grid-cols-2 gap-2">
          {sides.map((side) => {
            const unit = s(p[`padding${side}Unit`], "rem");
            return (
              <label key={side} className="flex flex-col gap-1">
                <span className="text-[11px] text-foreground-muted">
                  {t(`sectionSide.${side.toLowerCase()}`)}
                </span>
                <div className="flex items-stretch overflow-hidden rounded-md border border-border">
                  <input
                    type="number"
                    min={0}
                    value={num(p[`padding${side}`], 0)}
                    onChange={(e) => onChange({ [`padding${side}`]: +e.target.value })}
                    className="w-full bg-surface px-2 py-1 text-sm text-foreground outline-none"
                    aria-label={`${t("sectionPadding")} ${side}`}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onChange({ [`padding${side}Unit`]: unit === "rem" ? "px" : "rem" })
                    }
                    className="border-l border-border bg-surface-muted px-2 text-xs text-foreground-muted hover:text-foreground"
                    aria-label={`${side} unit: ${unit}`}
                  >
                    {unit}
                  </button>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Gap */}
      <label className="flex flex-col gap-1.5">
        <span className={label}>{t("sectionGap")}</span>
        <input
          type="number"
          min={0}
          value={num(p.gap, 16)}
          onChange={(e) => onChange({ gap: +e.target.value })}
          className="w-24 rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground outline-none"
        />
      </label>

      {/* Max width */}
      <label className="flex flex-col gap-1.5">
        <span className={label}>{t("sectionMaxWidth")}</span>
        <select
          value={maxWidth}
          onChange={(e) => onChange({ maxWidth: e.target.value })}
          className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground outline-none"
        >
          {["960px", "1024px", "1152px", "1280px", "1440px"].map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
          <option value="full">{t("sectionMaxWidthFull")}</option>
        </select>
      </label>

      {/* Background — theme palette swatches */}
      <div className="flex flex-col gap-1.5">
        <span className={label}>{t("sectionBackground")}</span>
        <div className="flex flex-wrap gap-1.5">
          {swatches.map((c) => {
            const on = bg === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => onChange({ backgroundColor: c.value })}
                aria-pressed={on}
                title={t(`sectionSwatch.${c.key}`)}
                aria-label={t(`sectionSwatch.${c.key}`)}
                className={`h-7 w-7 rounded-md border-2 ${on ? "border-primary" : "border-border"}`}
                style={
                  c.value === "transparent"
                    ? { backgroundImage: "linear-gradient(45deg,var(--color-border) 25%,transparent 25%,transparent 75%,var(--color-border) 75%)", backgroundSize: "8px 8px" }
                    : { backgroundColor: c.value }
                }
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Right-rail Block tab when a COMPONENT block is selected — a settings form
 * auto-generated from the component's `propsSchema` (parsed via `parsePropsSchema`).
 *
 * One control per declared prop: text/textarea(richtext)/number/checkbox/select.
 * TRANSLATABLE string/richtext props (`translatable:true` in the schema) render
 * one input PER content locale (mirrors the SEO tab) and write a `{loc:text}`
 * object via `setLocalizedProp`; non-translatable / scalar props render a single
 * control. Every edit re-validates the full props through `validateBlockProps`
 * (the schema overload — type coercion + required-prop retention) and hands the
 * parent the persistable props; the existing top-bar Save writes them. All PURE
 * prop-merge logic lives in `page-blocks.ts` — never duplicated here.
 */
function ComponentSettings({
  block,
  schema,
  locales,
  onChange,
}: {
  block: Block;
  schema: PropField[];
  locales: string[];
  onChange: (props: Record<string, unknown>) => void;
}) {
  const t = useTranslations("pageBuilder");
  const props = (block.props ?? {}) as Record<string, unknown>;
  const multi = locales.length > 1;
  const defaultLocale = locales[0];
  const picker = useLocalePicker(locales);
  const hasTranslatable = schema.some((f) => f.translatable);

  const label = "text-xs font-medium uppercase tracking-wide text-foreground-muted";
  const input =
    "w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-foreground-muted";

  // Apply one field's new raw value, then re-validate the WHOLE props by schema so
  // types coerce and required props stay present.
  function setField(name: string, value: unknown) {
    onChange(validateBlockProps({ ...props, [name]: value }, schema));
  }
  function setLocalized(name: string, locale: string, value: string) {
    const current = props[name];
    setField(name, setLocalizedProp(current, locale, value, locales));
  }

  if (schema.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="font-mono text-sm text-foreground">{block.component}</p>
        <p className="text-sm text-foreground-muted">{t("componentNoProps")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="font-mono text-sm text-foreground">{block.component}</p>
      {multi && hasTranslatable && (
        <LocalePicker state={picker} label={t("localePickerLabel")} />
      )}
      {schema.map((f) => {
        const raw = props[f.name];
        const labelText = f.label || f.name;
        return (
          <fieldset key={f.name} className="flex flex-col gap-1.5">
            <span className={label}>
              {labelText}
              {f.required && <span className="text-danger"> *</span>}
            </span>
            {f.description && (
              <span className="text-xs text-foreground-muted">{f.description}</span>
            )}

            {/* Translatable text → the active locale only (LocalePicker above). */}
            {f.translatable ? (
              (() => {
                const loc = picker.active;
                const value = localeFieldValue(raw, loc, defaultLocale);
                const aria = multi ? `${labelText} (${loc})` : labelText;
                return f.type === "richtext" ? (
                  <textarea
                    className={`${input} min-h-16`}
                    value={value}
                    placeholder={f.default}
                    aria-label={aria}
                    onChange={(e) => setLocalized(f.name, loc, e.target.value)}
                  />
                ) : (
                  <input
                    type="text"
                    className={input}
                    value={value}
                    placeholder={f.default}
                    aria-label={aria}
                    onChange={(e) => setLocalized(f.name, loc, e.target.value)}
                  />
                );
              })()
            ) : f.type === "select" ? (
              <select
                className={input}
                value={typeof raw === "string" ? raw : f.default}
                aria-label={labelText}
                onChange={(e) => setField(f.name, e.target.value)}
              >
                {(f.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "boolean" ? (
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={raw === true || raw === "true"}
                  aria-label={labelText}
                  onChange={(e) => setField(f.name, e.target.checked)}
                />
                {labelText}
              </label>
            ) : f.type === "number" ? (
              <input
                type="number"
                className={input}
                value={typeof raw === "number" ? raw : f.default}
                placeholder={f.default}
                aria-label={labelText}
                onChange={(e) =>
                  setField(f.name, e.target.value === "" ? "" : Number(e.target.value))
                }
              />
            ) : f.type === "richtext" ? (
              <textarea
                className={`${input} min-h-16`}
                value={typeof raw === "string" ? raw : ""}
                placeholder={f.default}
                aria-label={labelText}
                onChange={(e) => setField(f.name, e.target.value)}
              />
            ) : (
              <input
                type="text"
                className={input}
                value={typeof raw === "string" ? raw : ""}
                placeholder={f.default}
                aria-label={labelText}
                onChange={(e) => setField(f.name, e.target.value)}
              />
            )}
          </fieldset>
        );
      })}
    </div>
  );
}

/**
 * Right-rail PAGE tab for the selected page: a publish/unpublish toggle and a
 * delete action. Both use EXISTING REST — publish flips publishStatus via the
 * full-meta `PUT /api/pages` (pure `buildPublishToggleBody`, meta untouched);
 * delete is `DELETE /api/pages?id=`. Delete is gated by an IN-APP confirm (NOT
 * native window.confirm — that blocks browser automation), and clears the
 * builder selection on success. A future versioning track adds a top-bar
 * publish; keep this a simple toggle so the two reconcile later.
 */
function PageSettings({
  page,
  onChanged,
  onDeleted,
}: {
  page: PageSummary;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("pageBuilder");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const published = page.publishStatus === "published";

  async function togglePublish() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/pages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPublishToggleBody(page)),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `HTTP ${res.status}`);
        return;
      }
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/pages?id=${encodeURIComponent(page.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `HTTP ${res.status}`);
        return;
      }
      onDeleted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const btn =
    "rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50";

  return (
    <div className="flex flex-col gap-4">
      {/* PUBLISH STATE */}
      <div className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-wide text-foreground-muted">
          {t("page.statusLabel")}
        </span>
        <span className="text-sm text-foreground">
          {published ? t("page.statusPublished") : t("page.statusDraft")}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void togglePublish()}
          className={`${btn} self-start bg-primary text-primary-foreground hover:opacity-90`}
        >
          {published ? t("page.unpublish") : t("page.publish")}
        </button>
      </div>

      {/* DELETE (in-app confirm, no native window.confirm) */}
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <span className="text-xs uppercase tracking-wide text-foreground-muted">
          {t("page.dangerLabel")}
        </span>
        {confirming ? (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-muted p-3">
            <p className="text-sm text-foreground">{t("page.deleteConfirm")}</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove()}
                className={`${btn} bg-red-600 text-white hover:bg-red-700`}
              >
                {t("page.deleteAction")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(false)}
                className={`${btn} border border-border text-foreground hover:bg-surface-muted`}
              >
                {t("page.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(true)}
            className={`${btn} self-start border border-red-600 text-red-600 hover:bg-red-50`}
          >
            {t("page.delete")}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
