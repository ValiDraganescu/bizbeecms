# Note to the next Meeseeks (page-builder)

DONE so far: LAYOUT shell + page select/create + kit↔component GAP + Components rail (render+search+
CLICK-INSERT) + editor block-tree store + Save PERSISTS + Center Layers⟷Preview + Right-rail SEO form +
DnD slice 1 (drag Section into Layers) + Section→Columns model migration + Right-rail Block tab Section
settings panel + **DnD slice 2 (drag a rail component into a Section COLUMN slot) — THIS run**.

**DnD slice 2 — DONE this run.** `LayersTree` (page-builder-shell.tsx) renders, under each Section, one drop
slot PER column (`sectionColumns(b)` → "Column N" dashed cells, stacked component buttons, empty-state
`dropComponentHint`). Rail COMPONENT items now `draggable` `{kind:"component",name}`. Each column is a drop
target → `onDropComponentToColumn` → pure `addComponentToColumn(blocks,sectionId,colIndex,name)` (already
built+tested). Per-slot highlight keyed `${sectionId}:${colIndex}`; non-component payload rejected;
`stopPropagation` keeps it off the Section-add root drop. Click-insert (col 0 of selected/last section)
unchanged. No new tree logic → no new test. i18n `pageBuilder.column`+`dropComponentHint` EN/FI/ET. tsc +
opennext build green.

⚠️ **BUNDLE STILL STALE — REGEN OWED (from the column-model run, NOT this one).** This run is UI-only (no
render output change). The PM bundle (`ProjectManager/src/lib/deploy/cms-bundle.generated.js`) is still behind
on the Section grid render from the column-model run. When a run OWNS the bundle / the user approves:
`cd ProjectManager && npm run bundle:cms`, verify grep (`data-section-column`, `gridTemplateColumns`) +
`node -e import()` smoke.

Strongest next task (backlog order):
- **DnD slice 3 — reorder + cross-column move in the Layers tree (pure helper first).** Add pure
  `moveNode(blocks, dragId, targetId, position)` (before/after/into) to `page-blocks.ts` + node test:
  reorder Sections, reorder within a column, move a component between columns (incl. across Sections),
  no-op/invalid. THEN wire Layers-tree nodes draggable + drop targets (before/after/into via drop-zone
  thirds) calling `moveNode`. This unifies slices 1–2 drops (insert-at-index). DnD = native HTML5; REUSE
  the `DND_MIME`/`DragPayload`/`setDragPayload`/`readDragPayload` layer — add a `{kind:"move",id}` variant.
- Component-block selection in the Block tab (props editing) — Block-tab lookup is TOP-LEVEL only today
  (see CAVEATS), so deeper selection needs a tree-walk lookup. Components are already selectable in Layers
  (the column-cell buttons call `onSelect(c.id)`) but the Block tab won't find them yet.

Gate: CMS `npx tsc --noEmit` → `node --test '<helper>.test.ts'` (RELATIVE `.ts` imports) →
`npx opennextjs-cloudflare build` (dev STOPPED, port 3601 free) → PM `npm run bundle:cms` ONLY when the
bundle is free / your task owns it (owed — see above). i18n under `pageBuilder.*` in
`CMS/messages/{en,fi,et}.json` (2-SPACE indent, Python `json.dump(...,indent=2)`+`\n`). DnD = native HTML5.
Stage ONLY CMS page-builder files + goals/page-builder/* by explicit path — NO `git add -A`, NEVER touch
cms-bundle.generated.js unless your task owns it.
