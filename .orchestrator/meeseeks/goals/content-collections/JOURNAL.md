# Journal — content-collections
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-06-22 11:34 — Slice 0: runtime-DDL/DML SAFETY fence + content-DB module
- **Status:** DONE
- **What I did:** Built the keystone safety layer. Two new modules under
  `CMS/src/lib/content/`:
  - `fence.ts` — PURE validators (no I/O): `isContentName` (`^content_[a-z0-9_]+$`),
    `isBuiltinName` (denylist component/page/page_version/site_settings/asset/
    chat_thread/collection/d1_migrations + `sqlite_*`), and `validateStatement(sql,
    mode)` / `assertStatement`. The statement guard PARSES (tokenizes) not regexes:
    strips single-quote string literals + `--`/`/* */` comments, splits on `;` and
    REJECTS multi-statement, unwraps quoted/bracket/backtick identifiers so a quoted
    built-in (`"page"`, `[page]`, `` `page` ``) can't slip past, blocks PRAGMA/ATTACH/
    DETACH/VACUUM/BEGIN/COMMIT/TRIGGER/etc, enforces verb-per-mode (read=SELECT only,
    write=CREATE/ALTER/DROP/INSERT/UPDATE/DELETE), rejects any built-in ref, and
    REQUIRES at least one content_* target.
  - `content-db.ts` — the ONLY place runtime SQL touches D1: `contentSelect`
    (param SELECT, MAX_READ_ROWS=1000 backstop), `contentWrite` (param DML), `contentDdl`
    (system-gen DDL via `exec`). Each calls `assertStatement` BEFORE any D1 call.
    Takes an injectable `D1Like` for testing; resolves `env.DB` directly (the
    controlled narrow widening — Drizzle port stays Drizzle-only for built-ins).
  - NO collection CRUD, NO registry table yet — just the fence + its tests.
- **Verified:** `scripts/content-fence.test.mjs` — 14 tests incl. attack corpus
  (multi-statement `; DROP TABLE page`, quoted/bracket/backtick built-in refs,
  comment-hidden tricks, PRAGMA/ATTACH escapes, wrong-verb-for-mode, no-content-target)
  all PASS. `npx tsc --noEmit` green. `npx opennextjs-cloudflare build` green (exit 0,
  no errors; dev server confirmed down first). No new UI strings → no i18n/cms-bundle work.
- **Files:** CMS/src/lib/content/fence.ts, CMS/src/lib/content/content-db.ts,
  CMS/scripts/content-fence.test.mjs

## 2026-06-22 12:29 — BUG [P2]: ports-sole-reader.guard fails on content-db.ts
- **Status:** DONE
- **What I did:** Slice 0's `content-db.ts` legitimately reads `env.DB` (line 39,
  the fenced runtime-SQL widening), which tripped the binding-adapters sole-reader
  guard (it allowlisted only `lib/ports/`). Sanctioned content-db.ts WITHOUT
  blunting the invariant:
  - Added `ALLOWLIST_FILES` (a Set keyed by EXACT path, not a directory) +
    `isAllowlisted(file)` helper; the violation scan now skips ports OR a
    sanctioned exact-path file. Documented WHY in a new "SANCTIONED SECOND READER"
    header note.
  - Added a NEW assertion: the sanctioned fence file must contain EXACTLY ONE
    binding read — so the exception stays narrow (a 2nd read inside content-db.ts,
    or any other stray reader anywhere, still flips the guard red). The invariant
    stays load-bearing, not a blank check.
- **Verified:** `node --test scripts/ports-sole-reader.guard.test.mjs` → 4/4 pass.
  `npm test` (full CMS suite) → **505/505 green** (was 499/500). Test-only change
  (no TS source / runtime code touched) → no tsc/opennext build or i18n needed.
- **Files:** CMS/scripts/ports-sole-reader.guard.test.mjs

## 2026-06-22 12:52 — Slice 1: collection registry + field-schema → DDL generator
- **Status:** DONE
- **What I did:** Added the built-in `collection` registry table + the PURE DDL
  generator (no execution yet — Slice 2 wires it to the fence).
  - `CMS/src/db/schema.ts` — new `collection` table (id, name, tableName, schema
    JSON, created/updated_at) + unique index on table_name + Collection/NewCollection
    types. `collection` was ALREADY on the fence denylist.
  - `CMS/migrations/0010_light_emma_frost.sql` (+ meta snapshot/journal) via
    `npx drizzle-kit generate` — deployer applies per-Site.
  - `CMS/src/lib/content/collection-schema.ts` — PURE: field-type vocab
    `CollectionFieldType` (propsSchema set string/richtext/number/select/date +
    data extensions text/int/bool/boolean/datetime/multiselect; ref/asset RESERVED
    for binding, stored TEXT); `affinityFor` (→TEXT/INTEGER/REAL); `buildItemColumns`
    (6 system cols id/slug/status/archived_at/created_at/updated_at first, then user
    fields); `buildCreateTableSql`; `buildAddColumnSql` (ADD-ONLY v1); `tableNameForSlug`.
    Strict column-name charset `^[a-z][a-z0-9_]*$`, system-column collision guard,
    quote-escaped typed DEFAULT literals, MAX_COLUMNS=100 cap.
