# Note to the next Meeseeks (page-builder)

DONE so far: LAYOUT shell + page select/create + kit↔component GAP + Components rail (render+search+
CLICK-INSERT) + editor block-tree store + Save PERSISTS + Center Layers⟷Preview BOTH halves + Right-rail
SEO form + DnD slice 1 (drag Section into Layers) + **Section→Columns model migration (THIS run)**.

**Section→Columns model — DONE this run (pure tree + renderer ONLY, no UI).** The PREREQUISITE is
cleared. `tree.ts`: new reserved `SECTION_COLUMN_COMPONENT="__section_column__"`; `planSection`/`planColumn`
render the aicms CSS-grid (outer `<div data-section bg>` → `<section grid>` → per-col `<div
data-section-column flex>`). `page-blocks.ts`: `addSection` seeds 1 column; new pure `setSectionColumns`
(clamp 1–4, grow=append empty, shrink=reflow into last kept col), `addComponentToColumn`, `sectionColumns`,
`isSectionColumn`; `addComponentToSection` is now a SHIM → column 0 (click-insert still works).
page-blocks-sections.test.ts → 11/11. tsc + opennext build green.

⚠️ **BUNDLE NOW STALE — REGEN OWED.** This run CHANGED render behavior (Section grid output), so
`ProjectManager/src/lib/deploy/cms-bundle.generated.js` no longer matches CMS source. I DEFERRED the regen
(cross-loop guardrail — task message forbade touching the bundle). The DnD slice-1 run before me also
deferred (it was UI-only, fine). Net: the deployable bundle is behind on the Section render. When a run
OWNS the bundle / the user approves, `cd ProjectManager && npm run bundle:cms`, then verify with grep
(`data-section-column`, `gridTemplateColumns`) + the `node -e import()` smoke.

Strongest next tasks (backlog order — column model now unblocks all):
- **Right-rail Block tab — Section settings panel** (next backlog TODO): when a Section is selected, edit
  `block.props` via the existing block PUT. COLUMNS segmented 1/2/3/4 → drives `setSectionColumns`; EMPTY
  COLS equal/collapse; ALIGN 3×3 (vertical×horizontal); PADDING 4 inputs WITH a rem/px unit toggle per value
  (REM DEFAULT — render reads `paddingTopUnit` etc., already wired); GAP; MAX WIDTH select
  (960/1024/1152/1280/1440px/Full); BACKGROUND swatches from the THEME palette (reuse site theme colors,
  don't hardcode). Mirror aicms `page_structure_diagram.tsx`. Pure prop-merge helper + node test. EN/FI/ET.
- **DnD slice 2 — drop component into a COLUMN slot:** rail COMPONENT items draggable
  (`{kind:"component",name}` — add the variant to the `DragPayload` union in page-builder-shell.tsx), each
  Section in Layers renders one drop-slot PER column → `addComponentToColumn` (already built this run).
- **DnD slice 3 — reorder + cross-column move** (pure `moveNode` + node test first).

Gate: CMS `npx tsc --noEmit` → `node --test '<helper>.test.ts'` (RELATIVE `.ts` imports) →
`npx opennextjs-cloudflare build` (dev STOPPED, port 3601 free) → PM `npm run bundle:cms` ONLY when the
bundle is free / your task owns it (it's owed — see above). i18n under `pageBuilder.*` in
`CMS/messages/{en,fi,et}.json` (2-SPACE indent). DnD = native HTML5 only. Stage ONLY CMS page-builder
files + goals/page-builder/* by explicit path — NO `git add -A`, NEVER touch cms-bundle.generated.js
unless your task owns it.
