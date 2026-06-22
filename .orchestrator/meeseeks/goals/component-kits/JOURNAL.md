# Journal — component-kits
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-06-22 12:22 — Slice 1: component tags schema + portable envelope round-trip
- **Status:** DONE
- **What I did:**
  - Added `tags text NOT NULL DEFAULT '[]'` to the `component` table (`db/schema.ts`),
    generated Drizzle migration `migrations/0007_tense_lady_vermin.sql` (+ snapshot,
    + `_journal.json`). Deployer auto-applies it per-Site via
    `wrangler d1 migrations apply DB --remote` (deployer/src/index.ts:498) — NO manual step.
  - New pure helper module `lib/components/tags.ts`: `normalizeTags` (trim/dedupe
    case-insensitive/drop empty+over-long/cap 50/sort), `parseTags` (read DB column,
    never throws), `serializeTags` (canonical JSON), `distinctTags` (union for the
    Slice-2 autocomplete/filter). ponytail: JSON-array column, no managed tag table.
  - Threaded tags through the `PortableComponent` envelope (`lib/components/portable.ts`):
    new top-level `tags: string[]` field; `serializeComponent` normalizes the DB
    column into it; `parsePortableComponent` RE-normalizes the untrusted envelope
    `b.tags` (trust boundary — never trust the bundle's spelling into the column).
    Added `tags` to `ComponentRow` (optional) + `ImportedComponent` (required).
  - Threaded tags through `component-store.ts`: select `tags` in `listComponents`
    + `getComponentByName`; `upsertImportedComponent` persists `serializeTags(c.tags)`.
    AI write path (`upsertComponent`) deliberately leaves tags untouched (preserves
    on update, DB default `[]` on insert).
  - Set `tags: []` in all 5 premade kit `bundle()` wrappers (now-required field).
  - Tests: new `lib/components/tags.test.ts` (6 cases) + 3 round-trip cases added to
    `scripts/components-export-import.test.mjs`. Updated `scripts/component-store.test.mjs`
    DDL to include the `tags` column.
  - Regenerated PM `cms-bundle` (`ProjectManager/src/lib/deploy/cms-bundle.generated.js`).
- **Verified:** CMS `tsc --noEmit` green; `npx opennextjs-cloudflare build` green;
  `npm test` 499/500 (the 1 fail is PRE-EXISTING + unrelated: the
  `ports-sole-reader.guard` test flags `lib/content/content-db.ts` from commit ce01b0d,
  the content-collections goal — confirmed failing on clean HEAD before my changes).
  No UI yet (Slice 2). No EN/FI/ET strings added this slice (no user-facing copy).
- **Files:** CMS/src/db/schema.ts, CMS/src/db/component-store.ts,
  CMS/src/lib/components/{tags.ts,tags.test.ts,portable.ts,blog-kit.ts,docs-kit.ts,
  landing-kit.ts,pricing-kit.ts,portfolio-kit.ts}, CMS/scripts/components-export-import.test.mjs,
  CMS/scripts/component-store.test.mjs, CMS/migrations/0007_tense_lady_vermin.sql,
  CMS/migrations/meta/{0007_snapshot.json,_journal.json},
  ProjectManager/src/lib/deploy/cms-bundle.generated.js

## 2026-06-22 12:35 — Slice 2: components admin UI — see/edit tags + filter by tag
- **Status:** DONE
- **What I did:**
  - `component-store.ts`: new `updateComponentTags(name, tags, db?)` — tags-only
    update (writes ONLY `serializeTags(tags)` to the `tags` column + `updatedAt`,
    keyed by name; artifact untouched). Returns `{updated, name, tags}`; `updated:false`
    if no row matches. Mirror of `upsertComponent` (which deliberately skips tags).
  - `lib/components/tags.ts`: new pure `filterByTag(components, tag)` — case-insensitive,
    empty/blank tag = no filter. Generic over row shape (works on UI summary rows).
  - `api/components/route.ts`: GET list now returns `tags: normalizeTags(r.tags)`.
    New `PATCH { name, tags }` (admin-guarded, trust boundary) → `updateComponentTags`;
    re-normalizes tags server-side; 400 missing name, 404 not found, 200 `{name, tags}`.
  - UI `components-manager.tsx`: `ComponentSummary` gained `tags: string[]`. Added a
    tag FILTER `<select>` (from `distinctTags`), a shared `<datalist id="component-tags">`
    autocomplete, per-component tag chips with an "×" remove + an add-tag `<input list>`
    (Enter to add). Optimistic state update synced to the server's canonical tags via
    `saveTags`. Design-system purpose tokens only.
  - `app/admin/components/page.tsx`: passes `tags: normalizeTags(r.tags)` to the manager.
  - i18n: 6 new `components` keys (`filterByTag`, `filterAllTags`, `noneForTag`,
    `addTagPlaceholder`, `addTagFor`, `removeTag`) in en/fi/et.
  - Tests: `filterByTag` case in `tags.test.ts`; two `updateComponentTags` cases in
    `scripts/component-store.test.mjs` (tags-only write + missing-name).
  - Regenerated PM `cms-bundle.generated.js`.
- **Verified:** `node --test tags.test.ts component-store.test.mjs` 17/17 green;
  CMS `tsc --noEmit` clean; `npx opennextjs-cloudflare build` green; cms-bundle regen OK.
  No native confirm()/alert() (× button removes inline). Did NOT touch other worker's
  PM files (pm-roles: migrations/schema/scope.*) — staged only my cms-bundle in PM.
- **Files:** CMS/src/db/component-store.ts, CMS/src/lib/components/{tags.ts,tags.test.ts},
  CMS/src/app/api/components/route.ts, CMS/src/components/components/components-manager.tsx,
  CMS/src/app/admin/components/page.tsx, CMS/messages/{en,fi,et}.json,
  CMS/scripts/component-store.test.mjs, ProjectManager/src/lib/deploy/cms-bundle.generated.js

## 2026-06-22 13:33 — Slice 3: export by tag → ONE kit bundle
- **Status:** DONE
- **What I did:**
  - `lib/components/portable.ts`: new `KIT_FORMAT="bizbeecms.kit"` + `KIT_VERSION=1`,
    `KitBundle` interface, and pure `buildKitBundle(rows, tag, meta?)`. It REUSES
    `serializeComponent` per row (each component keeps its own envelope + asset/
    component deps + tags) and unions+dedupes deps across the kit: `assets` = sorted
    union of every component's `/media/<key>` deps; `componentDeps` = sorted union of
    nested-component deps MINUS any satisfied within the same kit (so only EXTERNAL
    deps the target Site must already have remain). No second serialization path.
  - New route `app/api/components/export/route.ts`: `GET ?tag=<tag>` (admin-gated,
    force-dynamic) → `listComponents()` → `filterByTag` → `buildKitBundle` → a single
    `*.kit.json` with a `Content-Disposition` attachment filename (safe slug of the
    tag). 400 missing tag, 404 no components for tag. Read-only (output, not input —
    no trust boundary; import re-validation is Slice 4).
  - UI `components-manager.tsx`: an "Export kit" button next to the tag FILTER select.
    Exports the currently-selected tag (disabled until a tag is picked; title hint).
    Reuses the existing `<a download>` Blob pattern (`exportKit`).
  - i18n: 2 new `components` keys (`exportKit`, `exportKitPickTag`) in en/fi/et.
  - Tests: new `scripts/build-kit-bundle.test.mjs` (5 cases: envelope shape + reused
    component envelope, asset dedupe, in-kit vs external componentDep, empty kit, meta).
  - Regenerated PM `cms-bundle.generated.js` (its build:cms runs the CMS opennext
    build internally → that's the opennext gate; export route present in manifest).
- **Verified:** `node --test build-kit-bundle.test.mjs components-export-import.test.mjs`
  26/26 green; CMS `tsc --noEmit` clean; `npm run bundle:cms` (runs opennext build) green;
  `.open-next/.../app/api/components/export/` present in build output. No native
  confirm()/alert(). Did NOT touch the parallel pm-roles/CMS-ports worker's files;
  my only PM file is cms-bundle.generated.js.
- **Files:** CMS/src/lib/components/portable.ts,
  CMS/src/app/api/components/export/route.ts,
  CMS/src/components/components/components-manager.tsx,
  CMS/messages/{en,fi,et}.json, CMS/scripts/build-kit-bundle.test.mjs,
  ProjectManager/src/lib/deploy/cms-bundle.generated.js
