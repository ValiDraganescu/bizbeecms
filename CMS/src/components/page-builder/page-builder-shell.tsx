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

import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  addSection,
  addComponentToColumn,
  addRow,
  deleteRow,
  setSectionColumns,
  isSection,
  isSectionColumn,
  isSectionRow,
  mergeSectionProps,
  deleteColumn,
  removeNode,
  targetSectionId,
  moveNode,
  findBlock,
  mergeBlockProps,
  setBlockField,
  setBlockChildren,
  isList,
  addListToSection,
  addListBlock,
  isForm,
  addFormBlock,
  listSections,
  sectionName,
  renameSection,
  parsePropsSchema,
} from "@/lib/pages/page-blocks";
import type { Block, FormTarget } from "@/lib/render/tree";
import { declaredPropNames } from "@/lib/content/binding";
import type {
  Viewport,
  CenterTab,
  RightTab,
  CollectionMeta,
  ApiRequestMeta,
  ApiSourceMeta,
} from "@/lib/page-builder/types";
import { readDragPayload } from "@/lib/page-builder/dnd";
import { wirePreviewOverlay, markSelectedInPreview } from "@/lib/page-builder/preview-overlay";
import { ViewportIcon, PreviewThemeIcon, CollapseToggle, ICON } from "./shared";
import { ComponentsRail } from "./components-rail";
import { PagePicker } from "./page-picker";
import { LayersTree } from "./layers-tree";
import { SeoForm } from "./seo-form";
import { ColumnSettings } from "./column-settings";
import { SectionSettings } from "./section-settings";
import { RowSettings } from "./row-settings";
import { ComponentSettings } from "./component-settings";
import { BindingPanel, ListSettings, FormSettings } from "./binding-panels";
import { PageSettings } from "./page-settings";
import { VersionHistory } from "./version-history";

// Preview frame widths per viewport (desktop = full width). See layout doc.
const VIEWPORT_WIDTH: Record<Viewport, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "375px",
};

/**
 * Build the preview-iframe URL: `/preview/<id>` with optional `?theme=` (forced
 * color mode) and `?version=` (Versioning slice 4 — render a past version
 * read-only). "system" theme sends no theme param (inherits OS).
 */
