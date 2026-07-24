"use client";

/**
 * Page Builder shell (epic: page-builder) — the top-level ORCHESTRATOR.
 *
 * Top bar + 3-column shell modeled on aicms `page-builder-v2`, adapted to this
 * project's design system (purpose Tailwind tokens, next-intl EN/FI/ET — see
 * docs/page-builder-layout.md). The shell owns:
 *  - chrome state (viewport, center/right tabs, rail collapse, inspector width);
 *  - the page list + selection, and the loaded palette/collections/API sources;
 *  - draft PERSISTENCE (load / debounced auto-save / manual save / publish,
 *    versioning nonces) and the publish-together dialog;
 * and composes the extracted pieces around the `useBlockEditor` controller
 * (block tree + mutation handlers): `LayersPanel`, `PreviewPanel`,
 * `BlockInspector`, plus the existing rail/settings components.
 *
 * REST-only / no server actions. Purpose tokens only.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  type InspectorPreset,
  inspectorWidth,
  loadInspectorPreset,
  saveInspectorPreset,
} from "@/lib/page-builder/inspector-width";
import { loadCollapsed, saveCollapsed } from "@/lib/page-builder/panel-collapse";
import { nextDraftStatus, draftStatusKey, type DraftStatus } from "@/lib/pages/draft-status";
import {
  flattenPagesForPicker,
  topLevelParents,
  type PageOption,
} from "@/lib/pages/page-picker";
import type { PageSummary } from "@/db/page-store";
import { setActivePageContext } from "@/lib/chat/page-context";
import { PAGE_MUTATION_EVENT } from "@/lib/chat/page-mutation-signal";
import type { ComponentGroup } from "@/lib/components/grouped";
import { listSections } from "@/lib/pages/page-blocks";
import { collectComponentNames, type Block } from "@/lib/render/tree";
import type {
  Viewport,
  CenterTab,
  RightTab,
  CollectionMeta,
  ApiRequestMeta,
  ApiSourceMeta,
} from "@/lib/page-builder/types";
import { ViewportIcon, CollapseToggle, ICON } from "./shared";
import { ComponentsRail } from "./components-rail";
import { PagePicker } from "./page-picker";
import { PublishDialog } from "./publish-dialog";
import { SeoForm } from "./seo-form";
import { PageSettings } from "./page-settings";
import { PageTranslateMissingButton } from "./page-translate-missing";
import { VersionHistory } from "./version-history";
import { useBlockEditor } from "./use-block-editor";
import { LayersPanel } from "./layers-panel";
import { PreviewPanel, type PreviewTheme } from "./preview-panel";
import { BlockInspector } from "./block-inspector";

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
  const [previewTheme, setPreviewTheme] = useState<PreviewTheme>("system");

  // page-builder-ux: resizable right-side inspector. The operator picks one of 3
  // preset widths (default/¼/½); we measure the 3-column area and resolve the
  // preset → clamped px (canvas keeps a minimum). Persisted in localStorage.
  const [inspectorPreset, setInspectorPreset] = useState<InspectorPreset>("default");
  const [editorW, setEditorW] = useState(0);
  const columnsRef = useRef<HTMLDivElement>(null);
  // page-builder-ux: each side rail collapses entirely to widen the canvas;
  // collapsed state persists per side (localStorage). Default-expanded.
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  useEffect(() => {
    setInspectorPreset(loadInspectorPreset());
    setLeftCollapsed(loadCollapsed("left"));
    setRightCollapsed(loadCollapsed("right"));
  }, []);
  useEffect(() => {
    const el = columnsRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setEditorW(entry.contentRect.width));
    ro.observe(el);
    setEditorW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  function onPickInspectorPreset(p: InspectorPreset) {
    setInspectorPreset(p);
    saveInspectorPreset(p);
  }
  function toggleLeftCollapsed() {
    setLeftCollapsed((c) => {
      saveCollapsed("left", !c);
      return !c;
    });
  }
  function toggleRightCollapsed() {
    setRightCollapsed((c) => {
      saveCollapsed("right", !c);
      return !c;
    });
  }

  // Real page list + the operator's current selection. The center/right panels
  // key off `selected`; the editor loads that page's blocks / settings.
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [selected, setSelected] = useState<PageOption | null>(null);

  // Components rail: the Site's component groups (by source kit AND by operator
  // tag) + the search query + which grouping the rail renders.
  const [groups, setGroups] = useState<ComponentGroup[]>([]);
  const [tagGroups, setTagGroups] = useState<ComponentGroup[]>([]);
  const [groupBy, setGroupBy] = useState<"kit" | "tag">("kit");
  const [search, setSearch] = useState("");
  // name → raw propsSchema JSON (Block tab renders a settings form per declared prop).
  const [propsSchemas, setPropsSchemas] = useState<Record<string, string | null>>({});
  // Components with an unpublished DRAFT (component edits land as drafts; the
  // preview renders them but the public site won't until published). Drives the
  // Layers/inspector "draft" badges + the publish-together dialog.
  const [draftComponents, setDraftComponents] = useState<Set<string>>(new Set());
  // name → updatedAt token from the last palette load. Compared on window focus
  // to detect EXTERNAL component edits (MCP tools can't fire the in-app
  // page-mutation event) and refresh the stale preview.
  const paletteVersions = useRef<Record<string, number>>({});
  // Publish-together dialog: draft components used by the page awaiting the
  // operator's publish decision (null = closed).
  const [publishDialog, setPublishDialog] = useState<string[] | null>(null);

  // (Re)load the component palette: props schemas + draft flags. Returns true
  // when any component changed since the previous load (new/removed/edited).
  const loadPalette = useCallback(async (): Promise<boolean> => {
    const res = await fetch("/api/components/palette");
    if (!res.ok) return false;
    const body = (await res.json()) as {
      palette?: { name: string; propsSchema: string | null; hasDraft?: boolean; version?: number }[];
    };
    const list = body.palette ?? [];
    setPropsSchemas(Object.fromEntries(list.map((p) => [p.name, p.propsSchema])));
    setDraftComponents(new Set(list.filter((p) => p.hasDraft).map((p) => p.name)));
    const versions = Object.fromEntries(list.map((p) => [p.name, p.version ?? 0]));
    const changed = JSON.stringify(versions) !== JSON.stringify(paletteVersions.current);
    paletteVersions.current = versions;
    return changed;
  }, []);
  // Phase-2 binding (Slice C): the Site's collections (registry views) for the
  // "Bind to collection" + List query panels. tableName is the stable handle.
  const [collections, setCollections] = useState<CollectionMeta[]>([]);
  // external-data-sources Slice 5: API data sources (+ saved requests) for the
  // combined source picker in the binding panels. Graceful: 403/offline → [].
  const [apiSources, setApiSources] = useState<ApiSourceMeta[]>([]);

  // The block-tree editing controller: the draft tree, the selected node id, the
  // dirty flag and one handler per tree operation (see use-block-editor.ts).
  const editor = useBlockEditor(propsSchemas, contentLocales);
  const { blocks, selectedBlockId, dirty } = editor;
  const [saving, setSaving] = useState(false);
  // Versioning slice 3: the draft auto-save status badge (saving…/saved/published).
  const [draftStatus, setDraftStatus] = useState<DraftStatus>("saved");
  const [publishing, setPublishing] = useState(false);
  // Unpublished-changes warning (mirrors the develop workbench's draft bar):
  // seeded by the draft GET (server compares draft vs published), turned on by
  // any local edit, cleared by a successful publish.
  const [pendingChanges, setPendingChanges] = useState(false);
  // Versioning slice 4: bumped to re-run the draft load effect (e.g. after a
  // restore replaces the draft with a copy of a past version).
  const [draftReloadNonce, setDraftReloadNonce] = useState(0);
  // Versioning slice 4: when set, the preview iframe renders this specific past
  // version READ-ONLY (?version=) instead of the live draft. Cleared to go back.
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);

  // Load the selected page's blocks (or reset when nothing is selected).
  useEffect(() => {
    if (!selected) {
      editor.setBlocks([]);
      editor.setSelectedBlockId(null);
      editor.setDirty(false);
      setPendingChanges(false);
      return;
    }
    let live = true;
    void (async () => {
      // Versioning slice 3: load the DRAFT (create-if-absent), not page.blocks.
      const res = await fetch(`/api/pages/${selected.id}/draft`);
      if (!live) return;
      if (res.ok) {
        const body = (await res.json()) as { blocks?: Block[]; pendingChanges?: boolean };
        editor.setBlocks(body.blocks ?? []);
        setPendingChanges(Boolean(body.pendingChanges));
      } else {
        editor.setBlocks([]);
        setPendingChanges(false);
      }
      editor.setSelectedBlockId(null);
      editor.setDirty(false);
      setDraftStatus((s) => nextDraftStatus(s, "loaded"));
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, draftReloadNonce]);

  // Publish the selected page to the AI assistant's inline-context channel, so the
  // user's next ChatWidget message tells the assistant which page they're editing.
  // Re-runs on selection change; clears on unmount (leaving the Page Builder).
  useEffect(() => {
    setActivePageContext(
      selected
        ? {
            id: selected.id,
            path: selected.path,
            slug: selected.slug,
            published: selected.published,
            // Republishes on every block edit so renames / new sections reach the
            // assistant context and the @section autocomplete immediately.
            sections: listSections(blocks),
            // The selection too — the assistant is told which section/block the
            // user is working on, and gets that section's contents at send time.
            selectedBlockId,
          }
        : null,
    );
    return () => setActivePageContext(null);
  }, [selected, blocks, selectedBlockId]);

  // Versioning slice 4: restore a past version into a new draft, then re-load the
  // draft into the editor so it shows the restored blocks. Source untouched.
  async function onRestoreVersion(versionId: string): Promise<boolean> {
    if (!selected) return false;
    const res = await fetch(`/api/pages/${selected.id}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionId }),
    });
    if (!res.ok) return false;
    setPreviewVersionId(null); // back to the live draft view
    setDraftReloadNonce((n) => n + 1); // re-run the load effect → fresh draft
    return true;
  }

  // Clear the read-only version preview when the operator switches pages.
  useEffect(() => {
    setPreviewVersionId(null);
  }, [selected]);

  // When the AI assistant mutates the page/component/theme (it writes the SAME
  // draft the editor uses), reload so the canvas isn't stale: always refresh the
  // preview iframe; refetch the editor draft too UNLESS the operator has unsaved
  // local edits (don't clobber in-progress manual work — they can save/reload).
  useEffect(() => {
    function onMutated() {
      setPreviewNonce((n) => n + 1);
      if (!dirty) setDraftReloadNonce((n) => n + 1);
      // Component edits change draft flags/schemas — keep badges + forms fresh.
      void loadPalette();
    }
    window.addEventListener(PAGE_MUTATION_EVENT, onMutated);
    return () => window.removeEventListener(PAGE_MUTATION_EVENT, onMutated);
  }, [dirty, loadPalette]);

  // EXTERNAL component edits (MCP tools from an outside AI session) can't fire
  // the in-app mutation event, so the preview would sit stale. On window focus
  // (the operator returns from that session) re-check the palette; any component
  // change token moved → reload the preview. ponytail: focus-triggered diff, no
  // polling — a cheap local JSON fetch per focus.
  useEffect(() => {
    function onFocus() {
      void loadPalette().then((changed) => {
        if (changed) setPreviewNonce((n) => n + 1);
      });
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadPalette]);

  // Persist the current blocks to the page's DRAFT version (saveDraftBlocks).
  // Shared by the debounced auto-save and the manual Save button. Save ALWAYS
  // saves the draft, NEVER publishes. Bumps previewNonce so the preview iframe
  // (which renders the draft) reflects the just-saved state.
  async function saveDraft(): Promise<boolean> {
    if (!selected) return false;
    setSaving(true);
    setDraftStatus((s) => nextDraftStatus(s, "saveStart"));
    try {
      const res = await fetch(`/api/pages/${selected.id}/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks }),
      });
      if (res.ok) {
        editor.setDirty(false);
        setDraftStatus((s) => nextDraftStatus(s, "saveDone"));
        setPreviewNonce((n) => n + 1);
        return true;
      }
      setDraftStatus((s) => nextDraftStatus(s, "error"));
      return false;
    } catch {
      setDraftStatus((s) => nextDraftStatus(s, "error"));
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Manual Save — force an immediate draft save (no debounce).
  async function onSave() {
    await saveDraft();
  }

  // Publish — snapshot the draft into a new published version + auto-create a
  // fresh draft (publishDraft). Saves the draft first so the latest edits ship.
  // When the page uses components with unpublished DRAFTS (e.g. an AI edit), the
  // public page would still render their LIVE artifact — so first open the
  // publish-together dialog: it shows each draft component's blast radius and
  // lets the operator publish them alongside the page (or page-only).
  async function onPublish() {
    if (!selected) return;
    // Direct block references only — a draft component nested INSIDE another
    // component's markup isn't detected here. ponytail: direct refs cover the
    // builder's own compositions; add collectTreeComponentTags if nesting bites.
    const draftsOnPage = [...collectComponentNames(blocks)].filter((n) =>
      draftComponents.has(n),
    );
    if (draftsOnPage.length > 0) {
      setPublishDialog(draftsOnPage.sort());
      return;
    }
    await publishPage();
  }

  async function publishPage() {
    if (!selected) return;
    setPublishing(true);
    try {
      if (dirty && !(await saveDraft())) return; // save failed → don't publish stale
      const res = await fetch(`/api/pages/${selected.id}/publish`, { method: "POST" });
      if (res.ok) {
        setDraftStatus((s) => nextDraftStatus(s, "publishDone"));
        setPendingChanges(false);
        setPreviewNonce((n) => n + 1);
      } else {
        setDraftStatus((s) => nextDraftStatus(s, "error"));
      }
    } catch {
      setDraftStatus((s) => nextDraftStatus(s, "error"));
    } finally {
      setPublishing(false);
    }
  }

  // Dialog confirm: publish the SELECTED draft components first (each publish
  // makes its draft live everywhere it's used), then the page. A failed
  // component publish aborts before the page ships half-updated.
  async function onConfirmPublish(componentNames: string[]) {
    setPublishDialog(null);
    setPublishing(true);
    try {
      for (const name of componentNames) {
        const res = await fetch(`/api/components/${encodeURIComponent(name)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "publish" }),
        });
        if (!res.ok) {
          setDraftStatus((s) => nextDraftStatus(s, "error"));
          return;
        }
      }
    } catch {
      setDraftStatus((s) => nextDraftStatus(s, "error"));
      return;
    } finally {
      setPublishing(false);
    }
    await publishPage();
    void loadPalette(); // draft flags changed → refresh badges
  }

  // Reflect a pending edit in the status badge ("Unsaved changes") the moment a
  // block edit marks the page dirty (the debounce below then auto-saves it).
  // Any edit also means the draft now differs from the published version.
  useEffect(() => {
    if (dirty) {
      setDraftStatus((s) => nextDraftStatus(s, "edit"));
      setPendingChanges(true);
    }
  }, [dirty]);

  // Versioning slice 3: debounced AUTO-SAVE to the draft. Every block edit (after
  // 600ms idle) persists via saveDraft (→ saveDraftBlocks) and bumps previewNonce,
  // so the preview iframe (rendering the draft version) updates on its own with no
  // button press. Skip while a save is already running (saveDraft bumps itself).
  // ponytail: plain setTimeout debounce, no lib.
  useEffect(() => {
    if (!selected || !dirty || saving) return;
    const t = setTimeout(() => void saveDraft(), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, dirty, saving, selected]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const res = await fetch("/api/pages");
      if (live && res.ok) setPages((await res.json()) as PageSummary[]);
    })();
    void (async () => {
      const res = await fetch("/api/components/grouped");
      if (live && res.ok) {
        const body = (await res.json()) as {
          groups?: ComponentGroup[];
          tagGroups?: ComponentGroup[];
        };
        setGroups(body.groups ?? []);
        setTagGroups(body.tagGroups ?? []);
      }
    })();
    void loadPalette();
    void (async () => {
      // Slice C: collections for the binding panels. 403 (non-admin) / offline →
      // empty list → panels show "no collections" (graceful, never throws).
      const res = await fetch("/api/collections");
      if (live && res.ok) {
        const body = (await res.json().catch(() => [])) as CollectionMeta[];
        if (Array.isArray(body)) setCollections(body);
      }
    })();
    void (async () => {
      // external-data-sources Slice 5: API sources + their saved requests for
      // the combined source picker. Same graceful degradation as collections.
      const res = await fetch("/api/data-sources");
      if (!res.ok) return;
      const sources = (await res.json().catch(() => [])) as { id: string; name: string }[];
      if (!Array.isArray(sources)) return;
      const withRequests = await Promise.all(
        sources.map(async (s) => {
          const r = await fetch(`/api/data-sources/${s.id}/requests`);
          const reqs = r.ok ? ((await r.json().catch(() => [])) as ApiRequestMeta[]) : [];
          return { id: s.id, name: s.name, requests: Array.isArray(reqs) ? reqs : [] };
        }),
      );
      if (live) setApiSources(withRequests);
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const options = flattenPagesForPicker(pages);
  // The selected page's full summary (meta maps etc.) — the Page/SEO tabs and
  // the page-level translate action all key off it.
  const selectedPage = selected ? pages.find((p) => p.id === selected.id) ?? null : null;

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

        {/* Right: draft status + save + publish */}
        <div className="flex items-center gap-2">
          {/* Unpublished-changes warning — same signal as the develop draft bar. */}
          {selected && pendingChanges && (
            <span className="rounded-md border border-warning bg-warning-subtle px-2 py-1 text-xs font-medium text-foreground">
              {t("pendingChanges")}
            </span>
          )}
          {selected && draftStatusKey(draftStatus) && (
            <span
              className="text-xs text-foreground-muted"
              aria-live="polite"
            >
              {t(`draftStatus.${draftStatusKey(draftStatus)}`)}
            </span>
          )}
          {selectedPage && (
            <PageTranslateMissingButton
              key={selectedPage.id}
              page={selectedPage}
              blocks={blocks}
              propsSchemas={propsSchemas}
              locales={contentLocales}
              onApplyBlocks={editor.onApplyTranslations}
              onMetaSaved={() => void refreshPages(selectedPage.id)}
            />
          )}
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
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground disabled:opacity-60"
          >
            {saving ? t("saving") : t("save")}
          </button>
          <button
            type="button"
            onClick={() => void onPublish()}
            disabled={!selected || saving || publishing}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {publishing ? t("saving") : t("publish")}
          </button>
        </div>
      </header>

      {/* ── 3 COLUMNS ─────────────────────────────────────────────────── */}
      <div ref={columnsRef} className="flex flex-1 overflow-hidden">
        {/* LEFT RAIL — Components. Collapses to a thin re-expand strip. */}
        {leftCollapsed ? (
          <aside className="flex w-9 shrink-0 flex-col items-center border-r border-border bg-surface-raised py-2">
            <CollapseToggle
              side="left"
              collapsed
              onClick={toggleLeftCollapsed}
              label={t("panel.expandLeft")}
            />
          </aside>
        ) : (
          <aside className="flex w-[260px] shrink-0 flex-col border-r border-border bg-surface-raised">
            <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
              <div className="min-w-0 flex-1">
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
              <CollapseToggle
                side="left"
                collapsed={false}
                onClick={toggleLeftCollapsed}
                label={t("panel.collapseLeft")}
              />
            </div>
            <ComponentsRail
              groups={groupBy === "tag" ? tagGroups : groups}
              groupBy={groupBy}
              onGroupByChange={setGroupBy}
              search={search}
              canEdit={!!selected}
              previewTheme={previewTheme}
            />
          </aside>
        )}

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

          {/* Both panels mounted; toggled by `hidden` so the iframe stays alive. */}
          <div className="relative flex-1 overflow-hidden bg-surface-muted">
            <LayersPanel
              hidden={centerTab !== "layers"}
              selected={selected}
              draftComponents={draftComponents}
              editor={editor}
            />
            <PreviewPanel
              hidden={centerTab !== "preview"}
              selected={selected}
              viewport={viewport}
              blocks={blocks}
              selectedBlockId={selectedBlockId}
              theme={previewTheme}
              onThemeChange={setPreviewTheme}
              previewNonce={previewNonce}
              onRefresh={() => setPreviewNonce((n) => n + 1)}
              versionId={previewVersionId}
              onSelectBlock={(id) => {
                editor.setSelectedBlockId(id);
                setRightTab("block");
              }}
            />
          </div>
        </section>

        {/* RIGHT RAIL — Block / Page / SEO. Width is operator-chosen (3 presets,
            persisted); resolved against the measured 3-column width + clamped so
            the canvas keeps a minimum. Collapses to a thin re-expand strip
            (collapsed overrides the width preset). */}
        {rightCollapsed ? (
          <aside className="flex w-9 shrink-0 flex-col items-center border-l border-border bg-surface-raised py-2">
            <CollapseToggle
              side="right"
              collapsed
              onClick={toggleRightCollapsed}
              label={t("panel.expandRight")}
            />
          </aside>
        ) : (
        <aside
          className="flex shrink-0 flex-col border-l border-border bg-surface-raised"
          style={{ width: inspectorWidth(inspectorPreset, editorW) }}
        >
          <div className="flex items-center justify-end gap-1 border-b border-border px-2 py-1">
            <CollapseToggle
              side="right"
              collapsed={false}
              onClick={toggleRightCollapsed}
              label={t("panel.collapseRight")}
            />
            <span className="mr-auto pl-1 font-mono text-[10px] uppercase tracking-wide text-foreground-muted">
              {t("inspectorWidth.label")}
            </span>
            <div className="flex rounded-md border border-border" role="group" aria-label={t("inspectorWidth.label")}>
              {(["default", "quarter", "half"] as InspectorPreset[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPickInspectorPreset(p)}
                  aria-pressed={inspectorPreset === p}
                  title={t(`inspectorWidth.${p}`)}
                  className={`px-2 py-0.5 text-[11px] first:rounded-l-md last:rounded-r-md ${
                    inspectorPreset === p
                      ? "bg-surface-muted font-medium text-foreground"
                      : "text-foreground-muted hover:bg-surface-muted"
                  }`}
                >
                  {t(`inspectorWidth.${p}`)}
                </button>
              ))}
            </div>
          </div>
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
          {/* pb-24: scroll clearance so the panel's LAST controls can scroll
              fully above the fixed AI-assistant launcher (bottom-6 + h-14 =
              80px footprint) — otherwise it sits on top of them and steals
              their clicks. Inert on short panels (content is top-anchored). */}
          <div className="flex-1 overflow-y-auto p-4 pb-24">
            {rightTab === "block" && (
              <BlockInspector
                editor={editor}
                collections={collections}
                apiSources={apiSources}
                propsSchemas={propsSchemas}
                draftComponents={draftComponents}
                locales={contentLocales}
              />
            )}
            {rightTab === "page" &&
              (selectedPage ? (
                <div className="space-y-6">
                  <PageSettings
                    key={selectedPage.id}
                    page={selectedPage}
                    locales={contentLocales}
                    onChanged={() => void refreshPages(selectedPage.id)}
                    onDeleted={() => {
                      setSelected(null);
                      void refreshPages();
                    }}
                  />
                  <VersionHistory
                    key={`vh-${selectedPage.id}-${draftReloadNonce}`}
                    pageId={selectedPage.id}
                    viewingVersionId={previewVersionId}
                    onView={(versionId) => {
                      setPreviewVersionId(versionId);
                      setCenterTab("preview");
                    }}
                    onExitView={() => setPreviewVersionId(null)}
                    onRestore={onRestoreVersion}
                  />
                </div>
              ) : (
                <p className="text-sm text-foreground-muted">{t("pageEmpty")}</p>
              ))}
            {rightTab === "seo" &&
              (selectedPage ? (
                <SeoForm
                  key={selectedPage.id}
                  page={selectedPage}
                  locales={contentLocales}
                  onSaved={() => void refreshPages(selectedPage.id)}
                />
              ) : (
                <p className="text-sm text-foreground-muted">{t("seoEmpty")}</p>
              ))}
          </div>
        </aside>
        )}
      </div>
      {publishDialog && selected && (
        <PublishDialog
          componentNames={publishDialog}
          currentPageId={selected.id}
          onConfirm={(names) => void onConfirmPublish(names)}
          onCancel={() => setPublishDialog(null)}
        />
      )}
    </div>
  );
}
