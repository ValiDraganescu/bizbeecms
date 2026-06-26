# Backlog — component-kits
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
- DONE (2026-06-26): **Slice 9 — kit metadata on export.** Operator can NAME +
  DESCRIBE a kit on export (vs deriving the name from the tag), carried in the
  `bizbeecms.kit` envelope (`name` + `meta.note`) and shown in the preview panel.
  `buildKitBundle` takes `{name?,note?}`; export route accepts `&name=&note=`;
  `parseKitBundle`/`summarizeKitBundle` surface the bounded `note`. UI: name+desc
  inputs under the tag filter; preview shows the note. 3 EN/FI/ET keys. 20/20 tests
  (+3); tsc + opennext gate green; cms-bundle regenerated.

- DONE (2026-06-26): **Slice 8 — surface per-component kit-install results.** Both
  kit paths (paste/upload import + starter-kit install) already returned `installed[]`
  ({name, action}) + `skipped[]` reasons, but the UI only showed count summaries. Added
  a `kitResult` state + a per-component result panel (created/updated chip per name,
  skipped reasons listed) so the post-install result closes the loop. 4 EN/FI/ET keys.
  tsc + opennext build green; cms-bundle regenerated. UI-only render, no new test.

- DONE (2026-06-26): **Slice 7 — uploaded kits get the preview flow too.** `onFile`
  now loads the dropped file's text into the paste box (no blind import), so the
  SAME Preview/Import buttons (incl. the kit Preview button gated on `isKitBundle`)
  apply uniformly to pasted and uploaded bundles. No new strings. tsc + opennext
  build green; cms-bundle regenerated.

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

- DONE (2026-06-22): **Slice 2 — components admin UI: see/edit tags + filter by tag.**
  `updateComponentTags` (tags-only update, NOT via upsertComponent) + `PATCH
  /api/components` + `filterByTag` pure helper. UI: tag chips + ×-remove + add-tag
  input (datalist autocomplete from distinctTags) + tag FILTER select. en/fi/et 6 new
  keys. tsc + opennext build green; 17/17 tests; cms-bundle regenerated.

- DONE (2026-06-22): **Slice 3 — export by tag → one kit bundle.** New `GET
  /api/components/export?tag=<tag>` that returns a single `*.kit.json`:
  `{ format:"bizbeecms.kit", version:1, name:<tag>, components: PortableComponent[] }`
  built from every component carrying `<tag>`, REUSING the existing per-component
  portable serialization + its asset/component-dep collection (so nested deps are
  included; dedupe shared deps across the bundle). Add an "Export kit" affordance in
  the UI (per tag, or a tag picker → download). Pure `buildKitBundle(components,
  tag)` helper node-tested (shape + dep inclusion + dedupe). EN/FI/ET.

- DONE (2026-06-22): **Slice 4 — import a kit bundle (multi-component, one step).** Accept the
  `bizbeecms.kit` envelope on import (extend the existing import UI/route, or the
  kit-install route `api/components/kit`): validate `format`/`version`, then install
  EACH component through the EXISTING trust boundary
  (`parsePortableComponent`/`validateComponentArtifact` + `upsertImportedComponent`),
  carrying the kit's tag onto each installed component (and/or `sourceKit=<kit
  name>` so the rail groups them). Report per-component created/updated + any
  skipped (missing deps) like single import does. Pure `parseKitBundle` trust
  helper node-tested (good bundle, bad format/version, per-component validation
  failure). EN/FI/ET.

- DONE (2026-06-26): **Slice 6 — preview a kit's contents before install.** Pure
  `summarizeKitBundle(raw, existingNames)` in `lib/components/portable.ts` (reuses
  `parseKitBundle`; returns per-component create/update vs existing names, unioned
  tags, external asset deps, component deps the Site is MISSING, skipped-validation
  count). New read-only `POST /api/components/preview` (no D1 write; kit envelope
  only). UI: a "Preview kit" button (shown when the paste is a `bizbeecms.kit`) →
  preview panel listing components + new/updates + tags + missing deps + Confirm
  install (runs the SAME gated import path) / Cancel. EN/FI/ET 12 new keys. 4 node
  tests. tsc + opennext build green; cms-bundle regenerated.

- DONE (2026-06-26): **Slice 5 — rail grouping by tag.** New pure
  `groupComponentsByTag(components)` in `lib/components/grouped.ts` (alphabetical tag
  groups, a component appears under each of its tags, untagged bucket last, names
  sorted — reuses the `ComponentGroup` shape so `filterGroups`/render are unchanged).
  `listComponentsWithKit` now also returns `tags` (parsed). `GET /api/components/grouped`
  returns `{ groups, tagGroups }`. Page-builder rail got a Kit/Tag toggle that switches
  which grouping renders. EN/FI/ET `groupByLabel/groupByKit/groupByTag/tagUntagged`.
  4 node tests added. tsc + opennext build green; cms-bundle regenerated.
