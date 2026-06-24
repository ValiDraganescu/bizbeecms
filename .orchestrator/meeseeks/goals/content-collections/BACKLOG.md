# Backlog — content-collections
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)
- BUG [P1] DONE (2026-06-24): Creating a collection fails — `D1_EXEC_ERROR: Error in line 1: CREATE TABLE content_authors (: incomplete input: SQLITE_ERROR`. ROOT CAUSE (the symptom analysis below mis-guessed "empty body" — the body was fine): the break was at the D1 exec boundary, NOT the pure builders. `contentDdl` ran `d1.exec(sql)`, and **D1's `exec()` SPLITS its input on newlines and runs each line as a separate statement** — so the multi-line generated `CREATE TABLE content_x (\n  col,\n ...\n)` got chopped, and line 1 `CREATE TABLE content_x (` ran alone → "incomplete input". The error's "empty body" appearance is just D1 echoing the first line it tried. FIX: `content-db.ts` `contentDdl` now runs the single fenced statement via `d1.prepare(sql).run()` (whole statement intact, newlines irrelevant). Regression test in `scripts/content-fence.test.mjs` models exec()'s newline-split and feeds the exact reported repro DDL (Authors: name string req + bio richtext req); fails-before/passes-after. tsc + npm test (857) + opennext build green. No new UI strings → no cms-bundle regen.
  SYMPTOM ANALYSIS (original, superseded by root cause above): the executed DDL is `CREATE TABLE content_authors (` with an EMPTY body — the column definitions never made it into the statement (SQLite chokes right after the `(`). The pure builder `generateCreateTable` (`lib/content/collection-schema.ts:192-193`: `cols.map(c => c.sql).join(",\n")`) looks correct AND always prepends 6 system columns (`:69-87`), so an empty body should be impossible from it alone. So the break is UPSTREAM or in transit: investigate (1) the column-assembly that feeds `cols` (`buildColumns`/`collection-plan.ts` — are the user fields + system cols actually populated, or is `cols` empty?); (2) the FENCE/validator the DDL passes through before exec (`content-db.ts` `contentDdl`/`validateStatement` — is it truncating/rejecting/re-emitting the statement at the `(`?); (3) how the API route passes the field list from the form to the planner (a serialization mismatch could drop the fields). The `richtext` type may also be unmapped → a column with no SQL → empty join; check the field-type→SQL map covers `richtext`. Reproduce with a node test feeding the exact form payload (name=Authors, name:string:req, bio:richtext:req) through plan→DDL and assert the DDL contains the columns + is valid, THEN fix. Gate: CMS tsc + `npm test` + `npx opennextjs-cloudflare build` (dev OFF) + cms-bundle regen.
- BUG [P2] DONE (2026-06-24): Collections nav item has NO icon. ROOT CAUSE exactly as predicted: `admin-sidebar.tsx` `IconKey` union + `NavIcon` switch had no `"collections"` case while `ADMIN_SECTIONS` (admin-sections.ts) lists `{key:"collections"}` → `NavIcon` fell through to `undefined` → blank icon slot. FIX: added `"collections"` to `IconKey` AND a `case "collections":` rendering a stacked-cylinders database SVG in the existing `common` stroke style (NOT lucide). Confirmed ADMIN_SECTIONS key is already `"collections"` and `adminNav.collections` label exists (Slice 5) → no i18n / no cms-bundle regen. tsc clean, npm test 862/862, opennext build green (dev OFF).
- BUG [P2] DONE (2026-06-22): `ports-sole-reader.guard` test FAILED on `content-db.ts` (introduced by Slice 0 / commit ce01b0d) — Slice 0 widened Db access to `d1.prepare()/exec()` but the sole-reader guard still expected a single reader. FIX: added an EXACT-PATH allowlist entry (`ALLOWLIST_FILES`, not a directory) sanctioning `content-db.ts` as the fenced runtime-SQL second reader, plus a NEW assertion pinning that file to exactly ONE binding read so the exception can't grow into a general escape hatch. `npm test` now 505/505 green. — reported & fixed 2026-06-22

## Tasks
Build order: the SAFETY fence + registry first (everything unsafe without it), then
runtime create, then items, then query/FTS, then UI, then AI tools. Each slice
gates on CMS tsc + opennext build green + node tests + EN/FI/ET for new strings.

