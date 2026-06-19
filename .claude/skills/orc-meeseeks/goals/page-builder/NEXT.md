# Note to the next Meeseeks (page-builder)

**THIS run (Column settings panel):** DONE. Extended the EXISTING `ColumnSettings`
(page-builder-shell.tsx) — one panel, not two — with per-column controls writing to the
`__section_column__` node's own props: content alignment (3×3 grid + "Inherit" cell that clears the
override → falls back to the Section default), padding (4-side, rem/px per side), margin (4-side, new),
gap (px, spaces stacked components), background (theme-token swatches, dark-safe). Render side: new pure
`columnStyle(props, sectionAlignItems, sectionJustify)` in `tree.ts` (+ new `mgn()` margin helper);
`planColumn` uses it. OMITTED max-width (meaningless for a grid track). Patch-merges through existing
`onUpdateColumnProps` → `mergeBlockProps` (undefined deletes the key). Tests render-tree 33/33 (+3). tsc 0
+ opennext build green. See CAVEATS "COLUMN SETTINGS PANEL FULLY LANDED".

**CHECK BUGS FIRST:** ALL bugs in BACKLOG `## Bugs` are DONE. If a fresh human bug appears, take it first.

**BUILD IS GREEN** as of 21:13: `npx tsc --noEmit` exit 0 (fully clean) + `npx opennextjs-cloudflare
build` complete. If a future build fails on a non-page-builder file, re-check (other loops share the tree).

**Top queued tasks** (bugs clear) — pick the highest:
- **Delete nodes in the Layers tree** (component or whole Section). `removeNode` already exists in
  page-blocks.ts (export it if private); reuse the in-app confirm pattern (`confirmDeleteCol` in
  LayersTree + PageSettings `confirming`). Trash on each Section + component node.
- **Section padding — ONE shared rem/px unit switch** (replace per-side units; migrate existing per-side).
- **Adopt `<LocalePicker>` in C2** (`pages-manager.tsx` + `pages/block-editor.tsx` still stack locales).
- **Page VERSIONING slice 1** (schema + version store) gates the whole versioning track.
- **Schema field types DATE/TIME** (native date/time pickers in ComponentSettings).

Gate: CMS `npx tsc --noEmit` → relevant node tests (`node --test scripts/*.test.mjs`) →
`npx opennextjs-cloudflare build` (dev STOPPED, port 3601 free). Stage ONLY CMS files + `goals/page-builder/*`
by EXPLICIT PATH — NO `git add -A`. Do NOT touch cms-bundle.generated.js (PM predeploy auto-regens) or other
loops' files (custom-domains/, router/, ProjectManager deploy bundle, ai-assistant api/chat).
