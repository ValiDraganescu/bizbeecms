"use client";

/**
 * The page builder's block-tree EDITING CONTROLLER, extracted from
 * page-builder-shell.tsx: owns the draft block tree, the selected node id and
 * the dirty flag, and exposes one handler per tree operation. Every handler is
 * the same shape — a FUNCTIONAL `setBlocks` through the pure helpers in
 * `lib/pages/page-blocks` (so concurrent updates compose), then `setDirty(true)`
 * so the shell's debounced auto-save persists it.
 *
 * PERSISTENCE stays in the shell (draft load/save/publish know about the
 * selected page and the REST routes); this hook is purely the in-memory tree.
 */

import { useState } from "react";
import {
  addSection,
  addComponentToColumn,
  addRow,
  deleteRow,
  setSectionColumns,
  mergeSectionProps,
  deleteColumn,
  removeNode,
  targetSectionId,
  moveNode,
  findBlock,
  mergeBlockProps,
  setBlockField,
  setBlockChildren,
  addListToSection,
  addListBlock,
  addFormBlock,
  addGuestChatBlock,
  renameSection,
} from "@/lib/pages/page-blocks";
import { applyBlockTranslations } from "@/lib/pages/page-translate-missing";
import type { TranslationSlots } from "@/lib/content/bulk-translate-run";
import type { Block, FormTarget } from "@/lib/render/tree";

export type BlockEditor = ReturnType<typeof useBlockEditor>;

export function useBlockEditor(
  /** name → raw propsSchema JSON (needed to vet bulk-translate slot merges). */
  propsSchemas: Record<string, string | null>,
  /** Site content locales, default (source) first. */
  contentLocales: string[],
) {
  // The selected page's block tree (sections + their dropped components) and the
  // currently-selected node id (drives which section a rail click drops into and
  // the right rail). Loaded from / persisted to the C3 block REST by the shell.
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

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

  // Drop the built-in `GuestChat` leaf into a specific Section column (DnD).
  function onDropGuestChatToColumn(sectionId: string, colIndex: number, rowId: string) {
    setBlocks((b) => addGuestChatBlock(b, sectionId, colIndex, rowId));
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

  // bulk-translate-missing (AC C7): merge one call's vetted block slots into
  // the LATEST draft (functional update, so concurrent edits are never
  // clobbered), then let the normal dirty→autosave path persist them — exactly
  // like a per-field translate's onChange.
  function onApplyTranslations(slots: TranslationSlots) {
    setBlocks((b) =>
      applyBlockTranslations(b, slots, propsSchemas, {
        default: contentLocales[0] ?? "",
        locales: contentLocales,
      }),
    );
    setDirty(true);
  }

  return {
    blocks,
    setBlocks,
    selectedBlockId,
    setSelectedBlockId,
    dirty,
    setDirty,
    onAddSection,
    onDropComponentToColumn,
    onDropListToColumn,
    onDropFormToColumn,
    onDropGuestChatToColumn,
    onAddRow,
    onDeleteRow,
    onSetRowColumns,
    onMoveNode,
    onRenameSection,
    onUpdateSection,
    onUpdateComponentProps,
    onUpdateBlockField,
    onInsertList,
    onUpdateList,
    onUpdateForm,
    onPatchBlockProps,
    onUpdateRowProps,
    onDeleteColumn,
    onDeleteNode,
    onApplyTranslations,
  };
}
