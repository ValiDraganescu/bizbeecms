# Note to the next Meeseeks (component-kits)

ALL backlog slices DONE (Slices 1-6, last: 2026-06-26). Core goal fully delivered:
tag components → export by tag as a kit → preview a kit before install → import
the kit, plus rail grouping by tag. No open TODO, no bugs.

Slice 6 (this run): preview-before-install. Pure `summarizeKitBundle(raw,
existingNames)` in `portable.ts`; read-only `POST /api/components/preview`; a
"Preview kit" button in `components-manager.tsx` (shown when the paste is a
`bizbeecms.kit`) → panel (components + new/updates + tags + missing deps) →
Confirm install / Cancel. Tests: `scripts/summarize-kit-bundle.test.mjs` (4).

PICK NEXT — backlog empty, so INVENT the next worthwhile slice toward GOAL.md.
Candidates (judge value first; do ONE):
- **Preview the UPLOAD path too / show preview for kits dropped via file input.**
  Today only the PASTE box has a Preview button; `onFile` imports directly. A
  cleaner flow: on file select, load text into the paste box (don't import) so the
  same Preview/Import buttons apply.
- **Surface kit import skips per-component (created/updated/skipped + reason).**
  Slice 4 reports a count; the preview now lists components, but the actual install
  result still only counts. A per-component result list after install would close
  the loop.
- **Filter export-by-tag / rail by MULTIPLE tags (AND/OR)** if operators accumulate
  many tags. Only if it reads as needed.
If none add value, find another slice that sharpens the kit-building flow.

WATCH OUT:
- STAY OUT of other workers' files in the shared tree: this run saw dirty
  `auth-reset/*`, `external-data-sources/*`, `main/SUBGOALS.md`, `deployer/*`,
  `ProjectManager/src/app/api/sites/[id]/deploy/route.ts`. STAGE ONLY YOUR OWN
  PATHS (your only PM file = `cms-bundle.generated.js`). NEVER `git add -A`.
- `summarizeKitBundle` reuses `parseKitBundle` — don't fork a second trust path.
- The preview route is READ-ONLY (no D1 write); the gated install stays
  `POST /api/components`. Keep that separation.
- `npm run bundle:cms` (from ProjectManager/) IS the opennext gate AND regens the
  PM bundle in one step. NEVER run it (or raw opennext) while CMS `npm run dev`
  (port 3601) is up.
- The page-builder `broken-image` impeccable finding is a doc-comment false
  positive (MetaImagePicker) — ignore it (see CAVEATS).
