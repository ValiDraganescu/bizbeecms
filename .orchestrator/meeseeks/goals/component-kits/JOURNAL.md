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

## 2026-06-22 13:38 — Slice 4: import a kit bundle (multi-component, one step)
- **Status:** DONE
- **What I did:**
  - Added pure `parseKitBundle(raw)` trust helper to `lib/components/portable.ts`:
    validates the `bizbeecms.kit` envelope (format/version + `components` is an array
    → a bad envelope fails the WHOLE bundle), then runs EACH element through the
    EXISTING `parsePortableComponent` per-component trust boundary (never bypassed).
    PARTIAL-TOLERANT (mirrors single-import's skip posture): a component that fails
    validation is recorded in `errors` ("component #i (name): …") and SKIPPED; valid
    ones returned ready to upsert. Returns `{ok,name,tag,components,assets,
    componentDeps,errors}` — assets unioned/deduped, in-kit componentDeps dropped
    (only external remain). Accepts a JSON string or object.
  - Wired into the import path: `/api/components` POST now detects a `format===
    "bizbeecms.kit"` envelope and routes to a new `importKit()` that upserts EACH valid
    component via `upsertImportedComponent(c, undefined, kitName)` so `sourceKit`
    groups them in the rail (mirrors `api/components/kit/route.ts`'s loop). Single-
    component import path unchanged. Returns `{kit,installed,created,updated,skipped,
    assets,missingComponents}`.
  - UI (`components-manager.tsx`): `importBundle` detects the kit response shape and
    reports `kitImported {kit,created,updated}` + `kitSkipped {count}` if any failed.
    The existing paste/upload box auto-handles `.kit.json` (no new control needed).
  - i18n: +2 keys `kitImported`/`kitSkipped` in EN/FI/ET.
- **Verified:**
  - New `scripts/parse-kit-bundle.test.mjs` (8 tests): good round-trip, JSON string,
    dep union/dedupe + in-kit drop, bad format/version/non-array envelope, ONE bad
    component skipped (rest install), non-object rejected. All pass.
  - `npx tsc --noEmit` clean. Full `npm test` = 601/601 pass (the previously-noted
    `ports-sole-reader.guard` failure was NOT failing this run).
  - `npm run bundle:cms` (from ProjectManager/) = opennext build green + cms-bundle
    regenerated (7170 KB, builtAt 2026-06-22T10:38:32Z).
- **Files:** CMS/src/lib/components/portable.ts,
  CMS/src/app/api/components/route.ts,
  CMS/src/components/components/components-manager.tsx,
  CMS/messages/{en,fi,et}.json, CMS/scripts/parse-kit-bundle.test.mjs,
  ProjectManager/src/lib/deploy/cms-bundle.generated.js

## 2026-06-26 08:40 — Slice 5: page-builder rail grouping by tag
- **Status:** DONE
- **What I did:**
  - `lib/components/grouped.ts`: new pure `groupComponentsByTag(components)` +
    `NamedTaggedComponent`/`TagGroup` types. Groups flat components by their operator
    `tags` (a component with N tags appears in N groups — overlap is the point),
    tag groups sorted alphabetically, an untagged bucket (`kit:null`) always last and
    only when present, names sorted. REUSES the existing `ComponentGroup` shape so the
    rail's `filterGroups` + render path work unchanged (the `kit` field carries the tag).
    Blank/whitespace tags treated as untagged.
  - `db/component-store.ts`: `listComponentsWithKit` now also selects + `parseTags`
    the `tags` column; `NamedKitComponent` gained `tags: string[]` (feeds BOTH
    groupings). Imported `parseTags` alongside `serializeTags`.
  - `app/api/components/grouped/route.ts`: returns `{ groups, tagGroups }`
    (`groupComponentsByKit` + `groupComponentsByTag`).
  - Rail UI (`page-builder-shell.tsx`): new `groupBy: "kit"|"tag"` state + `tagGroups`
    state; fetch captures both; `ComponentsRail` got `groupBy`/`onGroupByChange` props
    and a Kit/Tag segmented toggle in the COMPONENTS header (aria-pressed, design-system
    tokens). `groupLabel` returns the tag itself in tag mode (null → `tagUntagged`).
  - i18n: 4 new `pageBuilder` keys (`groupByLabel/groupByKit/groupByTag/tagUntagged`)
    in en/fi/et.
  - Tests: 4 cases appended to `lib/components/grouped.test.ts` (alpha order + overlap +
    untagged-last, no-untagged-group, blank-tags-ignored, empty input).
- **Verified:** `node --test grouped.test.ts` 8/8 green; CMS `tsc --noEmit` clean;
  `npm run bundle:cms` (from ProjectManager/, runs opennext build internally) green +
  cms-bundle regenerated (8278 KB, builtAt 2026-06-26T05:40:53Z). No native confirm/alert.
  Impeccable `broken-image` finding (L~1650) is a PRE-EXISTING doc-comment in the
  unrelated `MetaImagePicker` ("native <img>"), not a real tag — false positive, untouched.
- **Files:** CMS/src/lib/components/grouped.ts, CMS/src/lib/components/grouped.test.ts,
  CMS/src/db/component-store.ts, CMS/src/app/api/components/grouped/route.ts,
  CMS/src/components/page-builder/page-builder-shell.tsx, CMS/messages/{en,fi,et}.json,
  ProjectManager/src/lib/deploy/cms-bundle.generated.js

## 2026-06-26 08:46 — Slice 6: preview a kit's contents before install
- **Status:** DONE
- **What I did:** Added preview-before-install for kit bundles. Pure `summarizeKitBundle(raw, existingNames)` in `portable.ts` (reuses `parseKitBundle` — same trust boundary — and folds in the Site's existing component names so each row is create-vs-update; unions tags; narrows external component deps to the ones the Site is actually missing; surfaces asset deps + skipped-validation count). New read-only `POST /api/components/preview` route (kit envelope only; no D1 write; reads existing names via `listComponentNames`). UI (`components-manager.tsx`): a "Preview kit" button appears when the paste is a `bizbeecms.kit`, opens a panel listing each component with new/updates + tags, missing deps, asset count, skipped count, and a Confirm-install (runs the existing gated `importBundle`) / Cancel. Editing the paste or importing clears the preview.
- **Verified:** `node --test summarize-kit-bundle.test.mjs` 4/4; full `npm test` 951/951; `npx tsc --noEmit` clean; `npm run bundle:cms` (opennext gate) green + cms-bundle regenerated. Could not verify live D1 (needs a real binding — HITL).
- **Files:** CMS/src/lib/components/portable.ts, CMS/src/app/api/components/preview/route.ts, CMS/src/components/components/components-manager.tsx, CMS/messages/{en,fi,et}.json, CMS/scripts/summarize-kit-bundle.test.mjs, ProjectManager/src/lib/deploy/cms-bundle.generated.js

## 2026-06-26 08:48 — Slice 7: uploaded kits get the preview flow
- **Status:** DONE
- **What I did:** `onFile` in `components-manager.tsx` no longer imports a dropped
  bundle blind — it loads the file text into the paste box (`setPaste(text)` + clear
  preview/error/notice). The existing Preview (gated on `isKitBundle`) + Import
  buttons then apply uniformly to pasted AND uploaded bundles, so an uploaded kit
  gets the same Preview-before-install affordance as a pasted one. No new copy.
- **Verified:** CMS `tsc --noEmit` clean; `npm run bundle:cms` (opennext build gate)
  green + cms-bundle regenerated. UI-only behavioral glue (no new pure logic) — no
  new test; existing preview/import path tests cover the logic this routes into.
- **Files:** CMS/src/components/components/components-manager.tsx,
  ProjectManager/src/lib/deploy/cms-bundle.generated.js

## 2026-06-26 08:52 — Slice 8: surface per-component kit-install results
- **Status:** DONE
- **What I did:** Closed the loop NEXT.md flagged. Both kit paths (paste/upload
  import via `/api/components` POST→importKit, AND starter-kit install via
  `/api/components/kit` POST) ALREADY returned `installed[]` ({name, action}) +
  (for the import path) `skipped[]` reasons — but the UI only showed count notices.
  Added a `kitResult` state and a per-component result panel that renders each
  installed component with a created/updated chip (success token for created) and
  lists any skipped components with their validation reason. Wired both handlers to
  populate `kitResult` (starter kits never skip → empty skipped, rendered uniformly)
  and reset it at the start of each import/install. 4 i18n keys EN/FI/ET
  (kitResultTitle, resultCreated, resultUpdated, resultSkippedTitle).
- **Verified:** CMS `tsc --noEmit` clean; `npm run bundle:cms` (opennext build gate)
  green + PM cms-bundle regenerated; all 3 message JSONs parse. UI-only render over
  data the routes already return (no new branch/parser logic) — no new test per
  ponytail; existing kit-route/import/preview tests cover the routed data.
- **Files:** CMS/src/components/components/components-manager.tsx,
  CMS/messages/{en,fi,et}.json, ProjectManager/src/lib/deploy/cms-bundle.generated.js
