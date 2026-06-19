# Note to the next Meeseeks (page-builder)

**THIS run (Responsive Section columns — auto-stack):** DONE. `tree.ts` `planSection` `equal` behavior now
emits `repeat(auto-fit, minmax(min(100%, 16rem), 1fr))` (new `MIN_COLUMN_WIDTH` const) so multi-column
Sections drop one-below-the-other on tablet/mobile (no `@media` — inline styles can't; `min(100%,MIN)` caps
the track so a phone never overflows). 1-column → `"1fr"`; `collapse` UNCHANGED (fixed 1fr/0fr). I deliberately
did NOT touch `page-blocks.ts` `sectionGridCols` (the Layers-tree mirror) — the EDITOR preview wants a fixed
N-track row regardless of viewport, so auto-stack there would be wrong. See the new RESPONSIVE COLUMNS caveat:
the two grids are no longer pixel-identical for `equal`, only for `collapse`. Tests: `render-tree.test.mjs`
26/26 (+3 planSection grid tests). tsc + opennext build green.

**CHECK BUGS FIRST:** ALL bugs in BACKLOG `## Bugs` are DONE. If a fresh human bug appears, take it first.

**BUILD IS GREEN:** `npx tsc --noEmit` exit 0 (fully clean) and `npx opennextjs-cloudflare build` complete as
of 20:56. If a future build fails on a non-page-builder file, re-check, but it's clean.

**Top queued tasks** (bugs clear) — pick the highest:
- **Per-viewport column visibility — hide a column on desktop/tablet/mobile.** Now that columns are
  responsive, this is the natural next responsiveness slice. Inline styles CAN'T `@media`, so use Tailwind
  classes (`hidden md:block` etc.) on the column cell — note in JOURNAL. Depends on/benefits from a Column
  settings panel (where the visibility control lives).
- **Column settings panel** (per-column align/padding/margin/gap/bg) — `mergeColumnProps` + `ColumnSettings`.
- **Delete nodes in the Layers tree** (`removeNode` exists; reuse the IN-APP confirm pattern from
  `PageSettings`/`PageBuilderShell`, NOT native window.confirm).
- **Delete a SPECIFIC column** (`deleteColumn` — removes the col AND decrements `columns`).
- **Section padding — ONE shared rem/px unit switch** (replace per-side units).
- **Adopt `<LocalePicker>` in C2** (`pages-manager.tsx` + `pages/block-editor.tsx` still stack locales).
- **Page VERSIONING slice 1** (schema + version store) gates the whole versioning track.

Gate: CMS `npx tsc --noEmit` → relevant node tests (`node --test scripts/*.test.mjs`) →
`npx opennextjs-cloudflare build` (dev STOPPED, port 3601 free). Stage ONLY CMS files + `goals/page-builder/*`
by EXPLICIT PATH — NO `git add -A`. Do NOT touch cms-bundle.generated.js (PM predeploy auto-regens) or other
loops' files.
