"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { setDragPayload, readDragPayload } from "@/lib/page-builder/dnd";
import {
  sectionColumns,
  sectionGridCols,
  isSection,
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
  selectedId,
  onSelect,
  onDropComponent,
  onMoveNode,
  onDeleteColumn,
  onDeleteNode,
  onRenameSection,
}: {
  blocks: Block[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDropComponent: (sectionId: string, colIndex: number, name: string) => void;
  onMoveNode: (dragId: string, targetId: string, position: "before" | "after" | "into") => void;
  onDeleteColumn: (columnId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onRenameSection: (sectionId: string, name: string) => void;
}) {
  const t = useTranslations("pageBuilder");
  // Which Section's name is being edited inline (null = none). The input seeds
  // from the current display name and commits on Enter/blur, cancels on Esc.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  // The column-drop slot under the cursor, keyed `${sectionId}:${colIndex}`.
  const [hoverSlot, setHoverSlot] = useState<string | null>(null);
  // Reorder hover: which node + which half (before/after) the cursor is over.
  const [hoverEdge, setHoverEdge] = useState<{ id: string; pos: "before" | "after" } | null>(null);
  // Which column's delete is awaiting in-app confirm (NOT native window.confirm).
  const [confirmDeleteCol, setConfirmDeleteCol] = useState<string | null>(null);
  // Which node (Section or component leaf) is awaiting in-app delete confirm.
  const [confirmDeleteNode, setConfirmDeleteNode] = useState<string | null>(null);

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
    <ul className="space-y-2">
      {blocks.map((b, i) => (
        <li key={b.id}>
          <div className="flex items-start gap-1">
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
                className={nodeClass(b.id) + edgeClass(b.id)}
                {...reorderProps(b.id)}
              >
                {isSection(b) ? sectionName(b, i) : b.component}
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
                            <div className="flex items-start gap-1">
                              <button
                                type="button"
                                onClick={() => onSelect(c.id)}
                                className={nodeClass(c.id) + edgeClass(c.id)}
                                {...reorderProps(c.id)}
                              >
                                {c.component}
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
          )}
        </li>
      ))}
    </ul>
  );
}
