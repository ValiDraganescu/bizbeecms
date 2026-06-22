# Backlog — component-kits
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
Build order: tags on the data + portable envelope first, then the UI, then
export-by-tag, then kit import. Each slice gates on CMS tsc + opennext build green
+ regen PM cms-bundle + EN/FI/ET for new strings.

- DONE (2026-06-22): **Slice 1 — component tags: schema + portable envelope round-trip.** Add a
  `tags` column to the `component` table (`CMS/src/db/schema.ts:30`) — a JSON
  string array (`// ponytail: JSON array column + autocomplete; managed tag table
  only if needed`). Drizzle migration (deployer applies CMS migrations per-Site;
  note if not). Thread tags through `component-store.ts`
  (`listComponents`/`listComponentsWithKit`/`getComponentByName`/`upsertComponent`/
  `upsertImportedComponent`) and the `PortableComponent` envelope
  (`lib/components/portable.ts`) so export→import preserves tags (validate the field
  on the import trust boundary). Pure tag-normalize helper (trim/dedupe/drop empty)
  + a `distinctTags(components)` helper, node-tested. NO UI yet.

- TODO: **Slice 2 — components admin UI: see/edit tags + filter by tag.** In
  `components/components/components-manager.tsx` (+ `app/admin/components/page.tsx`):
  show each component's tags, let the operator add/remove tags (input with
  autocomplete from `distinctTags`), persist via a small `PATCH /api/components`
  (name + tags) reusing `upsertComponent` (tags only — never touches artifact). Add
  a tag FILTER to the list. Reuse design-system + purpose tokens. EN/FI/ET. Pure
  filter helper tested.

- TODO: **Slice 3 — export by tag → one kit bundle.** New `GET
  /api/components/export?tag=<tag>` that returns a single `*.kit.json`:
  `{ format:"bizbeecms.kit", version:1, name:<tag>, components: PortableComponent[] }`
  built from every component carrying `<tag>`, REUSING the existing per-component
  portable serialization + its asset/component-dep collection (so nested deps are
  included; dedupe shared deps across the bundle). Add an "Export kit" affordance in
  the UI (per tag, or a tag picker → download). Pure `buildKitBundle(components,
  tag)` helper node-tested (shape + dep inclusion + dedupe). EN/FI/ET.

- TODO: **Slice 4 — import a kit bundle (multi-component, one step).** Accept the
  `bizbeecms.kit` envelope on import (extend the existing import UI/route, or the
  kit-install route `api/components/kit`): validate `format`/`version`, then install
  EACH component through the EXISTING trust boundary
  (`parsePortableComponent`/`validateComponentArtifact` + `upsertImportedComponent`),
  carrying the kit's tag onto each installed component (and/or `sourceKit=<kit
  name>` so the rail groups them). Report per-component created/updated + any
  skipped (missing deps) like single import does. Pure `parseKitBundle` trust
  helper node-tested (good bundle, bad format/version, per-component validation
  failure). EN/FI/ET.

- TODO: **Slice 5 (optional) — rail grouping by tag.** `lib/components/grouped.ts`
  `groupComponentsByKit` could gain a by-TAG grouping so the page-builder component
  rail can show components grouped by tag, not just kit origin. Small, additive —
  do only if it reads as useful after Slices 1-4. EN/FI/ET. Gate.