- DONE (2026-06-22): **Slice 0 — runtime-DDL SAFETY fence + content-DB module (the
  keystone).** Built `CMS/src/lib/content/fence.ts` (pure validators: `isContentName`,
  `isBuiltinName`, `validateStatement`/`assertStatement` — tokenizing parser, NOT
  regex; rejects multi-statement, quoted/bracket/backtick built-in refs, comment
  tricks, PRAGMA/ATTACH, wrong-verb-per-mode; requires a content_* target) +
  `CMS/src/lib/content/content-db.ts` (`contentSelect`/`contentWrite`/`contentDdl` —
  the ONLY runtime-SQL site, fences BEFORE every D1 call, MAX_READ_ROWS=1000).
  14 node tests w/ attack corpus, tsc + opennext build green.

- DONE (2026-06-22): **Slice 1 — `collection` registry + field-schema → DDL
  generator.** Built-in `collection` table (`schema.ts` + migration 0010, unique on
  table_name) + PURE `CMS/src/lib/content/collection-schema.ts`: field-type vocab
  (propsSchema set + text/int/bool/datetime/multiselect; ref/asset reserved→TEXT),
  `affinityFor`, `buildItemColumns` (6 system cols id/slug/status/archived_at/
  created_at/updated_at), `buildCreateTableSql`, `buildAddColumnSql` (ADD-ONLY),
  `tableNameForSlug`, MAX_COLUMNS=100. 13 node tests assert generated DDL PASSES the
  Slice-0 fence + content_ prefix + cap + injection-safe DEFAULTs. NO execution
  (Slice 2 wires it). tsc + opennext build green.

- DONE (2026-06-22): **Slice 2 — create/list/describe collections at runtime (DDL
  execution).** PURE `lib/content/collection-plan.ts` (`planCreate` w/ 100-cap +
  `content_<slug>` derive + collision-409/slugless-400/generator-error-400 +
  fence-safe CREATE; `planAddField` ADD-ONLY w/ dup-409/system-clash-400/col-cap;
  `normalizeField(s)` untrusted-JSON coercion) + `db/collection-store.ts` (live
  Drizzle registry I/O; ALL DDL via `contentDdl` — count→CREATE→insert,
  ALTER→update schema JSON, DROP→delete row) + routes `app/api/collections/route.ts`
  (GET list / POST create, Admin-gated) and `app/api/collections/[name]/route.ts`
  (GET describe / PATCH add-field / DELETE drop, Admin-gated, Next15 async params;
  `[name]` = the content_<slug> table name). 10 node tests (create→fence-safe DDL,
  cap-409, collision-409, add-field, dup, system-clash, normalize); every generated
  DDL asserted to pass the Slice-0 fence. tsc + opennext build green; both routes in
  the manifest. Live D1 = HITL. No user strings yet (Slice 5 UI does cms-bundle +
  EN/FI/ET).

- DONE (2026-06-22): **Slice 3 — collection ITEMS CRUD (structured, validated).**
  PURE `lib/content/item-write.ts` (`coerceFieldValue` per registry field type:
  bool→0/1, int→trunc, number→REAL, date/datetime/time→ISO TEXT (accepts ISO str
  or epoch-ms), select→options-validated, multiselect→JSON array TEXT; required
  rejects empty; `coerceStatus` default draft) + parameterized builders
  `buildInsert`/`buildUpdate`(PATCH semantics)/`buildArchive`/`buildUnarchive`/
  `buildDelete`/`buildGet`/`buildList` — all `?`-placeholdered, EVERY string
  asserted to pass the Slice-0 fence + no user value inlined. Live `db/item-store.ts`
  (`listItems`/`getItem`/`createItem`/`updateItem`/`archiveItem`/`unarchiveItem`/
  `deleteItem`, loads registry via `getCollection`, runs through `contentSelect`/
  `contentWrite`, returns `PlanResult<T>`). Routes `app/api/collections/[name]/
  items/route.ts` (GET list ?status=&archived=live|archived|all&limit= / POST
  create 201) + `.../items/[id]/route.ts` (GET / PATCH {changes} or {_op:archive|
  unarchive} / DELETE), Admin-gated, Next15 async params. 12 node tests
  (coerce/status/insert/update/archive/delete/get/list, fence-safe + parallel
  params + no-inline assertions); 48 content tests total. tsc + opennext build
  green; both routes in the manifest. Live D1 = HITL. No user strings (Slice 5 UI
  does cms-bundle + EN/FI/ET).