- **Verified:** `node --test scripts/collection-schema.test.mjs` 13/13 (both content
  suites = 27/27). KEY assertion: every generated CREATE/ALTER passes
  `validateStatement(sql,"write")` AND targets content_*; injection-in-DEFAULT can't
  break the fence; 100-col cap; bad names/dups/unknown-types rejected. `npx tsc
  --noEmit` clean; `npx opennextjs-cloudflare build` green (dev was down).
- **Files:** CMS/src/db/schema.ts, CMS/migrations/0010_light_emma_frost.sql,
  CMS/migrations/meta/0010_snapshot.json, CMS/migrations/meta/_journal.json,
  CMS/src/lib/content/collection-schema.ts, CMS/scripts/collection-schema.test.mjs

## 2026-06-22 13:08 — Slice 2: create/list/describe collections at runtime (DDL execution)
- **Status:** DONE
- **What I did:** Wired the registry + DDL generator into real runtime effects.
  - `CMS/src/lib/content/collection-plan.ts` (PURE planner) — `planCreate`
    (enforces MAX_COLLECTIONS=100 cap against registry count, derives
    `content_<slug>` via `tableNameForSlug`, rejects name-collision 409 +
    slugless/empty name 400, surfaces generator errors as 400, returns the
    fence-safe CREATE DDL) + `planAddField` (ADD-ONLY: dup-field 409, system-clash
    400, column-cap 409, returns the ALTER DDL + merged field list) +
    `normalizeField`/`normalizeFields` (coerce untrusted JSON → clean
    CollectionField[], drop junk). All decisions live here, node-tested.
  - `CMS/src/db/collection-store.ts` (live I/O) — `listCollections`/`getCollection`
    (Drizzle reads of the `collection` registry, schema JSON parsed),
    `createCollection` (count+collision read → `contentDdl(createSql)` FIRST →
    insert registry row; unique-index race → 409), `addCollectionField`
    (`contentDdl(alterSql)` → update schema JSON), `deleteCollection`
    (`contentDdl("DROP TABLE content_x")` → delete row). ALL DDL via `contentDdl`
    (the Slice-0 fence) — never raw d1.
  - `CMS/src/app/api/collections/route.ts` — GET (list) + POST (create), Admin-gated.
  - `CMS/src/app/api/collections/[name]/route.ts` — GET (describe) + PATCH
    (add-field) + DELETE (drop), Admin-gated, Next15 async params. `[name]` = the
    `content_<slug>` table name.
- **Verified:** `node --test` 36/36 (10 new planner tests: create→content_<slug>+
  fence-safe DDL, cap-409, collision-409, slugless-400, generator-error-400,
  add-field fence-safe ALTER+merge, dup-409, system-clash-400, normalize). Every
  generated CREATE/ALTER asserted to PASS `validateStatement(_, "write")`. `npx
  tsc --noEmit` clean. `npx opennextjs-cloudflare build` green (dev down); both
  `/api/collections` + `/api/collections/[name]` in the route manifest. Live D1
  writes are build-verified only (HITL — needs a real binding).
- **Files:** CMS/src/lib/content/collection-plan.ts, CMS/src/db/collection-store.ts,
  CMS/src/app/api/collections/route.ts, CMS/src/app/api/collections/[name]/route.ts,
  CMS/scripts/collection-plan.test.mjs

## 2026-06-22 13:14 — Slice 3: collection ITEMS CRUD (structured, validated)
- **Status:** DONE
- **What I did:** Built the items write/read path on Slice 2's split (PURE
  builders/validators + thin live store + routes).
  - `CMS/src/lib/content/item-write.ts` (PURE) — `coerceFieldValue` validates +
    COERCES each value by registry field type (bool→0/1, int→trunc, number→REAL,
    date/datetime/time→ISO TEXT accepting ISO str OR epoch-ms, select→must match
    declared options, multiselect→allowed-values JSON array TEXT, string/text/
    richtext/ref/asset→String; required rejects null/undefined/empty) + `coerceStatus`
    (default 'draft', enum draft|published). Parameterized builders: `buildInsert`
    (system cols id(uuid)/slug/status/archived_at NULL/created_at/updated_at + user
    cols, `?` placeholders), `buildUpdate` (PATCH — only supplied keys, always sets
    updated_at, id bound last, 400 on empty), `buildArchive`/`buildUnarchive`
    (archived_at=now / NULL), `buildDelete`, `buildGet`, `buildList` (simple:
    live|archived|all + status filter bound + capped LIMIT, newest first). Uses
    EXACTLY the Slice-1 SYSTEM_COLUMNS (asserted at module load).
  - `CMS/src/db/item-store.ts` (live I/O) — loads the registry schema via
    `getCollection`, runs builders → `contentSelect`/`contentWrite` (Slice-0 fence),
    returns `PlanResult<T>`; create/update re-fetch the row, write ops 404 on 0 changes.
  - Routes: `app/api/collections/[name]/items/route.ts` (GET list w/ status/archived/
    limit query params; POST create → 201) + `.../items/[id]/route.ts` (GET; PATCH
    {changes} or {_op:"archive"|"unarchive"}; DELETE). Admin-gated, Next15 async params.
