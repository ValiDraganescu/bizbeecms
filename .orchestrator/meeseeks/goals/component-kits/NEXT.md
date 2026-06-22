# Note to the next Meeseeks (component-kits)

Slices 1 + 2 + 3 are DONE (2026-06-22).
- Slice 3: pure `buildKitBundle(rows, tag, meta?)` in `lib/components/portable.ts`
  (`KIT_FORMAT="bizbeecms.kit"`, `KIT_VERSION=1`, `KitBundle` type) — reuses
  `serializeComponent`, unions+dedupes assets, drops in-kit componentDeps (only
  external remain). New `GET /api/components/export?tag=<tag>` → one `*.kit.json`.
  UI: "Export kit" button by the tag filter. en/fi/et `exportKit`+`exportKitPickTag`.
  Tests: `scripts/build-kit-bundle.test.mjs` (5).

PICK NEXT: **Slice 4 — import a kit bundle (multi-component, one step).**
- Accept the `bizbeecms.kit` envelope on import. Cleanest: a new pure trust helper
  `parseKitBundle(raw)` in `portable.ts` that validates `format===KIT_FORMAT` +
  `version===KIT_VERSION` + `components` is an array, then runs EACH element through
  the EXISTING `parsePortableComponent` (per-component trust boundary — never bypass
  it). Return `{ok, components: ImportedComponent[], assets, componentDeps, errors}`
  (union deps, collect per-component errors with the component index/name).
- Wire it into the import path. Two options: (a) extend the `/api/components` POST to
  detect a kit envelope and loop, or (b) a new endpoint. Either way install EACH via
  `upsertImportedComponent(c, undefined, kitName)` so `sourceKit` groups them in the
  rail (mirror `api/components/kit/route.ts`'s loop — validate ALL first, then write).
  Carry the kit's tag onto each component too (the envelope already has per-component
  `tags`, so they round-trip; just make sure import persists them — it does).
- UI: the existing paste/upload box could auto-detect a `.kit.json` (check `format`)
  and call the kit-import path; report per-component created/updated + skipped.
- Pure `parseKitBundle` node-tested (good bundle, bad format/version, one bad
  component fails just that one or the whole batch — decide + test it). EN/FI/ET.
- THEN Slice 5 (optional) — rail grouping by tag in `lib/components/grouped.ts`.

WATCH OUT:
- A parallel pm-roles worker edits ProjectManager/src/** + migrations; a CMS-ports
  worker edits CMS/src/lib/ports/** + CMS/wrangler.jsonc. STAGE ONLY YOUR OWN PATHS
  (your only PM file = `cms-bundle.generated.js`). NEVER `git add -A`.
- `bundle:cms` (from ProjectManager/) runs the CMS opennext build internally — that
  IS the opennext gate AND regens the PM bundle in one step. NEVER run it (or the raw
  opennext build) while `npm run dev` is up.
- Pre-existing unrelated failure: `scripts/ports-sole-reader.guard.test.mjs` (content-db.ts,
  content-collections goal) — not this goal. Don't chase it.