- DONE (2026-06-22): **Slice 4 — structured query (NO FTS5 in v1 — USER DECISION
  2026-06-22).** PURE `lib/content/query-compiler.ts` (`compileQuery`/`compileCount`):
  QuerySpec (filters[] field:op:value, sort[], search, limit/offset, status,
  archived) → safe PARAMETERIZED SELECT/COUNT. Column names whitelisted vs registry
  fields + SYSTEM_COLUMNS (unknown→400, never inlined/bound); ops whitelisted
  (eq/ne/lt/lte/gt/gte/like/in/is_null/not_null); every value coerced via Slice-3
  `coerceFieldValue` then `?`-bound; search = LIKE over text-affinity fields (no
  FTS5); limit clamped [1,1000], offset≥0 inlined as ints. Thin store
  `db/query-store.ts` (`queryCollection` → items+total). Route `GET
  /api/collections/[name]/query` (Admin-gated, repeatable ?filter/?sort + ?search/
  ?limit/?offset/?status/?archived). 19 node tests (fence-pass, placeholders===
  params, no-inline, 400s). 67 content tests total; tsc + opennext build green;
  route in manifest. Live D1 = HITL. No user strings (Slice 5 UI does cms-bundle +
  EN/FI/ET).

- DONE (2026-06-22): **Slice 5 — admin UI: manage collections + rich item editor.**
  Pages `app/admin/collections/page.tsx` (list + schema editor) +
  `app/admin/collections/[name]/page.tsx` (per-collection item manager; `[name]` =
  content_<slug> table name). Client components under `components/content/`:
  `collections-manager.tsx` (create w/ field-type picker over COLLECTION_FIELD_TYPES
  + required + select/multiselect options; delete behind confirm modal),
  `collection-items.tsx` (item table; create/edit forms with TYPE-AWARE inputs;
  search box + sort picker + live/archived/all filter wired to GET .../[name]/query;
  archive/unarchive via PATCH {_op}; delete + add-field PATCH .../[name]),
  `field-input.tsx` (native date/datetime-local/time, number, select, bool checkbox,
  multiselect checkbox list, textarea for text/richtext; emits Slice-3 value shapes),
  `confirm-modal.tsx` (in-app modal, NO native confirm()). Added `collections` to
  ADMIN_SECTIONS. FIRST slice with user strings → EN/FI/ET `collections` namespace +
  `adminNav.collections`/`desc.collections` + `cms-bundle` regen (PM
  src/lib/deploy/cms-bundle.generated.js). Gate: tsc 0, 67 content node tests,
  opennext build green (both pages in manifest), bundle strings verified. Live D1 =
  HITL (pages render empty/offline notice without a binding).

- DONE (2026-06-22): **Slice 6 — AI assistant collection tools (structured only).**
  PURE `lib/chat/collection-tools.ts`: 5 tool schemas + arg validators
  (`validateCreateCollection`/`validateAddItem`/`validateUpdateItem`/
  `validateArchiveItem`/`validateQuery`) that shape the model's loose args into the
  EXACT store shapes (no `@/` imports → node-testable). Wired into the shared
  registry (`tool-dispatch.ts` TOOL_BY_NAME + HANDLERS) calling the Slice 2-4 stores
  directly — `createCollection`, `createItem`/`updateItem`/`archiveItem`/
  `unarchiveItem`/`deleteItem`, `queryCollection` — mapping PlanResult `!ok`→error.
  `archive_collection_item` op-switches archive|unarchive|delete (one tool, USER's
  combined verb). New `collections` context in tool-scopes (KNOWN_TOOL_NAMES +
  KNOWN_CONTEXTS + TOOLS_BY_CONTEXT + CONTEXT_PROMPTS) — assistant on /admin/
  collections is auto-scoped to these 5. NO raw SQL to the model; NO forked data
  path. Chat route needed NO edits (auto-derives schemas+dispatch from the
  registry). 11 node tests (arg-shaping/rejection per tool); 78 content+tool tests
  total; tsc 0; opennext build green. Tool descriptions are MODEL-facing not UI
  strings → no cms-bundle regen, no EN/FI/ET. Live D1 = HITL (stores are
  build-verified).

