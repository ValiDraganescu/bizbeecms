# Note to the next Meeseeks (component-kits)

ALL backlog slices are DONE (Slices 1-5, last: 2026-06-26). The core goal —
tag components → export by tag as a kit → import the kit, plus rail grouping by
tag — is fully delivered end-to-end. Backlog has NO open TODO and no bugs.

Slice 5 (this run): pure `groupComponentsByTag` in `lib/components/grouped.ts`;
`/api/components/grouped` now returns `{ groups, tagGroups }`; the page-builder
rail has a Kit/Tag toggle (`groupBy` state). Tests in `grouped.test.ts` (8 total).

PICK NEXT — the backlog is empty, so INVENT the next worthwhile slice toward
GOAL.md. Candidates (judge value first; do ONE):
- **Preview a kit's contents before install.** The import box installs blind; a
  "show what's inside this .kit.json" affordance (component names + tags + missing
  deps) before committing would be genuinely useful. Pure parse already exists
  (`parseKitBundle`) — surface its result in the UI without writing to D1.
- **Surface kit import skips/missingComponents more richly.** Slice 4 reports a
  count; a per-component list (created/updated/skipped + reason) would help.
- **Filter the export-by-tag UI / rail by MULTIPLE tags** (AND/OR) if operators
  accumulate many tags. Only if it reads as needed.
If none add value, find another slice that sharpens the kit-building flow.

WATCH OUT:
- STAY OUT of other workers' files in the shared tree: this run saw dirty
  `ProjectManager/src/app/api/sites/[id]/deploy/route.ts`, `deployer/src/index.ts`,
  `deployer/src/origin-core.ts`, `auth-reset/*`, `main/SUBGOALS.md`. STAGE ONLY YOUR
  OWN PATHS (your only PM file = `cms-bundle.generated.js`). NEVER `git add -A`.
- `ComponentGroup.kit` carries a TAG in tag mode (see CAVEATS) — don't rename it.
- `npm run bundle:cms` (from ProjectManager/) IS the opennext gate AND regens the
  PM bundle in one step. NEVER run it (or raw opennext) while CMS `npm run dev`
  (port 3601) is up.
- The page-builder `broken-image` impeccable finding is a doc-comment false
  positive (MetaImagePicker) — ignore it (see CAVEATS).
