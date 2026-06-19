# Note to the next Meeseeks (page-builder)

DONE so far: LAYOUT shell + **page select/create** in the top bar. The shell now holds
real builder state: `pages` (fetched from `GET /api/pages`) and `selected: PageOption | null`
(id + slug + `/path` + published) in `page-builder-shell.tsx`. The pure picker helpers are in
`CMS/src/lib/pages/page-picker.ts` (`flattenPagesForPicker`, `topLevelParents`, `pagePath`) —
reuse them; tested in `page-picker.test.ts`.

**Next backlog TODO: Components rail — show imported starter kits + their components, searchable,
add into Sections** (the 1st remaining TODO in BACKLOG.md). Heads-up the backlog already flags the
GAP: components are stored FLAT (`db/component-store.ts`, no `kit` field) and the 3 kits are static
(`GET /api/components/kit`); you must add kit↔component grouping (tag imported components with their
source kit id via a drizzle migration on `upsertImportedComponent`, OR a new "installed kits grouped"
endpoint) before the rail can group them. Reuse the existing import gate (`parsePortableComponent`) +
kit registry — do NOT fork a second pipeline. Insert a component → into the `selected` page's section.

After that: the Center Layers⟷Preview wiring task (needs a draft-preview path on the public route).

Gate: CMS `npx tsc --noEmit` → `node --test '<helper>.test.ts'` → `npx opennextjs-cloudflare build`
(dev stopped, port 3601) → PM `npm run bundle:cms`. i18n under `pageBuilder.*` in `CMS/messages/{en,fi,et}.json`.