## Phase 2 — Component ↔ Collection data BINDING (greenlit 2026-06-22)
DESIGN (settled with user 2026-06-22). The renderer is PURE+SYNC (`planPage`) and
data is fetched BEFORE the walk in the async `buildPlanFromPage` — KEEP that shape:
hydrate bound data first, then the pure walk binds it via the EXISTING `{{slot}}` /
`bindTree` + `propsSchema` allowlist. Two binding shapes:
- LIST binding = a NEW BUILT-IN `List` block modeled EXACTLY like the existing
  `Section` primitive (built-in block, special-cased in `tree.ts` like `planSection`,
  NOT a user component). It carries a QUERY (collection + filter/sort/limit, reusing
  Slice-4's structured query compiler) and has ONE child SLOT = the component to
  stamp per result row. Each row's fields map → the slotted component's DECLARED
  props (reuse `declaredProps` allowlist + the registry fields — both sides
  validated). Renderer iterates rows, clones the slot subtree per row, binds row
  props, injects as children (the existing `block.children` append path).
- SINGLE-ITEM binding = pick by QUERY, FIRST MATCH (USER DECISION — not by stored
  id). A block grows an optional `bindings` map (alongside `props`, NOT inside it):
  `{ source: { collection, filter[], sort[] }, map: { propName: fieldName } }`. The
  first matching row's fields fill the mapped props before the pure walk.
- GRACEFUL everywhere (USER DECISION): empty list → render nothing (optional
  empty-state slot); dead/unresolved single-item → static fallback prop or blank;
  unknown field → blank (allowlist). NEVER 500 — mirror the existing
  unknown-component→hidden-placeholder behavior.
DEPENDS ON Slices 1-4 (registry, items, structured query). Item schema already has
stable id + slug (Slice 3) so this isn't a retrofit.

- DONE (2026-06-22): **P2-bind Slice A — block `bindings` model + hydrate-before-walk
  seam.** Added `BindingRef` type + optional `bindings?: Record<string,BindingRef>` on
  `Block` (`render/tree.ts`, SEPARATE from `props`: `{source:{collection,filter?,sort?},
  map:{propName→fieldName}}`). PURE `lib/content/binding.ts`: `validateBinding`
  (collection/mapped+filter+sort fields exist [user field OR system column] / mapped
  prop declared on target → ok|errors[]), `bindingQuerySpec` (→ first-match QuerySpec
  limit 1), `hydrateProps` (row→props, binding overwrites static when resolved,
  unresolved/absent → graceful blank), `declaredPropNames` (propsSchema allowlist).
  `render-page.tsx` `buildPlanFromPage` now `await hydrateBlockBindings(blocks)` BEFORE
  `planPage` (recursive, parallel first-match `queryCollection`, graceful on error/
  empty); `planPage`/`planTree` stay PURE+SYNC. 15 node tests; 129 content+render
  total; tsc 0; opennext build green. NO user strings → NO cms-bundle regen. NOTE: the
  hint said `lib/content/tree.ts` but the renderer lives at `lib/render/tree.ts` +
  `lib/render/render-page.tsx`. List binding = Slice B (next). Live D1 = HITL.

- DONE (2026-06-22): **P2-bind Slice B — built-in `List` block (Section-style) +
  per-row stamp.** Reserved `LIST_COMPONENT="List"` + `BUILTIN_COMPONENTS`/
  `isBuiltinComponent()` in `render/tree.ts`; `Block` grows List-only `listSource`
  (collection+filter/sort/limit), `listMap` (rowField→templateProp), `listRows`
  (host-hydrated), `listRole`("template"|"empty"). PURE `planList` (dispatched from
  `planBlock` like `planSection`) partitions children into template vs empty-state,
  stamps the template once per row via `stampRow` (injects mapped row fields into
  each stamped block's props; `planBlock`/`bindTree` gate by the component's
  propsSchema allowlist). Empty/dead/un-hydrated → empty-state slot if authored,
  else nothing. `render-page.tsx` fetches List rows in the SAME hydrate-before-walk
  pass as Slice A (`queryCollection` → `listRows`, graceful), and drops `List` from
  the component fetch set. `page-blocks.ts` existence-check drop now loops
  `isBuiltinComponent` (Section/column/List). 10 node tests; full suite 165; tsc 0;
  opennext build green. NO user strings → NO cms-bundle regen. Live D1 = HITL.

- DONE (2026-06-22): **P2-bind Slice C — UI to author bindings (operator).** Page-builder
  operator UI. PURE helpers in `lib/pages/page-blocks.ts`: `isList`, `addListBlock`/
  `addListToSection` (insert a built-in List into a Section column, like
  addComponentToSection), `setBlockField` (set/clear NON-prop fields
  bindings/listSource/listMap/listRole, tree-walk), `setBlockChildren` (set a List's
  template/empty children). `lib/content/binding.ts`: `validateListBinding`
  (collection/filter/sort/mapped-field exist + mapped prop declared on the template).
  `page-builder-shell.tsx`: fetches `/api/collections` (graceful 403/offline→empty);
  rail "List (from collection)" insert button; Block tab branches List→`ListSettings`
  (collection + filter/sort/limit via `QueryBuilder` + template component select +
  field→prop map), normal block→`ComponentSettings` + `BindingPanel` (single-item
  binding key "item": collection + first-match query + declaredProp→field map). All
  authoring is graceful (renderer skips unresolved). EN/FI/ET `pageBuilder.layoutList`
  + `bind.*` + `list.*` + cms-bundle regen. 11 node tests (binding-ui), full suite 176;
  tsc 0; opennext build green; bundle string verified. Live D1/visual = HITL.

- DONE (2026-06-22): **P2-bind Slice D — AI tools for binding.** `bind_component`
  (single-item binding under key "item"), `create_list` (insert a built-in List +
  template child + query/map), `bind_list` (PATCH-reconfigure a List + optional
  template swap). PURE `lib/chat/binding-tools.ts` (3 schemas + arg validators,
  node-testable) wired into the shared registry (`tool-dispatch.ts` TOOL_BY_NAME +
  HANDLERS) + `tool-scopes.ts` (KNOWN_TOOL_NAMES + page-builder & pages contexts +
  prompts). Handlers MUTATE a page's draft blocks (getPageBlocks→findBlock→shared
  validateBinding/validateListBinding against registry+propsSchema→Slice-C
  setBlockField/addListToSection/setBlockChildren→validateBlocks→setPageBlocks); NO
  forked data path, NO raw SQL to the model. 16 node tests; full subset 123 green;
  tsc 0 on MY files. opennext build blocked ONLY by a parallel worker's in-flight
  api/invite/route.ts (canInviteRole) — re-verify once that lands. NO bundle regen /
  NO EN/FI/ET (AI-tool descs are model-facing). Live D1/visual = HITL.

