# Note to the next Meeseeks (page-builder)

DONE so far: LAYOUT shell + page select/create + kit↔component GAP + Components rail (render + search +
CLICK-INSERT) + editor block-tree store + Save PERSISTS + Center Layers⟷Preview BOTH halves + Right-rail
SEO form + **DnD slice 1** (drag the LAYOUT "Section" from the rail into the Layers tree → append).

**DnD slice 1 — DONE this run.** Native HTML5 DnD (no dep). New shared payload layer in
`page-builder-shell.tsx`: `DND_MIME = "application/x-page-builder"`, `DragPayload` union
(`{kind:"section"}` today), `setDragPayload`/`readDragPayload`. Rail Section button is `draggable`
(payload `{kind:"section"}`) AND still click-to-add. Center Layers panel is the drop target
(onDragOver preventDefault + indicator, onDrop → `onAddSection()` = APPEND; empty Layers = append).
Blue drop-line via `t("dropSectionHint")` (EN/FI/ET added, 2-space indent). No tree logic touched
(reused `addSection`) → no new test. tsc + opennext build green.

⚠️ BUNDLE REGEN DEFERRED (cross-loop guardrail — this run's task message forbade touching
`ProjectManager/src/lib/deploy/cms-bundle.generated.js`). This slice is UI-only (no render/route
behavior change), so the deployable bundle doesn't strictly need it. Regen ONLY when your task owns
the bundle / the user approves overwriting a contended one.

⚠️ BACKLOG WAS REORDERED MID-RUN (user decision 2026-06-19): adopt the aicms **Section→Columns**
model. A Section gets `columns` (1–4) realized as `__section_column__` children; COMPONENTS drop into
a COLUMN, not the Section. The TOP backlog task is now the column-model migration — it is the
PREREQUISITE for the Block-tab Section settings panel + DnD slices 2 & 3. Read the backlog header
block (lines ~8–16) for the exact Section prop list + aicms references.

Strongest next tasks (NEW backlog order):
- **Section column model migration** (PREREQUISITE): `addSection` seeds `__section_column__` children
  (default 1 col), new pure `setSectionColumns(section,n)` (+ node test, content reflow on shrink),
  `tree.ts` Section render → aicms CSS-grid output. Extend `page-blocks-sections.test.ts`.
- **Right-rail Block tab — Section settings panel** (mirror aicms `page_structure_diagram.tsx`):
  columns/align/padding(rem-default unit!)/gap/maxWidth/bg-from-theme. Depends on column model.
- **DnD slice 2 — drop component into a COLUMN slot** (`{kind:"component",name}` payload — already
  in the `DragPayload` union shape; add the `"component"` variant; new `addComponentToColumn`).
- **DnD slice 3 — reorder + cross-column move** (pure `moveNode(blocks,dragId,targetId,position)` +
  node test FIRST, then wire Layers nodes as draggable + before/after/into drop-zone thirds).

Gate: CMS `npx tsc --noEmit` → `node --test '<helper>.test.ts'` (RELATIVE `.ts` imports) →
`npx opennextjs-cloudflare build` (dev STOPPED, port 3601 free) → PM `npm run bundle:cms` (ONLY when
the bundle is free / your task owns it). i18n under `pageBuilder.*` in `CMS/messages/{en,fi,et}.json`
(2-SPACE indent, not tabs). DnD = native HTML5 only (see CAVEATS — preventDefault in onDragOver, read
payload in onDrop). Stage ONLY CMS page-builder files + goals/page-builder/* by explicit path.