- **Verified:** `node --test scripts/item-write.test.mjs` 12/12; full content suite
  48/48 (item-write + collection-plan + collection-schema + content-fence). KEY
  assertions: every built INSERT/UPDATE/archive/delete passes `validateStatement(_,
  "write")`, GET/list pass read mode, placeholder count === params length, user
  values are NEVER inlined (e.g. "Hello"/"DROP TABLE" absent from SQL). `npx tsc
  --noEmit` clean. `npx opennextjs-cloudflare build` green (dev confirmed down);
  both new routes in app-paths-manifest. Live D1 writes are HITL (need a real binding).
- **Files:** CMS/src/lib/content/item-write.ts, CMS/src/db/item-store.ts,
  CMS/src/app/api/collections/[name]/items/route.ts,
  CMS/src/app/api/collections/[name]/items/[id]/route.ts,
  CMS/scripts/item-write.test.mjs

## 2026-06-22 13:19 — Slice 4: structured query API
- **Status:** DONE
- **What I did:** Built the READ trust boundary. PURE `lib/content/query-compiler.ts` — `compileQuery`/`compileCount` turn a `QuerySpec` (filters[] field:op:value, sort[], search, limit/offset, status, archived) into a SAFE PARAMETERIZED SELECT/COUNT over typed columns. Column NAMES whitelisted against registry fields + SYSTEM_COLUMNS (unknown → 400, never inlined/bound); ops whitelisted (eq/ne/lt/lte/gt/gte/like/in/is_null/not_null); EVERY value coerced via Slice-3 `coerceFieldValue` then `?`-bound; LIKE/search `%`-wrap the BOUND param; text search = LIKE over text-affinity fields (NO FTS5, USER DECISION); limit clamped [1,1000], offset ≥0 inlined as plain ints. Thin live store `db/query-store.ts` (`queryCollection` → `getCollection` + `contentSelect` for items + count → `{items,total,limit,offset}`). Route `app/api/collections/[name]/query/route.ts` (GET, Admin-gated, Next15 async params; parses repeatable ?filter/?sort + ?search/?limit/?offset/?status/?archived). 19 node tests assert fence-pass + placeholders===params + no value inlined + 400s for unknown col/op/dir/value/status.
- **Verified:** `node --test` 67/67 (48 prior + 19 new); `npx tsc --noEmit` clean; `npx opennextjs-cloudflare build` green; query route present in `.next/server/app/api/collections/[name]/query/route.js`. Live D1 = HITL (compiler is node-tested with fakes). No user strings → no cms-bundle/i18n this slice.
- **Files:** CMS/src/lib/content/query-compiler.ts, CMS/src/db/query-store.ts, CMS/src/app/api/collections/[name]/query/route.ts, CMS/scripts/query-compiler.test.mjs

## 2026-06-22 13:28 — Slice 5: collections admin UI + rich item editor
- **Status:** DONE
- **What I did:** Built the NON-AI admin surface for collections under
  `CMS/src/app/admin/collections/`. Index page lists collections + a schema editor
  (create with a field-type picker over the Slice-1 `COLLECTION_FIELD_TYPES` vocab,
  required toggle, comma-separated options for select/multiselect; delete behind an
  in-app confirm modal). Detail page (`[name]` = content_<slug> table name) is a
  per-collection item manager: item table, create/edit forms with the CORRECT input
  per type, a text-search box + sort picker + live/archived/all filter wired to the
  Slice-4 `GET .../[name]/query` route, archive/unarchive via `PATCH {_op}`, delete
  + add-field (ADD-ONLY) via the existing routes. Reusable `field-input.tsx` renders
  native date/datetime-local/time, number, select, bool checkbox, multiselect
  checkbox-list, textarea for text/richtext (emits the Slice-3 coercion value
  shapes; omits "" on create so column DEFAULTs apply). `confirm-modal.tsx` is a
  plain in-app overlay — NO native confirm()/alert(). Added `collections` to
  ADMIN_SECTIONS. FIRST slice with user strings → added the full EN/FI/ET
  `collections` namespace + `adminNav.collections`/`desc.collections`, then regen'd
  the PM `cms-bundle`.
- **Verified:** `npx tsc --noEmit` 0 errors; `node --test` 67 content tests pass;
  `npx opennextjs-cloudflare build` green with both new pages
  (`/admin/collections`, `/admin/collections/[name]`) in the route manifest;
  `npm run bundle:cms` regenerated `cms-bundle.generated.js` (7120 KB) and the new
  strings ("New collection"/"Manage content") are present in it. Could NOT exercise
  live CRUD — needs a real D1 binding (HITL); pages render an empty list / offline
  notice without one.
