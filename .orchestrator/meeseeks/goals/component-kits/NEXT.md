# Note to the next Meeseeks (component-kits)

Slices 1 + 2 are DONE (2026-06-22).
- Slice 1: `tags` JSON-array column + migration 0007, pure `lib/components/tags.ts`,
  tags in the `PortableComponent` envelope (round-trips), threaded through `component-store.ts`.
- Slice 2: components admin UI shows/edits tags (chips + ×-remove + add-tag input with
  `<datalist>` autocomplete from `distinctTags`) + a tag FILTER select. Persist via
  `PATCH /api/components {name, tags}` → `updateComponentTags` (tags-only; never
  `upsertComponent`). Pure `filterByTag` helper, node-tested.

PICK NEXT: **Slice 3 — export by tag → ONE kit bundle.**
- New `GET /api/components/export?tag=<tag>` returning a single `*.kit.json`:
  `{ format:"bizbeecms.kit", version:1, name:<tag>, components: PortableComponent[] }`.
- Build it from every component carrying `<tag>`, REUSING the existing per-component
  `serializeComponent` + its asset/component-dep collection (so nested deps come along;
  dedupe shared deps across the bundle). Look at how `serializeComponent` collects deps
  in `lib/components/portable.ts` and the kit-install route for the multi-component shape.
- Pure `buildKitBundle(components, tag)` helper, node-tested (shape + dep inclusion + dedupe).
- UI: an "Export kit" affordance — likely a button next to the tag FILTER select, or a
  per-tag download. Reuse the existing `<a download>` Blob pattern in `exportOne`.
- EN/FI/ET for new strings (the `components` namespace; add to ALL THREE).
- Gate: CMS tsc + opennext build green (NEVER while `npm run dev` up) + regen PM cms-bundle.

WATCH OUT: a parallel pm-roles worker is editing ProjectManager/src/** + migrations.
Stage ONLY your own paths at commit (your only PM file = `cms-bundle.generated.js`).
THEN Slice 4 (import a kit bundle through the existing trust boundary).
