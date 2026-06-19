# Note to the next Meeseeks (page-builder)

DONE so far: LAYOUT shell + page select/create + kit↔component GAP + Components rail (render+search+
CLICK-INSERT) + editor block-tree store + Save PERSISTS + Center Layers⟷Preview + Right-rail SEO form +
DnD slice 1 (drag Section into Layers) + Section→Columns model migration + Right-rail Block tab Section
settings panel + DnD slice 2 (rail component → COLUMN slot) + **DnD slice 3 (reorder + cross-column/section
move in the Layers tree) — THIS run**.

**DnD slice 3 — DONE this run.** PURE `moveNode(blocks, dragId, targetId, position)` in `page-blocks.ts`
(`before`/`after` = sibling of the target at any depth; `into` = last child of a CONTAINER target —
Section/column only, leaf = no-op). No-ops (return a structural `clone`) on self-drop, missing ids, into-a-leaf,
or target-inside-dragged. 6 node tests → page-blocks-sections.test.ts **19/19**. UI: `{kind:"move",id}` added to
the `DragPayload` union; `LayersTree`'s shared `reorderProps(id)` makes Section + component buttons draggable +
drop targets (top half = before / bottom = after via `edgeOf`; box-shadow edge line via `edgeClass`;
`stopPropagation` keeps the move off the column/root zones). A `move` dropped on a COLUMN cell → `moveNode(id,
col.id,"into")`. Rail section/component drops unchanged (each handler gates on payload `kind`). No new visible
strings → no i18n. tsc + opennext build green.

⚠️ **BUNDLE STILL STALE — REGEN OWED (from the column-model run, NOT this one).** This run is UI-only (no render
output change). The PM bundle (`ProjectManager/src/lib/deploy/cms-bundle.generated.js`) is still behind on the
Section grid render from the column-model run. When a run OWNS the bundle / the user approves:
`cd ProjectManager && npm run bundle:cms`, verify grep (`data-section-column`, `gridTemplateColumns`) +
`node -e import()` smoke. A render-touching task is the natural place to clear this.

Strongest next task (backlog order — DnD slices are all DONE now):
- **Component props-schema FOUNDATION — richer field vocab + Block-tab settings form** (the TOP open TODO in
  BACKLOG, and it BLOCKS the 3 kit-upgrade tasks). bizbee already has `component.propsSchema`,
  `parsePropsSchema`/`validateBlockProps`/`setLocalizedProp` in `page-blocks.ts` — but the parser only knows
  `{type:"string"|"richtext", default}`. Extend to the aicms field vocab (ref: aicms
  `lib/widgets/props_schema.ts` + `builtin_schemas.ts` + the form renderer in `page_structure_diagram.tsx`) and
  render an editable settings form for the SELECTED component in the Block tab. **GOTCHA (CAVEATS):** the Block
  tab resolves the selected block at TOP LEVEL ONLY (`blocks.find(b=>b.id===selectedBlockId)`); components are
  now selectable in Layers (column-cell buttons call `onSelect(c.id)`) so this task MUST add a tree-walk lookup
  to find a nested component block by id (and a tree-walk prop-merge to persist edits). Reuse `setLocalizedProp`
  for per-locale text props — the USER asked (2026-06-19) that components DECLARE which props are TRANSLATABLE
  and offer a field per supported content locale (the shell already gets `contentLocales`; mirror the SEO tab's
  per-locale layout). Persist via the existing block PUT (Save). EN/FI/ET for LABELS.

Gate: CMS `npx tsc --noEmit` → `node --test '<helper>.test.ts'` (RELATIVE `.ts` imports — node can't resolve
`@/`) → `npx opennextjs-cloudflare build` (dev STOPPED, port 3601 free). PM `npm run bundle:cms` ONLY when the
bundle is free / your task owns it (owed — see above). i18n under `pageBuilder.*` in
`CMS/messages/{en,fi,et}.json` (2-SPACE indent, Python `json.dump(...,indent=2)`+`\n`). DnD = native HTML5,
REUSE the `DND_MIME`/`DragPayload`/`setDragPayload`/`readDragPayload` layer. Stage ONLY CMS page-builder files +
goals/page-builder/* by explicit path — NO `git add -A`, NEVER touch cms-bundle.generated.js unless your task
owns it.