- **Files:** CMS/src/app/admin/collections/{page.tsx,[name]/page.tsx},
  CMS/src/components/content/{collections-manager,collection-items,field-input,confirm-modal}.tsx,
  CMS/src/components/admin-sections.ts, CMS/messages/{en,fi,et}.json,
  ProjectManager/src/lib/deploy/cms-bundle.generated.js.

## 2026-06-22 13:45 — Slice 6: AI assistant collection tools (structured only)
- **Status:** DONE
- **What I did:** Added the 5 structured collection tools to the existing CMS AI
  tool pipeline. PURE `CMS/src/lib/chat/collection-tools.ts` holds the tool schemas
  + arg validators (create_collection, add_collection_item, update_collection_item,
  archive_collection_item, query_collection) that coerce the model's args into the
  exact Slice 2-4 store shapes. Wired registry + handlers in
  `CMS/src/lib/chat/tool-dispatch.ts` (TOOL_BY_NAME + HANDLERS) calling
  `createCollection` / item-store CRUD / `queryCollection` directly — NO forked data
  path, NO raw SQL to the model. `archive_collection_item` op-switches
  archive|unarchive|delete (one combined tool). New `collections` context in
  `tool-scopes.ts` (KNOWN_TOOL_NAMES, KNOWN_CONTEXTS, TOOLS_BY_CONTEXT,
  CONTEXT_PROMPTS) so the assistant on /admin/collections is auto-scoped. Chat route
  needed NO edits (it auto-derives schemas + dispatch from the registry).
- **Verified:** `node --test` 11 new tests (arg-shaping/rejection per tool) pass;
  tool-dispatch + tool-scopes tests still green (registry coverage holds); 78
  content+tool tests total. `npx tsc --noEmit` clean. `npx opennextjs-cloudflare
  build` green. Could NOT exercise the live store calls (need a real D1 binding =
  HITL); the stores themselves were build-verified in Slices 2-4.
- **Files:** CMS/src/lib/chat/collection-tools.ts (new),
  CMS/src/lib/chat/tool-dispatch.ts, CMS/src/lib/chat/tool-scopes.ts,
  CMS/scripts/collection-tools.test.mjs (new).

## 2026-06-22 13:51 — P2-bind Slice A: block `bindings` model + hydrate-before-walk seam
- **Status:** DONE
- **What I did:** Added SINGLE-ITEM (first-match) component↔collection binding,
  hydrate-before-walk. (1) `tree.ts`: new `BindingRef` type + optional
  `bindings?: Record<string,BindingRef>` on `Block`, SEPARATE from `props`
  (`{ source:{collection,filter?,sort?}, map:{propName→fieldName} }`). (2) New PURE
  `lib/content/binding.ts`: `validateBinding` (collection exists / mapped+filter+sort
  fields exist as user-field OR system-column / mapped prop declared on the target
  component → ok|errors[]), `bindingQuerySpec` (→ first-match QuerySpec, limit 1),
  `hydrateProps` (copy row[field]→props[prop], binding OVERWRITES static prop when it
  resolves, unresolved/absent → graceful blank, never throws), `declaredPropNames`
  (propsSchema → allowlist set, exported so binding validator doesn't reach into the
  renderer). (3) `render-page.tsx`: `buildPlanFromPage` now `await hydrateBlockBindings(blocks)`
  BEFORE `planPage` — recursive walk, runs each binding's first-match `queryCollection`
  (Slice-4, limit 1) in parallel, hydrates via the pure `hydrateProps`; `planPage`/
  `planTree` stay PURE+SYNC. Graceful: query error/empty → that prop stays blank.
