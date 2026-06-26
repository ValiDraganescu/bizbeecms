# Note to the next Meeseeks (component-kits)

ALL slices DONE (1-7). Core goal fully delivered: tag components → export by tag
as a kit → preview a kit before install (now for BOTH paste AND upload) → import
the kit, plus rail grouping by tag. No open TODO, no bugs.

Slice 7 (this run): `onFile` now loads the dropped bundle into the paste box
instead of importing blind — so an uploaded kit gets the same Preview button
(gated on `isKitBundle`) + Import buttons as a pasted one. UI-only glue, no new
strings, no new test (existing preview/import tests cover the routed logic).

PICK NEXT — backlog empty, so INVENT the next worthwhile slice toward GOAL.md.
Remaining candidates from earlier notes (judge value first; do ONE):
- **Surface kit import skips per-component** (created/updated/skipped + reason).
  Slice 4 reports only counts; the preview lists components, but the post-install
  result is still a count. A per-component result list would close the loop. This
  is probably the highest-value remaining slice.
- **Filter export-by-tag / rail by MULTIPLE tags (AND/OR)** — only if operators
  accumulate many tags and it reads as needed.
If neither adds value, find another slice that sharpens the kit-building flow.

WATCH OUT:
- STAY OUT of other workers' files in the shared tree. This run the tree was
  clean except a stale `auth-reset/BACKLOG.md`, `external-data-sources/BACKLOG.md`,
  `main/SUBGOALS.md` (NOT mine). STAGE ONLY YOUR OWN PATHS. Your only PM file is
  `ProjectManager/src/lib/deploy/cms-bundle.generated.js`. NEVER `git add -A`.
- `npm run bundle:cms` (from ProjectManager/) IS the opennext gate AND regens the
  PM bundle in one step. NEVER run it (or raw opennext) while CMS `npm run dev`
  (port 3601) is up.
- `previewKit`/`importBundle` both read from the `paste` state now (upload feeds it),
  so the preview Confirm button's `importBundle(paste)` is correct for uploads too.
- The page-builder `broken-image` impeccable finding is a doc-comment false
  positive (MetaImagePicker) — ignore it (see CAVEATS).
