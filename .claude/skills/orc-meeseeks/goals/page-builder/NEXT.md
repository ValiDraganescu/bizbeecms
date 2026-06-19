# Note to the next Meeseeks (page-builder)

DONE so far: LAYOUT shell + page select/create + kit↔component GAP + Components rail (render+search+
CLICK-INSERT) + editor block-tree store + Save PERSISTS + Center Layers⟷Preview + Right-rail SEO form +
DnD slice 1 (drag Section into Layers) + Section→Columns model migration + **Right-rail Block tab Section
settings panel (THIS run)**.

**Section settings panel — DONE this run.** `SectionSettings` in `page-builder-shell.tsx` renders when the
selected block is a Section: columns 1–4, empty-cols Equal/Collapse, 3×3 align, 4 padding inputs each with a
rem/px unit toggle (rem default → `padding<Side>Unit`), gap, max-width select, theme-palette bg swatches
(`var(--color-*)`). New pure `mergeSectionProps(blocks,id,patch)` in `page-blocks.ts` (columns→`setSectionColumns`,
undefined deletes key) + 3 tests (14/14). i18n `pageBuilder.section*` EN/FI/ET. Persists via the existing
block PUT on Save. tsc + opennext build green.

⚠️ **BUNDLE STILL STALE — REGEN OWED (NOT from this run).** The Section *render* change was the column-model
run; my run is editor-UI + a pure prop-merge helper, so it doesn't change render output. But the PM bundle
(`ProjectManager/src/lib/deploy/cms-bundle.generated.js`) is still behind on the Section grid render from the
column-model run. When a run OWNS the bundle / the user approves: `cd ProjectManager && npm run bundle:cms`,
verify with grep (`data-section-column`, `gridTemplateColumns`) + `node -e import()` smoke.

Strongest next tasks (backlog order):
- **DnD slice 2 — drop a component into a COLUMN slot:** make rail COMPONENT items draggable
  (`{kind:"component",name}` — add the variant to the `DragPayload` union in page-builder-shell.tsx); each
  Section in Layers renders one drop-slot PER column → `addComponentToColumn` (already built). Drop outside a
  slot = rejected; multiple components per column stacked; highlight the hovered slot.
- **DnD slice 3 — reorder + cross-column move** (pure `moveNode(blocks,dragId,targetId,position)` + node test
  first: same-column reorder, cross-column move, cross-section move, no-op/invalid).
- Component-block selection in the Block tab (props editing) — note the Block-tab lookup is top-level only
  today (see CAVEATS), so deeper selection needs a tree-walk lookup.

Gate: CMS `npx tsc --noEmit` → `node --test '<helper>.test.ts'` (RELATIVE `.ts` imports) →
`npx opennextjs-cloudflare build` (dev STOPPED, port 3601 free) → PM `npm run bundle:cms` ONLY when the
bundle is free / your task owns it (owed — see above). i18n under `pageBuilder.*` in
`CMS/messages/{en,fi,et}.json` (2-SPACE indent, Python `json.dump(...,indent=2)`+`\n`). DnD = native HTML5.
Stage ONLY CMS page-builder files + goals/page-builder/* by explicit path — NO `git add -A`, NEVER touch
cms-bundle.generated.js unless your task owns it.
