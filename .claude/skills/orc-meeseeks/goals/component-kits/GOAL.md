# Goal: component-kits
> Decomposes [main goal](../main/GOAL.md). The root north star is the ultimate yardstick.

Let CMS operators **tag custom components** and **export by tag as a UI kit** — so
building a reusable kit is "tag the components, export the tag", and installing it
elsewhere is one import.

USER DIRECTIVE (2026-06-22): "CMS custom component tagging and exporting by tag
(easy UI kit creation)."

This is purely additive on machinery that ALREADY exists (verified 2026-06-22):
single-component export (`GET /api/components?name=`), the portable bundle format
(`lib/components/portable.ts`, `format:"bizbeecms.component"`), the multi-component
KIT install path (`POST /api/components/kit` → upsert each with `sourceKit`), the 5
premade kits, and the grouped component rail (`groupComponentsByKit`). The ONLY
gaps are: components have no user-facing TAGS, and there's no export-by-tag.

NOT to be confused with the PM/Site dynamic tagging (`pm-roles` subgoal) — that's
about Sites + access scope. THIS is component tags inside one CMS, for kit-building.

## What "good" looks like
- A custom component can carry **tags** (e.g. "marketing", "blog", "dark"). Tags
  are free-form-ish labels the operator sets in the components admin UI; a
  component can have many. (Reuse existing patterns; don't over-engineer a managed
  tag table unless it's clearly needed — a tags column + an autocomplete from
  existing tags is likely enough. ponytail.)
- The components admin UI shows tags, lets the operator add/remove them per
  component, and can **filter the list by tag**.
- **Export by tag → a single kit bundle**: `GET /api/components/export?tag=<tag>`
  returns ONE `*.kit.json` (`format:"bizbeecms.kit"`, name from the tag, a
  `components: PortableComponent[]` array built from every component carrying that
  tag — reuse the existing per-component portable serialization + its asset/
  component-dep collection so nested deps come along).
- **Import a kit bundle** installs all its components in one step via the EXISTING
  kit-install trust boundary (each re-validated like a single import), tagged so
  the operator can see they came from the kit (reuse `sourceKit` or set the tag).
- Tags survive the export/import round-trip (carried in the portable envelope).
- Gate every slice: CMS `tsc` + `opennextjs-cloudflare build` green; regen the PM
  `cms-bundle`; EN/FI/ET for all new strings.

## Reference (current state, verified 2026-06-22)
- `CMS/src/db/schema.ts:30` `component` table — has `name`, `tree`, `script`, `css`,
  `propsSchema`, `sourceKit` (kit origin); NO tags column yet.
- `CMS/src/lib/components/portable.ts` — `PortableComponent` envelope +
  `parsePortableComponent` trust boundary; reuse for the kit bundle.
- `CMS/src/app/api/components/route.ts` — GET export-one / POST import-one.
- `CMS/src/app/api/components/kit/route.ts` — kit install (multi-component upsert
  with `sourceKit`); `lib/components/*-kit.ts` are the 5 premade kits.
- `CMS/src/db/component-store.ts` — `listComponents`, `listComponentsWithKit`,
  `getComponentByName`, `upsertImportedComponent(c, db?, sourceKit?)`,
  `upsertComponent`. Thread tags through these.
- UI: `app/admin/components/page.tsx` + `components/components/components-manager.tsx`
  (flat list + per-component Export, Import via upload/paste).
- `lib/components/grouped.ts` `groupComponentsByKit` — the rail grouping (could
  gain by-tag grouping).
