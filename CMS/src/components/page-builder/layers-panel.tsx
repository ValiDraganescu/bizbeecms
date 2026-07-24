"use client";

/**
 * The page builder's center LAYERS pane, extracted from page-builder-shell.tsx:
 * the drop zone for the LAYOUT rail primitives (Section appends, List adds into
 * the selected/last section), the no-page / empty-page states, the LayersTree
 * itself and the append-here drop indicator. Owns the drop-hover flag; every
 * tree mutation goes straight to the `BlockEditor` handlers. Stays MOUNTED
 * while hidden (the `hidden` class), mirroring the preview pane.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { PageOption } from "@/lib/pages/page-picker";
import { readDragPayload } from "@/lib/page-builder/dnd";
import { LayersTree } from "./layers-tree";
import type { BlockEditor } from "./use-block-editor";

export function LayersPanel({
  hidden,
  selected,
  draftComponents,
  editor,
}: {
  /** True while the Preview tab is active — panel stays mounted, display:none. */
  hidden: boolean;
  selected: PageOption | null;
  /** Components with an unpublished DRAFT — drives the Layers "draft" badges. */
  draftComponents: Set<string>;
  editor: BlockEditor;
}) {
  const t = useTranslations("pageBuilder");
  // True while a draggable rail item hovers the drop zone (blue indicator).
  const [dropActive, setDropActive] = useState(false);
  const { blocks } = editor;

  return (
    <div
      onDragOver={(e) => {
        if (!selected) return;
        // Must preventDefault to allow a drop; show the indicator.
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        if (!dropActive) setDropActive(true);
      }}
      onDragLeave={(e) => {
        // Only clear when truly leaving the panel (not entering a child).
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setDropActive(false);
        }
      }}
      onDrop={(e) => {
        setDropActive(false);
        if (!selected) return;
        const payload = readDragPayload(e);
        // The LAYOUT primitives drop onto the Layers panel: a Section
        // appends a new section; a List adds into the selected/last one.
        if (payload?.kind === "section") {
          e.preventDefault();
          editor.onAddSection();
        } else if (payload?.kind === "list") {
          e.preventDefault();
          editor.onInsertList();
        }
      }}
      className={"absolute inset-0 overflow-y-auto p-6 " + (hidden ? "hidden" : "")}
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
          draftComponents={draftComponents}
          pageId={selected.id}
          selectedId={editor.selectedBlockId}
          onSelect={editor.setSelectedBlockId}
          onDropComponent={editor.onDropComponentToColumn}
          onDropList={editor.onDropListToColumn}
          onDropForm={editor.onDropFormToColumn}
          onDropGuestChat={editor.onDropGuestChatToColumn}
          onMoveNode={editor.onMoveNode}
          onDeleteColumn={editor.onDeleteColumn}
          onDeleteNode={editor.onDeleteNode}
          onRenameSection={editor.onRenameSection}
          onAddRow={editor.onAddRow}
          onDeleteRow={editor.onDeleteRow}
          onSetRowColumns={editor.onSetRowColumns}
        />
      )}
      {/* Drop indicator: a blue line where the new Section appends. */}
      {selected && dropActive && (
        <div className="mt-3 flex items-center gap-2">
          <span className="h-0.5 flex-1 rounded bg-primary" />
          <span className="text-xs font-medium text-primary">{t("dropSectionHint")}</span>
          <span className="h-0.5 flex-1 rounded bg-primary" />
        </div>
      )}
    </div>
  );
}