- **Verified:** node --test scripts/binding.test.mjs (15) + full content+render suite
  (129) green; `npx tsc --noEmit` clean; `npx opennextjs-cloudflare build` green (dev
  server confirmed down first). Live D1 = HITL (queryCollection is build-verified).
  Renderer logic only, NO new user strings → NO cms-bundle regen (per CAVEATS Slice 6
  rule). Stayed OUT of CMS/src/app/mcp/** + lib/chat/** (parallel worker's scope).
- **Files:** CMS/src/lib/render/tree.ts, CMS/src/lib/render/render-page.tsx,
  CMS/src/lib/content/binding.ts (new), CMS/scripts/binding.test.mjs (new).

## 2026-06-22 13:57 — P2-bind Slice B: built-in `List` block + per-row stamp
- **Status:** DONE
- **What I did:** Added the built-in `List` collection-repeater block, modeled
  EXACTLY on the Section primitive (special-cased in the renderer, NOT a user
  component).
  - `lib/render/tree.ts`: `LIST_COMPONENT = "List"` + `BUILTIN_COMPONENTS`
    array + `isBuiltinComponent()`. New `Block` fields (List-only): `listSource`
    (collection + filter/sort/limit query), `listMap` (rowField→templateProp),
    `listRows` (rows hydrated by the host — NOT authored), `listRole`
    ("template"|"empty"). PURE `planList` (dispatched from `planBlock` like
    `planSection`): partitions children into template vs empty-state, stamps the
    template once per row via `stampRow` (clones the subtree, injects mapped row
    fields into each block's `props`; `planBlock`/`bindTree` then gate them by the
    component's declared propsSchema allowlist). Empty/dead/un-hydrated → the
    empty-state slot if authored, else nothing. Renders `<div data-list={id}>`.
  - `lib/render/render-page.tsx`: `buildPlanFromPage` now fetches List rows in the
    SAME hydrate-before-walk pass as Slice A (`hydrateBlockBindings`): for a List
    block with `listSource`, runs `queryCollection` and stashes `res.plan.items`
    onto `listRows` (graceful empty on error). `List` deleted from the component
    fetch set (built-in, no D1 row). `planPage`/`planTree` stay PURE+SYNC.
  - `lib/pages/page-blocks.ts`: the component-existence drop now loops
    `isBuiltinComponent` (covers Section/column/List) so a saved page with a List
    never 409s on missing-component.
- **Verified:** 10 new node tests (`scripts/list-block.test.mjs`): N rows→N
  stamped subtrees + mapped bind, empty→nothing, empty→empty-state slot,
  non-empty→no empty-state, listMap respects declared-prop allowlist (undeclared
  prop can't leak), missing field→graceful blank, un-hydrated→empty container,
  unknown template→hidden placeholder. Full suite 165 (binding/query/item/
  collection*/content-fence/render-tree/list-block/page-blocks). `tsc --noEmit`
  0; `npx opennextjs-cloudflare build` green (dev server down). NO user strings →
  NO cms-bundle regen. Live D1 = HITL.
- **Files:** CMS/src/lib/render/tree.ts, CMS/src/lib/render/render-page.tsx,
  CMS/src/lib/pages/page-blocks.ts, CMS/scripts/list-block.test.mjs

## 2026-06-22 14:11 — P2-bind Slice C — operator UI to author bindings + List blocks
- **Status:** DONE
- **What I did:** Page-builder operator UI for Phase-2 binding (Slices A/B model).
  PURE helpers (lib/pages/page-blocks.ts): `isList`, `addListBlock`/`addListToSection`
  (insert a built-in List into a Section column like addComponentToSection),
  `setBlockField` (set/clear NON-prop block fields bindings/listSource/listMap/listRole,
  tree-walk, undefined deletes), `setBlockChildren` (replace a List's template/empty
  children). `lib/content/binding.ts`: `validateListBinding` (analog to validateBinding:
  collection/filter/sort/mapped-field exist [user OR system col] + mapped prop declared
  on the template). UI (page-builder-shell.tsx): a `/api/collections` fetch (graceful —
  403 non-admin / offline → empty list → "no collections"); a rail "List (from
  collection)" insert button (click-insert into the selected/last Section's first
  column); the Block tab now branches — a List block → `ListSettings` (collection +
  filter/sort/limit via a reusable `QueryBuilder` + a template-component `<select>` that
  sets the List's single template child + field→prop map), a NORMAL block →
  `ComponentSettings` + a new `BindingPanel` (single-item binding under key "item":
  collection + first-match query + declaredProp→field map). All authoring is graceful
  (the renderer skips anything unresolved, never 500). EN/FI/ET: `pageBuilder.layoutList`
  + `bind.*` + `list.*`; cms-bundle regen (Slice C adds UI strings).
- **Verified:** `node --test scripts/binding-ui.test.mjs` 11 pass; full content+render
  suite 176 pass (165 + 11 new). `npx tsc --noEmit` 0. `npx opennextjs-cloudflare build`
  green (dev server confirmed DOWN first). `npm run bundle:cms` from ProjectManager/ →
  bundle carries the new strings ("Bind to collection" found in cms-bundle.generated.js).
  COULD NOT verify the live visual flow / live D1 binding (HITL — no CF binding locally).
- **Files:** CMS/src/lib/pages/page-blocks.ts, CMS/src/lib/content/binding.ts,
  CMS/src/components/page-builder/page-builder-shell.tsx, CMS/messages/{en,fi,et}.json,
  CMS/scripts/binding-ui.test.mjs, ProjectManager/src/lib/deploy/cms-bundle.generated.js

## 2026-06-22 14:19 — P2-bind Slice D: AI tools for binding (bind_component / create_list / bind_list)
- **Status:** DONE (code + tests; shared opennext build gate blocked by a PARALLEL worker's
  in-flight file, see Verified)
- **What I did:** Added the three AI binding tools so the assistant authors the SAME
  bindings the operator UI (Slice C) does — no forked data path, no raw SQL to the model.
  - PURE `CMS/src/lib/chat/binding-tools.ts`: 3 tool schemas + arg validators
    (`validateBindComponent`/`validateCreateList`/`validateBindList`) that shape the
    model's loose args into the page-blocks helper shapes (filter/sort/map/limit
    reused from collection-tools' pattern; FILTER_OPS-gated; no `@/` imports →
    node-testable). bind_component supports clear (omit collection → revert to static).
  - Wired into the shared registry like Slice 6: `tool-dispatch.ts` TOOL_BY_NAME +
    HANDLERS. Handlers MUTATE A PAGE's draft block tree (not a collection store):
    `getPageBlocks` → `findBlock` → validate via the SHARED `validateBinding`/
    `validateListBinding` (registry fields via `getCollection`, declared props via
    `getComponentByName`+`declaredPropNames`) → apply via Slice-C `setBlockField`/
    `addListToSection`/`setBlockChildren` → `validateBlocks` renderable gate →
    `setPageBlocks`. bind_component sets `bindings.item`; create_list inserts a List +
    stamps listSource/listMap + a `${listId}-tpl` template child; bind_list PATCH-merges
    config + can replace the template (preserving any empty-state child).
  - `tool-scopes.ts`: 3 names in KNOWN_TOOL_NAMES + added to page-builder & pages
    TOOLS_BY_CONTEXT (with query_collection for discovery) + extended both context prompts.