function previewSrc(
  id: string,
  theme: "system" | "light" | "dark",
  versionId: string | null,
): string {
  const params = new URLSearchParams();
  if (theme !== "system") params.set("theme", theme);
  if (versionId) params.set("version", versionId);
  const qs = params.toString();
  return qs ? `/preview/${id}?${qs}` : `/preview/${id}`;
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

  // page-builder-ux: resizable right-side inspector. The operator picks one of 3
  // preset widths (default/¼/½); we measure the 3-column area and resolve the
  // preset → clamped px (canvas keeps a minimum). Persisted in localStorage.
  const [inspectorPreset, setInspectorPreset] = useState<InspectorPreset>("default");
  const [editorW, setEditorW] = useState(0);
  const columnsRef = useRef<HTMLDivElement>(null);
  // Preview iframe (same-origin) — the selection overlay reaches into its DOM to
  // outline blocks + report click-to-select. Bumped on every (re)load so the
  // wiring effect re-attaches to the fresh document.
  const previewRef = useRef<HTMLIFrameElement>(null);
  const [previewLoaded, setPreviewLoaded] = useState(0);
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
  // key off `selected`; later slices load that page's blocks / settings.
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
  // Phase-2 binding (Slice C): the Site's collections (registry views) for the
  // "Bind to collection" + List query panels. tableName is the stable handle.
  const [collections, setCollections] = useState<CollectionMeta[]>([]);
  // external-data-sources Slice 5: API data sources (+ saved requests) for the
  // combined source picker in the binding panels. Graceful: 403/offline → [].
  const [apiSources, setApiSources] = useState<ApiSourceMeta[]>([]);

  // The selected page's block tree (sections + their dropped components) and the
  // currently-selected node id (drives which section a rail click drops into and,
  // later, the right rail). Loaded from / persisted to the C3 block REST.
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // Versioning slice 3: the draft auto-save status badge (saving…/saved/published).
  const [draftStatus, setDraftStatus] = useState<DraftStatus>("saved");
  const [publishing, setPublishing] = useState(false);
  // Versioning slice 4: bumped to re-run the draft load effect (e.g. after a
  // restore replaces the draft with a copy of a past version).
  const [draftReloadNonce, setDraftReloadNonce] = useState(0);
  // Versioning slice 4: when set, the preview iframe renders this specific past
  // version READ-ONLY (?version=) instead of the live draft. Cleared to go back.
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
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
      // Versioning slice 3: load the DRAFT (create-if-absent), not page.blocks.
      const res = await fetch(`/api/pages/${selected.id}/draft`);
      if (!live) return;
      if (res.ok) {
        const body = (await res.json()) as { blocks?: Block[] };
        setBlocks(body.blocks ?? []);
      } else {
        setBlocks([]);
      }
      setSelectedBlockId(null);
      setDirty(false);
      setDraftStatus((s) => nextDraftStatus(s, "loaded"));
    })();
    return () => {
      live = false;
    };
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
          }
        : null,
    );
    return () => setActivePageContext(null);
  }, [selected, blocks]);

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
    }
    window.addEventListener(PAGE_MUTATION_EVENT, onMutated);
    return () => window.removeEventListener(PAGE_MUTATION_EVENT, onMutated);
  }, [dirty]);

  // Names for the Preview hover label: section id → its display name, component
  // leaf id → its component name. Only the blocks the overlay OUTLINES need an
  // entry (sections + component leaves; rows/columns aren't outlined). Rebuilt
  // when the tree changes.
  const previewLabels = useMemo(() => {
    const map = new Map<string, string>();
    listSections(blocks).forEach((s, i) => map.set(s.id, sectionName(s.block, i)));
    const walk = (list: typeof blocks) => {
      for (const b of list) {
        // A component leaf (not a Section/row/column/List primitive) is outlined
        // as `data-block-wrap` → label it by its component name.
        if (!isSection(b) && !isSectionColumn(b) && b.component) {
          if (b.component !== "__section_row__") map.set(b.id, b.component);
        }
        if (b.children) walk(b.children);
      }
    };
    walk(blocks);
    return map;
  }, [blocks]);

  // Click-to-select inside the Preview iframe: wire the overlay on each iframe
  // load; a click reports a block id → select it AND show its Block details
  // (same as a Layers click). Re-runs when the iframe reloads (previewLoaded).
  useEffect(() => {
    if (centerTab !== "preview") return;
    return wirePreviewOverlay(
      previewRef.current,
      (id) => {
        setSelectedBlockId(id);
        setRightTab("block");
      },
      (id) => previewLabels.get(id) ?? null,
    );
  }, [previewLoaded, centerTab, previewLabels]);

  // Keep the iframe's selected outline in sync with the editor selection (from a
  // Preview click OR a Layers click), and after each (re)load.
  useEffect(() => {
    if (centerTab !== "preview") return;
    markSelectedInPreview(previewRef.current, selectedBlockId);
  }, [selectedBlockId, previewLoaded, centerTab]);

  function onAddSection() {
    setBlocks((b) => addSection(b));
    setDirty(true);
  }

  // Drop a rail component into a specific ROW's COLUMN. No-op if the target isn't a
  // valid section/row/column (the pure helper guards range).
  function onDropComponentToColumn(
    sectionId: string,
    colIndex: number,
    component: string,
    rowId: string,
  ) {
    setBlocks((b) => addComponentToColumn(b, sectionId, colIndex, component, rowId));
    setDirty(true);
  }

  // Drop the built-in `List` primitive into a specific Section column (DnD).
  function onDropListToColumn(sectionId: string, colIndex: number, rowId: string) {
    setBlocks((b) => addListBlock(b, sectionId, colIndex, rowId));
    setDirty(true);
  }

  // Drop the built-in `Form` primitive into a specific Section column (DnD).
  function onDropFormToColumn(sectionId: string, colIndex: number, rowId: string) {
    setBlocks((b) => addFormBlock(b, sectionId, colIndex, rowId));
    setDirty(true);
  }

  // Add a row to a Section (migrates a grandfathered section to explicit rows).
  function onAddRow(sectionId: string) {
    setBlocks((b) => addRow(b, sectionId));
    setDirty(true);
  }

  // Delete a row (and its columns/components); keeps ≥1 row per section.
  function onDeleteRow(rowId: string) {
    setBlocks((b) => deleteRow(b, rowId));
    if (selectedBlockId === rowId) setSelectedBlockId(null);
    setDirty(true);
  }

  // Set a specific row's column count (grandfather-safe via rowId).
  function onSetRowColumns(sectionId: string, n: number, rowId: string) {
    setBlocks((b) => setSectionColumns(b, sectionId, n, rowId));
    setDirty(true);
  }

  // Move a Layers node (DnD slice 3): reorder Sections, reorder within a column,
  // or move a component across columns/sections. The pure helper guards no-ops.
  function onMoveNode(dragId: string, targetId: string, position: "before" | "after" | "into") {
    setBlocks((b) => moveNode(b, dragId, targetId, position));
    setDirty(true);
  }

  // Rename a Section (writes props.name; blank resets to the "Section N" default).
  // Drives the Layers label, the @section autocomplete, and the assistant context.
  function onRenameSection(sectionId: string, name: string) {
    setBlocks((b) => renameSection(b, sectionId, name));
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

  // Slice C: set a block's NON-prop binding fields (single-item `bindings`, or a
  // List's `listSource`/`listMap`/`listRole`). An undefined value deletes the key.
  function onUpdateBlockField(
    blockId: string,
    patch: Partial<Pick<Block, "bindings" | "listSource" | "listMap" | "listRole" | "formTarget">>,
  ) {
    setBlocks((b) => setBlockField(b, blockId, patch));
    setDirty(true);
  }

  // Slice C: insert a built-in `List` block into the selected (or last) Section.
  // Returns false when there's no Section yet (caller prompts to add one).
  function onInsertList(): boolean {
    const target = targetSectionId(blocks, selectedBlockId);
    if (!target) return false;
    setBlocks((b) => addListToSection(b, target));
    setDirty(true);
    return true;
  }

  // Slice C: apply a List settings patch — `listSource`/`listMap` go through
  // setBlockField; the optional `__child` (template/empty children) through
  // setBlockChildren. One handler so a template change + map reset land together.
  function onUpdateList(
    blockId: string,
    patch: Partial<Pick<Block, "listSource" | "listMap">> & { __child?: Block[] },
  ) {
    const { __child, ...fields } = patch;
    setBlocks((b) => {
      let next = setBlockField(b, blockId, fields);
      if (__child) next = setBlockChildren(next, blockId, __child);
      return next;
    });
    setDirty(true);
  }

  // Form slice (b): apply a Form settings patch — `formTarget` through
  // setBlockField (undefined deletes → untargeted container); the optional
  // `__child` (content component) through setBlockChildren, like onUpdateList.
  function onUpdateForm(
    blockId: string,
    patch: { formTarget?: FormTarget; __child?: Block[] },
  ) {
    const { __child, ...fields } = patch;
    setBlocks((b) => {
      let next = "formTarget" in fields ? setBlockField(b, blockId, fields) : b;
      if (__child) next = setBlockChildren(next, blockId, __child);
      return next;
    });
    setDirty(true);
  }

  // Patch-merge one block's own props (column visibility/spacing, List/Form
  // spacing). Reads the live block, applies the patch (undefined/false deletes
  // a key), and writes the full props back via the tree-walking mergeBlockProps.
  function onPatchBlockProps(blockId: string, patch: Record<string, unknown>) {
    setBlocks((b) => {
      const col = findBlock(b, blockId);
      const next: Record<string, unknown> = { ...(col?.props ?? {}) };
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === false) delete next[k];
        else next[k] = v;
      }
      return mergeBlockProps(b, blockId, next);
    });
    setDirty(true);
  }

  // Patch-merge a ROW's own props (behavior, gap, align, background, padding).
  // Only `undefined` deletes a key (a row's `false`/0 values are legitimate).
  function onUpdateRowProps(rowId: string, patch: Record<string, unknown>) {
    setBlocks((b) => {
      const row = findBlock(b, rowId);
      const next: Record<string, unknown> = { ...(row?.props ?? {}) };
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete next[k];
        else next[k] = v;
      }
      return mergeBlockProps(b, rowId, next);
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

  // Delete a whole Section (with its columns + components) or a single component
  // leaf via the pure, nested-safe removeNode. Clears selection if the removed
  // node was the selected one.
  function onDeleteNode(nodeId: string) {
    setBlocks((b) => removeNode(b, nodeId));
    setSelectedBlockId((cur) => (cur === nodeId ? null : cur));
    setDirty(true);
  }

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
        setDirty(false);
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
  async function onPublish() {
    if (!selected) return;
    setPublishing(true);
    try {
      if (dirty && !(await saveDraft())) return; // save failed → don't publish stale
      const res = await fetch(`/api/pages/${selected.id}/publish`, { method: "POST" });
      if (res.ok) {
        setDraftStatus((s) => nextDraftStatus(s, "publishDone"));
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

  // Reflect a pending edit in the status badge ("Unsaved changes") the moment a
  // block edit marks the page dirty (the debounce below then auto-saves it).
  useEffect(() => {
    if (dirty) setDraftStatus((s) => nextDraftStatus(s, "edit"));
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

        {/* Right: draft status + save + publish */}
        <div className="flex items-center gap-2">
          {selected && draftStatusKey(draftStatus) && (
            <span
              className="text-xs text-foreground-muted"
              aria-live="polite"
            >
              {t(`draftStatus.${draftStatusKey(draftStatus)}`)}
            </span>
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
                // The LAYOUT primitives drop onto the Layers panel: a Section
                // appends a new section; a List adds into the selected/last one.
                if (payload?.kind === "section") {
                  e.preventDefault();
                  onAddSection();
                } else if (payload?.kind === "list") {
                  e.preventDefault();
                  onInsertList();
                }
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
                  onDropList={onDropListToColumn}
                  onDropForm={onDropFormToColumn}
                  onMoveNode={onMoveNode}
                  onDeleteColumn={onDeleteColumn}
                  onDeleteNode={onDeleteNode}
                  onRenameSection={onRenameSection}
                  onAddRow={onAddRow}
                  onDeleteRow={onDeleteRow}
                  onSetRowColumns={onSetRowColumns}
                />
              )}
              {/* Drop indicator: a blue line where the new Section appends. */}
              {selected && layersDropActive && (
                <div className="mt-3 flex items-center gap-2">
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
                      ref={previewRef}
                      onLoad={() => setPreviewLoaded((n) => n + 1)}
                      key={`${selected.id}-${previewNonce}-${previewTheme}-${previewVersionId ?? ""}`}
                      src={previewSrc(selected.id, previewTheme, previewVersionId)}
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
                      onChange={(patch) => onPatchBlockProps(sel.id, patch)}
                    />
                  );
                }
                // A built-in List block: query + per-row template mapping panel.
                if (sel && isList(sel)) {
                  return (
                    <ListSettings
                      key={sel.id}
                      block={sel}
                      collections={collections}
                      apiSources={apiSources}
                      propsSchemas={propsSchemas}
                      onChange={(patch) => onUpdateList(sel.id, patch)}
                      onProps={(patch) => onPatchBlockProps(sel.id, patch)}
                    />
                  );
                }
                // A built-in Form block: target + messages/redirect + content panel.
                if (sel && isForm(sel)) {
                  return (
                    <FormSettings
                      key={sel.id}
                      block={sel}
                      collections={collections}
                      apiSources={apiSources}
                      propsSchemas={propsSchemas}
                      onChange={(patch) => onUpdateForm(sel.id, patch)}
                      onProps={(patch) => onPatchBlockProps(sel.id, patch)}
                    />
                  );
                }
                // A ROW shell: its own settings (behavior, gap, align, background,
                // padding). Column COUNT stays inline on the row in the Layers tree.
                if (sel && isSectionRow(sel)) {
                  return (
                    <RowSettings
                      key={sel.id}
                      row={sel}
                      onChange={(patch) => onUpdateRowProps(sel.id, patch)}
                    />
                  );
                }
                // A component block (not a Section, row, or column shell): show its
                // schema-driven settings form + the single-item binding panel.
                if (sel && !isSectionColumn(sel)) {
                  return (
                    <div className="space-y-6">
                      <ComponentSettings
                        key={sel.id}
                        block={sel}
                        schema={parsePropsSchema(propsSchemas[sel.component])}
                        locales={contentLocales}
                        onChange={(props) => onUpdateComponentProps(sel.id, props)}
                      />
                      <BindingPanel
                        key={`bind-${sel.id}`}
                        block={sel}
                        collections={collections}
                        apiSources={apiSources}
                        declared={[...declaredPropNames(propsSchemas[sel.component])]}
                        onChange={(bindings) => onUpdateBlockField(sel.id, { bindings })}
                      />
                    </div>
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
                  <div className="space-y-6">
                    <PageSettings
                      key={page.id}
                      page={page}
                      onChanged={() => void refreshPages(page.id)}
                      onDeleted={() => {
                        setSelected(null);
                        void refreshPages();
                      }}
                    />
                    <VersionHistory
                      key={`vh-${page.id}-${draftReloadNonce}`}
                      pageId={page.id}
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
        )}
      </div>
    </div>
  );
}

