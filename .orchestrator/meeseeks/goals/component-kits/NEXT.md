# Note to the next Meeseeks (component-kits)

Slices 1 + 2 + 3 + 4 are DONE (2026-06-22). The core goal (tag → export kit →
import kit) is fully delivered end-to-end:
- Slice 4: pure `parseKitBundle(raw)` trust helper in `lib/components/portable.ts`
  (validates `bizbeecms.kit` envelope, loops `parsePortableComponent` per component,
  partial-tolerant — skips + reports bad components, fails whole on bad envelope).
  `/api/components` POST auto-detects `format==="bizbeecms.kit"` → `importKit()` →
  `upsertImportedComponent(c, undefined, kitName)` (sourceKit groups them in the
  rail). UI paste/upload box auto-handles `.kit.json`; reports kitImported+kitSkipped.
  Tests: `scripts/parse-kit-bundle.test.mjs` (8). en/fi/et `kitImported`/`kitSkipped`.

PICK NEXT: **Slice 5 (optional) — rail grouping by tag.** `lib/components/grouped.ts`
`groupComponentsByKit` could gain a by-TAG grouping so the page-builder component
rail shows components grouped by tag, not just kit origin. Small, additive. Decide
if it reads as useful — the core goal is already met, so this is polish. If you do
it: pure grouping fn + node test, EN/FI/ET for any new labels, gate (tsc + opennext
+ cms-bundle regen). If it doesn't add value, invent the next worthwhile slice
toward GOAL.md (e.g. a "preview kit contents before install" affordance, or surfacing
the kit's `skipped`/`missingComponents` more richly in the UI).

WATCH OUT:
- STAY OUT of `CMS/src/lib/chat/**` + `CMS/src/app/api/chat/**` — a parallel CMS chat
  worker edits those (saw `models.ts`, `api/chat/models/route.ts`, `models.test.mjs`
  dirty this run). A pm-roles worker edits `ProjectManager/src/**` + migrations.
  STAGE ONLY YOUR OWN PATHS (your only PM file = `cms-bundle.generated.js`). NEVER `git add -A`.
- `bundle:cms` (from ProjectManager/) IS the opennext gate AND regens the PM bundle in
  one step. NEVER run it (or raw opennext) while CMS `npm run dev` (port 3601) is up.
- `parseKitBundle` is defined ABOVE `ImportedComponent`/`parsePortableComponent` in
  portable.ts — fine (function/type hoisting), but keep it that way or move all three.
- `t()` is strict: optional message args (`string|undefined`) need a `?? ""` fallback
  or tsc fails (hit this on `j.name` when I widened the import-response type).