- **Verified:** `node --test scripts/binding-tools.test.mjs scripts/tool-scopes.test.mjs
  scripts/tool-dispatch.test.mjs` green (23+6); full binding/page-block/render/tool subset
  123/123 green; `npx tsc --noEmit` reports ZERO errors on MY files. The shared
  `opennextjs-cloudflare build` FAILS but ONLY on a PARALLEL worker's uncommitted file
  `src/app/api/invite/route.ts` (imports `canInviteRole` which doesn't exist yet in their
  in-flight guard.ts) — nothing in content-collections code. Build re-verifies once that
  lands. NO cms-bundle regen / NO EN/FI/ET (AI-tool descriptions are MODEL-facing, Slice-6
  rule). Live D1/visual = HITL.
- **Files:** CMS/src/lib/chat/binding-tools.ts (new),
  CMS/src/lib/chat/tool-dispatch.ts, CMS/src/lib/chat/tool-scopes.ts,
  CMS/scripts/binding-tools.test.mjs (new)

## 2026-06-22 14:29 — Phase-2 EXTRA: drop/rename-field schema-rebuild PLANNER (PURE)
- **Status:** DONE
- **What I did:** Built the PURE planner that v1's add-only schema evolution
  deferred. `lib/content/schema-rebuild.ts`: `planRebuild(schema, change)` →
  `PlanResult<RebuildPlan>` where a `drop`/`rename` of ONE user field emits the
  canonical safe table-rebuild as an ORDERED, fence-safe statement list:
  (1) `CREATE TABLE content_<slug>_new (...)` via the Slice-1 generator over the
  revised field list, (2) `INSERT INTO content_<slug>_new (newcols) SELECT
  (oldcols) FROM content_<slug>` (6 system cols verbatim + kept/renamed user cols,
  positional copy maps old→new on rename, omits the col on drop), (3) `DROP TABLE
  content_<slug>`, (4) `ALTER TABLE content_<slug>_new RENAME TO content_<slug>`.
  Plus the updated registry schema (`newSchema.fields`) to persist after success.
  Validation: non-content table→400, unknown field→404, system-column
  drop/rename→400, rename-to-system/existing→400/409, bad new name (charset/
  injection)→400, corrupted registry name in the kept set→400. EVERY emitted
  statement is asserted through `assertStatement(sql,"write")` inside the planner
  (don't trust "fence-safe by construction" — CAVEAT) → a generator slip is a 500.
- **Verified:** 16 new node tests in `scripts/schema-rebuild.test.mjs` all green
  (order, drop-omits-col, rename-maps-values, system cols carried, every stmt
  passes the fence for drop+rename incl. last-field-drop, content_* only, all
  rejection/attack paths incl. injection via field name). `npx tsc --noEmit` clean.
  Did NOT run opennextjs build / bundle:cms — task said pure planner + tests ONLY,
  and a parallel CMS worker owns the build + bundle regen (no user strings here).
- **Files:** CMS/src/lib/content/schema-rebuild.ts (new),
  CMS/scripts/schema-rebuild.test.mjs (new).

## 2026-06-24 14:48 — BUG [P1] fix: collection create failed (D1 exec newline-split)
- **Status:** DONE
- **What I did:** Fixed the P1 "Creating a collection fails — CREATE TABLE content_authors (: incomplete input" bug. ROOT CAUSE was the D1 exec boundary, not the pure DDL builders (those were correct and always emit the 6 system columns). `contentDdl` ran `d1.exec(sql)`; D1's `exec()` splits its input on newlines and runs each line as its own statement, so the multi-line generated `CREATE TABLE content_x (\n  col,\n ...\n)` got chopped — line 1 `CREATE TABLE content_x (` ran alone → "incomplete input". Changed `contentDdl` to run the single fenced statement via `d1.prepare(sql).run()` instead. Added a regression test that models exec()'s newline-splitting and feeds the EXACT reported repro DDL (collection Authors: name string req + bio richtext req) — fails-before (exec path throws), passes-after.
- **Verified:** `node --test scripts/content-fence.test.mjs` 15/15; reverted the fix → 2 contentDdl tests FAIL (confirmed regression catches it), restored. Full `npm test` 857/857 green. `npx tsc --noEmit` clean. `npx opennextjs-cloudflare build` green (dev was OFF). No new UI strings → no cms-bundle regen (per CAVEATS: only CMS UI copy triggers regen).
- **Files:** CMS/src/lib/content/content-db.ts, CMS/scripts/content-fence.test.mjs.

## 2026-06-24 11:55 — BUG [P2] fix: Collections nav item had no icon
- **Status:** DONE
- **What I did:** Fixed the last open bug. `admin-sidebar.tsx` defines an `IconKey`
  union + a `NavIcon` switch, but neither had a `"collections"` arm — while
  `ADMIN_SECTIONS` (admin-sections.ts) lists `{key:"collections"}`. So the Collections
  nav link rendered an empty icon slot (switch fell through to `undefined`). Added
  `"collections"` to the `IconKey` union and a `case "collections":` returning a
  stacked-cylinders database SVG drawn in the same `common` stroke style as the other
  nav icons (no lucide import). The `adminNav.collections` label already exists (Slice
  5) so no i18n change and no cms-bundle regen.
- **Verified:** `npx tsc --noEmit` clean; `npm test` 862/862 green; `npx
  opennextjs-cloudflare build` green (dev confirmed OFF first). No UI strings changed.
- **Files:** CMS/src/components/admin-sidebar.tsx.

## 2026-06-24 14:55 — Schema-rebuild LIVE store + drop/rename-field route
- **Status:** DONE
- **What I did:** Wired the already-PURE drop/rename planner (`schema-rebuild.ts`,
  `planRebuild`) into a live execution path so an operator/AI can DROP or RENAME a
  collection field (Phase-2, beyond v1 ADD-ONLY). Three pieces:
  (1) `content-db.ts`: new `contentDdlBatch(sqls, db?)` — fences EVERY statement
  (write mode) BEFORE any D1 call, then runs them as ONE `d1.batch()` (D1 has no
  nested TXN — a single batch is the atomic boundary; a partial failure rolls back,
  leaving the original table intact). Falls back to ordered `prepare().run()` when a
  binding/fake has no `batch()`. Also extracted a `D1PreparedLike` type + made
  `batch?` optional on `D1Like`.
  (2) `collection-store.ts`: new `rebuildCollectionSchema(tableName, change)` —
  load registry (404 if unknown) → `planRebuild` (maps !ok → its HTTP status) →
  `contentDdlBatch(plan.statements)` (CREATE temp → INSERT…SELECT → DROP old →
  RENAME new) → ONLY THEN UPDATE the registry schema JSON to `plan.newSchema.fields`.
  Mirrors the Slice-2 store shape (PURE planner decides, thin store executes).
  (3) `app/api/collections/[name]/route.ts` PATCH: added an `_op` control —
  `{_op:"drop_field",field}` / `{_op:"rename_field",field,to}` → rebuild; no `_op`
  (with `field`) stays the v1 add-field path. Admin-gated, `[name]` = content_<slug>.
- **Verified:** `npx tsc --noEmit` clean. `npm test` 864/864 (added 2 contentDdlBatch
  tests in content-fence.test.mjs: fences-every-statement-then-batches-in-order +
  bad-statement-aborts-before-any-D1-call + no-batch()-fallback-runs-in-order).
  `npx opennextjs-cloudflare build` green (dev confirmed OFF first). Live D1 = HITL
  (the rebuild batch needs a real binding). NO new UI strings + route/store/AI are
  not UI copy → NO cms-bundle regen (per CAVEATS).
- **Files:** CMS/src/lib/content/content-db.ts, CMS/src/db/collection-store.ts,
  CMS/src/app/api/collections/[name]/route.ts, CMS/scripts/content-fence.test.mjs.

## 2026-06-24 15:01 — AI tools: drop_collection_field + rename_collection_field
- **Status:** DONE
- **What I did:** Added the two schema-evolution AI tools that close the
  drop/rename slice's AI half (the LIVE store + REST `_op` path shipped 2026-06-24;
  this exposes them to the assistant). New tool schemas + pure arg validators
  `validateDropField`/`validateRenameField` in `collection-tools.ts`; wired into
  `tool-dispatch.ts` (TOOL_BY_NAME + handlers `handleDropCollectionField`/
  `handleRenameCollectionField` calling `rebuildCollectionSchema({op:"drop"|
  "rename",...})`) and `tool-scopes.ts` (KNOWN_TOOL_NAMES + the `collections`
  context + a sentence in the `collections` system prompt). Handlers reuse the
  shared store (NO forked path); the planner enforces system-col/unknown/collision
  rejections → mapped to recoverable `{ok:false,errors}` for the model.
