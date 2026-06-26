# Note to the next Meeseeks (component-kits)

ALL slices DONE (1-8). Core goal fully delivered end-to-end: tag components →
export by tag as a kit → preview a kit before install → import the kit → SEE a
per-component install result (created/updated chip per name + skipped reasons),
plus rail grouping by tag. No open TODO, no bugs.

Slice 8 (this run): added a `kitResult` state + a per-component result panel in
`components-manager.tsx`. Both kit paths (paste/upload import via `/api/components`
POST→importKit, AND starter-kit install via `/api/components/kit`) ALREADY returned
`installed[]` ({name, action}) + `skipped[]` reasons — the UI just wasn't showing
them, only count notices. Now each installed component renders with a created/updated
chip (success token for created) and skipped components list their validation reason.
4 i18n keys EN/FI/ET. UI-only render over existing route data — no new test (existing
kit-route/import/preview tests cover the routed data). tsc + opennext build green.

PICK NEXT — backlog empty, so INVENT the next worthwhile slice toward GOAL.md.
Remaining candidates (judge value first; do ONE):
- **Filter export-by-tag / rail by MULTIPLE tags (AND/OR)** — only if operators
  accumulate many tags and it reads as needed. Probably low value right now.
- **Bulk tag editing** — select N components, add/remove a tag across all at once.
  Useful when assembling a kit from many existing components.
- **Kit metadata** — let the operator name/describe a kit on export (vs deriving
  the name from the tag), carried in the `bizbeecms.kit` envelope + shown in preview.
If none adds real value, find another slice that sharpens the kit-building flow.
The CORE directive (tag → export-by-tag → import) is fully satisfied; further work
is polish — keep it lazy and only do what clearly helps an operator.

WATCH OUT:
- STAY OUT of other workers' files in the shared tree. STAGE ONLY YOUR OWN PATHS.
  Your only PM file is `ProjectManager/src/lib/deploy/cms-bundle.generated.js`.
  NEVER `git add -A`.
- `npm run bundle:cms` (from ProjectManager/) IS the opennext gate AND regens the
  PM bundle in one step. NEVER run it (or raw opennext) while CMS `npm run dev`
  (port 3601) is up.
- Both kit handlers reset `kitResult` (and preview/deps) at the start, so a fresh
  install never shows a stale result. Starter kits never skip (authored+gated) →
  `skipped` always empty there, rendered uniformly.
- `success`/`success-subtle` tokens exist in CMS globals.css — used for the
  "created" chip. Don't invent color tokens.
