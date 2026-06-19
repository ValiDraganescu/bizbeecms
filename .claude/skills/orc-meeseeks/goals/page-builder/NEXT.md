# Note to the next Meeseeks (page-builder)

**THIS run (Per-viewport column visibility):** DONE. A Section column can be hidden on mobile/tablet/
desktop. Pure `columnVisibilityClass(props)` in `tree.ts` maps `hideMobile/hideTablet/hideDesktop` →
`pb-hide-*` classes; `planColumn` emits `className` on the cell. `utility-css.ts` owns the 3 `pb-hide-*`
`@media` rules (≤767 / 768–1023 / ≥1024) — inline can't `@media` and the sheet has no Tailwind `md:`
variants. Editor: new `ColumnSettings` panel (a column is now SELECTABLE — the "Column N" Layers label
is a button) with a 3-toggle control via new `onUpdateColumnProps`. i18n `columnSettings`+`colVisibility.*`
EN/FI/ET. Tests render-tree+utility-css 39/39. tsc + opennext build green. See CAVEATS for the
`className`-not-`class` + precompiled-sheet rules.

**CHECK BUGS FIRST:** ALL bugs in BACKLOG `## Bugs` are DONE. If a fresh human bug appears, take it first.

**BUILD IS GREEN** as of 21:03: `npx tsc --noEmit` exit 0 (fully clean) + `npx opennextjs-cloudflare
build` complete. If a future build fails on a non-page-builder file, re-check (other loops share the tree).

**Top queued tasks** (bugs clear) — pick the highest:
- **Column settings panel — per-column align/padding/margin/gap/bg.** EXTEND the new `ColumnSettings`
  (page-builder-shell.tsx) — do NOT add a second panel. Add a pure `mergeColumnProps` (or reuse the
  patch-merge `onUpdateColumnProps`) + `tree.ts` planColumn reads the per-column props. OMIT max-width
  (doesn't make sense for a grid track). Node test + EN/FI/ET.
- **Delete a SPECIFIC column** (`deleteColumn` — removes col AND decrements `columns`; reuse the in-app
  confirm pattern, NOT native window.confirm).
- **Delete nodes in the Layers tree** (`removeNode` exists; in-app confirm pattern).
- **Section padding — ONE shared rem/px unit switch** (replace per-side units).
- **Adopt `<LocalePicker>` in C2** (`pages-manager.tsx` + `pages/block-editor.tsx` still stack locales).
- **Page VERSIONING slice 1** (schema + version store) gates the whole versioning track.

Gate: CMS `npx tsc --noEmit` → relevant node tests (`node --test scripts/*.test.mjs`) →
`npx opennextjs-cloudflare build` (dev STOPPED, port 3601 free). Stage ONLY CMS files + `goals/page-builder/*`
by EXPLICIT PATH — NO `git add -A`. Do NOT touch cms-bundle.generated.js (PM predeploy auto-regens) or other
loops' files (custom-domains/, router/, ProjectManager deploy bundle, ai-assistant api/chat).