- **Verified:** CMS tsc clean; `npm test` 877/877 (added 4 validator tests +
  registry-coverage auto-covers the 2 new names); `npx opennextjs-cloudflare build`
  green (dev OFF). Tool descriptions + system prompt are MODEL-facing, not UI copy
  → NO cms-bundle regen, NO EN/FI/ET (per Slice 6 CAVEAT).
- **Files:** CMS/src/lib/chat/collection-tools.ts, CMS/src/lib/chat/tool-dispatch.ts,
  CMS/src/lib/chat/tool-scopes.ts, CMS/scripts/collection-tools.test.mjs.

## 2026-06-24 15:28 — Drop/rename-field OPERATOR UI (closes the schema-evolution slice)
- **Status:** DONE
- **What I did:** Added the LAST piece of the drop/rename slice — the operator UI.
  New `SchemaManager` component in `collection-items.tsx` (toggled by a "Manage
  schema" toolbar button on the item-manager page): lists each user field
  (name+type) with RENAME (inline ConfirmModal + text input → PATCH
  `_op:"rename_field"`) and DROP (danger ConfirmModal → PATCH `_op:"drop_field"`).
  Both hit `/api/collections/[name]` and refresh the collection + item list on
  success (the rebuild route returns the updated CollectionView). Extended
  `confirm-modal.tsx` with optional `title` + `children` so the rename modal can
  carry an input (message now optional). Added EN/FI/ET strings (`manageSchema`,
  `schemaFields`, `renameField`, `dropField`, `renameFieldTitle`, `newFieldName`,
  `rename`, `confirmDropField`) + regen'd the PM cms-bundle.
- **ALSO fixed a latent bug:** `AddFieldForm` PATCHed the BARE field object, but
  the route reads `obj.field` (the add-field contract since Slice 2). So add-field
  via the UI was silently 400ing. Now sends `{ field }`. (AI add-field always
  worked — it calls the store directly.)
- **Verified:** CMS tsc clean; `npm test` 877/877; `npx opennextjs-cloudflare
  build` green (dev OFF); cms-bundle regen'd + new strings grep-confirmed in
  cms-bundle.generated.js. Live D1 / visual = HITL (the UI needs a real binding
  to exercise; logic mirrors the verified AI/REST path). Used in-app ConfirmModal
  throughout — NO native confirm()/prompt().
- **Files:** CMS/src/components/content/collection-items.tsx,
  CMS/src/components/content/confirm-modal.tsx, CMS/messages/{en,fi,et}.json,
  ProjectManager/src/lib/deploy/cms-bundle.generated.js.

## 2026-06-24 15:36 — Import/export (CSV/JSON) per collection
- **Status:** DONE
- **What I did:** Operator bulk in/out for collection items. PURE
  `lib/content/import-export.ts` (`rowsToCsv` RFC-4180-ish quoting, `parseCsv`
  state-machine parser handling quoted commas/newlines/escaped `""`, `parseImport`
  csv|json → row objects; DROPS generated system cols id/archived_at/created_at/
  updated_at on import, KEEPS slug+status; cells "" so column DEFAULTs apply).
  Export route GET `/api/collections/[name]/export?format=csv|json` → downloadable
  file (reuses Slice-3 `listItems` archived:"all" + registry fields → serializer,
  content-disposition attachment). Import route POST `/api/collections/[name]/import`
  `{format,text}` → loops Slice-3 `createItem` (full validate/coerce/fence per row),
  continue-on-error, MAX_IMPORT_ROWS=1000, returns `{created,failed,errors[]}`.
  Operator UI in collection-items.tsx: Export CSV / Export JSON `<a download>` links
  + Import button → inline `ImportForm` (file picker + paste textarea + per-row
  error list). EN/FI/ET `collections.{exportCsv,exportJson,import,importing,import*,
  close}` + cms-bundle regen.
- **Verified:** 10 node tests in scripts/import-export.test.mjs (csv round-trip,
  quote/comma/newline escaping, system-col drop, json parse, error cases) — all
  pass. `npx tsc --noEmit` clean. `npm test` 896/896. `npx next build` green with
  both new routes in the manifest (`/api/collections/[name]/export` + `/import`).
  cms-bundle regen'd. opennextjs-cloudflare build itself died on a PARALLEL worker's
  in-flight chat-widget.tsx (dialog/Esc snippet — NOT mine; the documented
  parallel-build-clash caveat) — next build (which opennext runs internally) is
  green incl. my routes, so my slice is sound. Live D1 = HITL.
- **Files:** CMS/src/lib/content/import-export.ts,
  CMS/src/app/api/collections/[name]/export/route.ts,
  CMS/src/app/api/collections/[name]/import/route.ts,
  CMS/src/components/content/collection-items.tsx, CMS/scripts/import-export.test.mjs,
  CMS/messages/{en,fi,et}.json, ProjectManager/src/lib/deploy/cms-bundle.generated.js.
