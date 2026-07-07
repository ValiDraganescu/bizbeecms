"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { setDragPayload, readDragPayload } from "@/lib/page-builder/dnd";
import {
  sectionRows,
  rowColumns,
  rowGridCols,
  isSection,
  isSectionRow,
  sectionName,
} from "@/lib/pages/page-blocks";
import type { Block } from "@/lib/render/tree";

/**
 * Trash button + in-app confirm popover for deleting a whole Section or a single
 * component leaf (NOT native window.confirm). `kind` picks the copy. Module-level
 * (not nested in LayersTree) so it's a STABLE component type — defining it inside
 * LayersTree would make React remount it (losing the open-confirm state) on every
 * keystroke during an inline section rename. See rerender-no-inline-components.
 */
function DeleteNodeControl({
  id,
  kind,
  confirmId,
  setConfirmId,
  onDelete,
}: {
  id: string;
  kind: "section" | "component";
  confirmId: string | null;
  setConfirmId: (next: string | null | ((cur: string | null) => string | null)) => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations("pageBuilder");
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setConfirmId((cur) => (cur === id ? null : id));
        }}
        title={t("deleteNode.action")}
        aria-label={t(kind === "section" ? "deleteNode.section" : "deleteNode.component")}
        className="rounded p-1 text-foreground-muted transition-colors hover:bg-surface-muted hover:text-danger"
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
      {confirmId === id && (
        <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-md border border-border bg-surface p-2 shadow-md">
          <p className="mb-1.5 text-xs text-foreground">
            {t(kind === "section" ? "deleteNode.confirmSection" : "deleteNode.confirmComponent")}
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(id);
                setConfirmId(null);
              }}
              className="rounded bg-danger px-2 py-1 text-[11px] font-medium text-danger-foreground"
            >
              {t("deleteNode.action")}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmId(null);
              }}
              className="rounded border border-border px-2 py-1 text-[11px] text-foreground hover:bg-surface-muted"
            >
              {t("deleteNode.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Center Layers tree: the selected page's Sections and, nested under each, the
 * component blocks dropped into it. Selecting a node sets the builder's selected
 * block (which a rail click then inserts into, and the right rail reads). This
 * renders the SAME `Block[]` shape the C3 block REST persists. ponytail: two
 * fixed levels (section → component) — matches the section model; deeper nesting
 * isn't a thing the editor exposes yet.
 */
export function LayersTree({
  blocks,
  draftComponents,
  selectedId,
  onSelect,
  onDropComponent,
  onDropList,
  onDropForm,
  onMoveNode,
  onDeleteColumn,
  onDeleteNode,
  onRenameSection,
  onAddRow,
  onDeleteRow,
  onSetRowColumns,
}: {
  blocks: Block[];
  /** Component names with an unpublished draft — their blocks get a badge. */
  draftComponents?: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDropComponent: (sectionId: string, colIndex: number, name: string, rowId: string) => void;
  onDropList: (sectionId: string, colIndex: number, rowId: string) => void;
  onDropForm: (sectionId: string, colIndex: number, rowId: string) => void;
  onMoveNode: (dragId: string, targetId: string, position: "before" | "after" | "into") => void;
  onDeleteColumn: (columnId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onRenameSection: (sectionId: string, name: string) => void;
  onAddRow: (sectionId: string) => void;
  onDeleteRow: (rowId: string) => void;
  onSetRowColumns: (sectionId: string, n: number, rowId: string) => void;
}) {
  const t = useTranslations("pageBuilder");
  // Which Section's name is being edited inline (null = none). The input seeds
  // from the current display name and commits on Enter/blur, cancels on Esc.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  // The column-drop slot under the cursor, keyed `${sectionId}:${colIndex}`.
  const [hoverSlot, setHoverSlot] = useState<string | null>(null);
  // Reorder hover: which node + which half (before/after) the cursor is over.
  const [hoverEdge, setHoverEdge] = useState<{ id: string; pos: "before" | "after" } | null>(null);
  // Id of the node currently being dragged (null = none). Set on dragstart so a
  // column drop zone can tell a SECTION drag (which must NOT nest into a column)
  // from a component drag — the payload is unreadable during dragover.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Is the in-flight drag a top-level Section? Then column slots must ignore it.
  const draggingSection =
    draggingId != null && blocks.some((b) => b.id === draggingId && isSection(b));
  // Is the in-flight drag a ROW? (rows live one level under a section). Only row
  // drop zones react to it.
  const draggingRow =
    draggingId != null &&
    blocks.some((s) => (s.children ?? []).some((r) => r.id === draggingId && isSectionRow(r)));
  // Collapsed Sections (ids). Purely a Layers-tree VIEW state — never persisted
  // (collapse is per-operator UI noise, not page content). Default expanded.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  function toggleCollapsed(id: string) {
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  // Which column's delete is awaiting in-app confirm (NOT native window.confirm).
  const [confirmDeleteCol, setConfirmDeleteCol] = useState<string | null>(null);
  // Which node (Section or component leaf) is awaiting in-app delete confirm.
  const [confirmDeleteNode, setConfirmDeleteNode] = useState<string | null>(null);

  // "draft" chip on a component leaf whose component has an unpublished draft
  // (the preview shows the draft; the public site won't until it's published).
  function draftBadge(component: string | undefined): React.ReactNode {
    if (!component || !draftComponents?.has(component)) return null;
    return (
      <span className="ml-1.5 rounded border border-warning bg-warning-subtle px-1 py-px align-middle text-[10px] font-medium uppercase tracking-wide text-foreground">
        {t("draftBadge")}
      </span>
    );
  }

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
        setDraggingId(id);
        e.stopPropagation();
      },
      onDragEnd: () => setDraggingId(null),
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

  // A SECTION row's whole `<li>` (title + body) is a reorder drop target, but
  // ONLY while a section is being dragged — otherwise it would swallow component
  // drops meant for the columns inside it. The thin title button alone was too
  // small to hit reliably (dropping on the body nested the section into a column
  // and it fell to the bottom); covering the full row fixes that.
  function sectionRowProps(id: string) {
    if (!draggingSection) return {};
    return {
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

  // A grip button that is the drag SOURCE for `id` (section or row). Carries the
  // draggable + dragstart/end so the rest of the node stays a normal click target.
  function DragHandle({ id, title }: { id: string; title: string }) {
    return (
      <button
        type="button"
        title={title}
        aria-label={title}
        draggable
        onDragStart={(e) => {
          setDragPayload(e, { kind: "move", id });
          setDraggingId(id);
          e.stopPropagation();
        }}
        onDragEnd={() => setDraggingId(null)}
        className="cursor-grab rounded p-1 text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground active:cursor-grabbing"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
          <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
        </svg>
      </button>
    );
  }

  // Drop-zone props for reordering a ROW before/after a sibling row (same section).
  // Mirrors reorderProps but scoped so it only engages while a row is dragging.
  function rowDropProps(rowId: string) {
    if (!draggingRow) return {};
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const pos = edgeOf(e);
        setHoverEdge((h) => (h?.id === rowId && h.pos === pos ? h : { id: rowId, pos }));
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setHoverEdge((h) => (h?.id === rowId ? null : h));
        }
      },
      onDrop: (e: React.DragEvent) => {
        const pos = edgeOf(e);
        setHoverEdge(null);
        const payload = readDragPayload(e);
        if (payload?.kind !== "move") return;
        e.preventDefault();
        e.stopPropagation();
        onMoveNode(payload.id, rowId, pos);
      },
    };
  }

  return (
    <ul className="space-y-2">
      {blocks.map((b, i) => (
        <li
          key={b.id}
          className={isSection(b) ? "rounded-md" + edgeClass(b.id) : undefined}
          {...(isSection(b) ? sectionRowProps(b.id) : {})}
        >
          <div className="flex items-start gap-1">
            {isSection(b) && renamingId !== b.id && (
              <span className="mt-1">
                <DragHandle id={b.id} title={t("dragSection")} />
              </span>
            )}
            {isSection(b) && renamingId !== b.id && (
              // Collapse/expand the section's columns in the tree (view-only).
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCollapsed(b.id);
                }}
                aria-expanded={!collapsed.has(b.id)}
                aria-label={t(collapsed.has(b.id) ? "section.expand" : "section.collapse")}
                title={t(collapsed.has(b.id) ? "section.expand" : "section.collapse")}
                className="mt-1.5 rounded p-1 text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground"
              >
                <svg
                  viewBox="0 0 24 24"
                  className={
                    "h-3.5 w-3.5 transition-transform " +
                    (collapsed.has(b.id) ? "-rotate-90" : "")
                  }
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            )}
            {isSection(b) && renamingId === b.id ? (
              // Inline rename: commit on Enter/blur, cancel on Esc. Blank resets
              // to the "Section N" default (handled by renameSection).
              <input
                autoFocus
                defaultValue={sectionName(b, i)}
                aria-label={t("renameSection.label")}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onRenameSection(b.id, (e.target as HTMLInputElement).value);
                    setRenamingId(null);
                  } else if (e.key === "Escape") {
                    setRenamingId(null);
                  }
                }}
                onBlur={(e) => {
                  onRenameSection(b.id, e.target.value);
                  setRenamingId(null);
                }}
                className="w-full rounded-md border border-primary bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            ) : (
              <button
                type="button"
                onClick={() => onSelect(b.id)}
                onDoubleClick={() => isSection(b) && setRenamingId(b.id)}
                // Section rows show the reorder edge on the whole `<li>` (see
                // sectionRowProps); the button keeps it only for component leaves.
                className={nodeClass(b.id) + (isSection(b) ? "" : edgeClass(b.id))}
                {...reorderProps(b.id)}
              >
                {isSection(b) ? sectionName(b, i) : b.component}
                {!isSection(b) && draftBadge(b.component)}
              </button>
            )}
            {isSection(b) && renamingId !== b.id && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setRenamingId(b.id);
                }}
                title={t("renameSection.action")}
                aria-label={t("renameSection.action")}
                className="rounded p-1 text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            )}
            <DeleteNodeControl
              id={b.id}
              kind={isSection(b) ? "section" : "component"}
              confirmId={confirmDeleteNode}
              setConfirmId={setConfirmDeleteNode}
              onDelete={onDeleteNode}
            />
          </div>
          {isSection(b) && !collapsed.has(b.id) && (
            <div className="mt-2 flex flex-col gap-2 border-l border-border pl-4">
              {sectionRows(b).map((row, ri) => {
                // A grandfathered (row-less) section acts as its own single row —
                // then `rowId` is the SECTION id (resolveRowHolder handles it).
                const rowId = isSectionRow(row) ? row.id : b.id;
                const explicitRows = b.children?.some(isSectionRow) ?? false;
                const cols = rowColumns(row);
                return (
                  <div key={rowId} className="flex flex-col gap-1">
                    <div
                      className={"flex items-center gap-1 rounded" + (explicitRows ? edgeClass(rowId) : "")}
                      {...(explicitRows ? rowDropProps(rowId) : {})}
                    >
                      {/* Drag handle — only explicit rows can reorder (a lone
                          grandfathered row has nowhere to move). */}
                      {explicitRows && <DragHandle id={rowId} title={t("dragRow")} />}
                      {/* Row label = select button → opens the Row settings panel.
                          A grandfathered row IS the section, already selectable via
                          the section header, so it stays a plain label. */}
                      {explicitRows ? (
                        <button
                          type="button"
                          onClick={() => onSelect(rowId)}
                          aria-pressed={selectedId === rowId}
                          className={
                            "rounded px-1 font-mono text-[10px] uppercase tracking-wide transition-colors " +
                            (selectedId === rowId
                              ? "text-primary"
                              : "text-foreground-muted hover:text-foreground")
                          }
                        >
                          {t("row")} {ri + 1}
                        </button>
                      ) : (
                        <span className="px-1 font-mono text-[10px] uppercase tracking-wide text-foreground-muted">
                          {t("row")} {ri + 1}
                        </span>
                      )}
                      {/* Per-row column count */}
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => onSetRowColumns(b.id, n, rowId)}
                            aria-pressed={cols.length === n}
                            className={
                              "h-5 w-5 rounded border text-[11px] transition-colors " +
                              (cols.length === n
                                ? "border-primary bg-primary-subtle text-foreground"
                                : "border-border text-foreground-muted hover:text-foreground")
                            }
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                      {explicitRows && (
                        <button
                          type="button"
                          onClick={() => onDeleteRow(rowId)}
                          title={t("deleteRow.action")}
                          aria-label={t("deleteRow.action")}
                          className="ml-auto rounded p-0.5 text-foreground-muted transition-colors hover:text-danger"
                        >
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 6h18M8 6V4h8v2m-9 0v14a2 2 0 002 2h6a2 2 0 002-2V6" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <ul
                      className="grid gap-2"
                      style={{ gridTemplateColumns: rowGridCols(row) }}
                    >
                      {cols.map((col, ci) => {
                        const slotKey = `${rowId}:${ci}`;
                        const active = hoverSlot === slotKey;
                        return (
                          <li
                            key={col.id}
                            // Each COLUMN is its own drop target. A SECTION drag is
                            // not a valid column drop — ignore so it bubbles to the
                            // section reorder zone instead of nesting/vanishing.
                            onDragOver={(e) => {
                              if (draggingSection) return;
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
                              if (draggingSection) return;
                              setHoverSlot(null);
                              const payload = readDragPayload(e);
                              e.stopPropagation();
                              if (payload?.kind === "component") {
                                e.preventDefault();
                                onDropComponent(b.id, ci, payload.name, rowId);
                              } else if (payload?.kind === "list") {
                                e.preventDefault();
                                onDropList(b.id, ci, rowId);
                              } else if (payload?.kind === "form") {
                                e.preventDefault();
                                onDropForm(b.id, ci, rowId);
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
                              {cols.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteCol(col.id)}
                                  title={t("deleteColumn.action")}
                                  aria-label={t("deleteColumn.action")}
                                  className="rounded p-0.5 text-foreground-muted transition-colors hover:text-foreground"
                                >
                                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
                                    <div className="flex items-start gap-1">
                                      <button
                                        type="button"
                                        onClick={() => onSelect(c.id)}
                                        className={nodeClass(c.id) + edgeClass(c.id)}
                                        {...reorderProps(c.id)}
                                      >
                                        {c.component}
                                        {draftBadge(c.component)}
                                      </button>
                                      <DeleteNodeControl
                                        id={c.id}
                                        kind="component"
                                        confirmId={confirmDeleteNode}
                                        setConfirmId={setConfirmDeleteNode}
                                        onDelete={onDeleteNode}
                                      />
                                    </div>
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
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => onAddRow(b.id)}
                className="self-start rounded-md border border-dashed border-border px-2 py-1 text-xs text-foreground-muted transition-colors hover:border-primary hover:text-foreground"
              >
                + {t("addRow")}
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
