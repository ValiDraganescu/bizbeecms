# Note to the next Meeseeks (page-builder)

**THIS run (Delete a SPECIFIC column):** DONE. Pure `deleteColumn(blocks, columnId)` in
`page-blocks.ts` removes a `__section_column__` node + its components and sets the parent Section's
`props.columns` to the remaining count (distinct from `setSectionColumns` shrink, which REFLOWS into
the last kept column). ≥1-column guard: deleting the only column is a no-op. Trash affordance on each
"Column N" Layers label (only when >1 column) → in-app confirm (`confirmDeleteCol` state in `LayersTree`,
the PageSettings pattern, NOT native window.confirm) → `onDeleteColumn` (clears selection if deleted).
i18n `pageBuilder.deleteColumn.{action,confirm,cancel}` EN/FI/ET. Tests page-blocks 17/17 (+2). tsc +
opennext build green. See CAVEATS "DELETE-A-COLUMN ≠ SHRINK".

**CHECK BUGS FIRST:** ALL bugs in BACKLOG `## Bugs` are DONE. If a fresh human bug appears, take it first.

**BUILD IS GREEN** as of 21:08: `npx tsc --noEmit` exit 0 (fully clean) + `npx opennextjs-cloudflare
build` complete. If a future build fails on a non-page-builder file, re-check (other loops share the tree).

**Top queued tasks** (bugs clear) — pick the highest:
- **Column settings panel — per-column align/padding/margin/gap/bg.** EXTEND the existing `ColumnSettings`
  (page-builder-shell.tsx) — do NOT add a second panel. Add a pure `mergeColumnProps` (or reuse the
  patch-merge `onUpdateColumnProps`) + `tree.ts` planColumn reads the per-column props. OMIT max-width
  (doesn't make sense for a grid track). Node test + EN/FI/ET.
- **Delete nodes in the Layers tree** (component or whole Section). `removeNode` already exists in
  page-blocks.ts (currently private — export it); reuse the in-app confirm pattern (see the new
  `confirmDeleteCol` in LayersTree + PageSettings `confirming`). Trash on each Section + component node.
- **Section padding — ONE shared rem/px unit switch** (replace per-side units).
- **Adopt `<LocalePicker>` in C2** (`pages-manager.tsx` + `pages/block-editor.tsx` still stack locales).
- **Page VERSIONING slice 1** (schema + version store) gates the whole versioning track.

Gate: CMS `npx tsc --noEmit` → relevant node tests (`node --test scripts/*.test.mjs`) →
`npx opennextjs-cloudflare build` (dev STOPPED, port 3601 free). Stage ONLY CMS files + `goals/page-builder/*`
by EXPLICIT PATH — NO `git add -A`. Do NOT touch cms-bundle.generated.js (PM predeploy auto-regens) or other
loops' files (custom-domains/, router/, ProjectManager deploy bundle, ai-assistant api/chat).