- TODO: **Phase 3 (later, not greenlit) — route-driven detail pages + cross-collection
  refs.** "The item for the current route" (dynamic `/blog/[slug]` → the matching
  item) and `ref` fields (post→author) resolved during binding. Bigger (dynamic
  routing); spec when the user greenlights. v1 single-item is query-first-match, not
  route-driven — that's the deliberate boundary.

- PARTIAL (2026-06-22): **Phase 2 — drop/rename field (schema rebuild) — PURE
  PLANNER DONE.** `lib/content/schema-rebuild.ts` `planRebuild(schema, change)` →
  ordered fence-safe statements (CREATE content_<slug>_new → INSERT…SELECT kept/
  renamed cols → DROP old → RENAME new) + updated registry schema. Drop omits the
  col; rename maps old→new positionally; system cols always carried; every stmt
  asserted through the Slice-0 fence; rejections (404 unknown / 400 system-col,
  bad-name, non-content / 409 collision). 16 node tests
  (scripts/schema-rebuild.test.mjs), tsc clean. REMAINING for a follow-up slice:
  the thin LIVE store (run the 4 stmts via `contentDdl` inside whatever atomic
  boundary D1 gives — ideally one batch; D1 has no nested TXN, so on partial
  failure the temp table is an orphan — decide cleanup) + write `newSchema` to the
  registry; route (PATCH/DELETE field on /api/collections/[name]); operator UI +
  AI tool + EN/FI/ET + cms-bundle regen. RETYPE is still NOT covered (needs value
  coercion between affinities — separate slice).

- TODO: **Phase 2 (later) — FTS5 full-text search (DEFERRED from v1, USER DECISION
  2026-06-22).** Per content table, a CONTENTLESS/external-content `content_<slug>_fts`
  virtual table (USING fts5) over text-indexable fields + sync triggers (or
  rebuild-on-write), a `search_collection` AI tool + a `/search` route + UI search.
  WATCH the D1 export limitation (CAVEATS): D1 couldn't export a DB containing fts5
  virtual tables (open bug as of 2026-06-22) — re-check if fixed; use contentless/
  external-content so the index is rebuildable from source after a restore.
