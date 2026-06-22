# Backlog — content-collections
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)
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

- TODO: **Slice 6 — AI assistant collection tools (structured only).** Register in
  the existing pipeline (KNOWN_TOOL_NAMES + TOOLS_BY_CONTEXT + TOOL_BY_NAME):
  `create_collection`, `add_collection_item`, `update_collection_item`,
  `archive_collection_item`/`delete_collection_item`, `query_collection`
  (structured filter/sort/text-LIKE). Each calls the SAME store/API as the UI
  (reuse Slices 2-4 — do NOT fork data paths) and is STRUCTURED — NO raw SQL reaches
  the model (USER DECISION). New context `collections` in tool-scopes. Node tests
  per tool's arg-validation/execution (mock the store). (No FTS search tool in v1 —
  FTS deferred.) Gate.

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

- TODO: **P2-bind Slice A — block `bindings` model + hydrate-before-walk seam.**
  Add optional `bindings?: Record<string, BindingRef>` to the `Block` type
  (`tree.ts:50`) — separate from `props`. Pure `BindingRef` type + validators
  (collection exists in registry, mapped fields exist, mapped props are declared on
  the target component). Extend `buildPlanFromPage` (`render-page.tsx`) to SCAN
  blocks for bindings, run the Slice-4 query/first-match to fetch rows, and HYDRATE
  the resolved field values into the block's `props` (mapped names) BEFORE
  `planPage`. Keep `planPage`/`planTree` pure+sync. Single-item (first-match) only
  this slice — List is Slice B. Pure tests: bindings validate, hydration fills props,
  unresolved → graceful blank. Gate.

- TODO: **P2-bind Slice B — built-in `List` block (Section-style) + per-row stamp.**
  Add a reserved built-in `List` block type (like `SECTION_COMPONENT`/
  `__section_column__`) special-cased in `tree.ts` (a `planList` mirroring
  `planSection`). It holds a query (collection + filter/sort/limit) + ONE child slot
  (the per-item template component) + the field→prop `map`. `buildPlanFromPage`
  runs the query (Slice 4), and `planList` stamps the slot subtree once per row,
  binding each row's mapped fields into the slotted component's declared props
  (reuse `bindTree`). Empty result → nothing (or an optional empty-state child).
  `list_builtin_types` exposes `List`. Pure tests: N rows → N stamped subtrees,
  empty → empty, field map respects the allowlist. Gate.

- TODO: **P2-bind Slice C — UI to author bindings (operator).** In the page-builder:
  for a normal component block, a "Bind to collection" panel (pick collection →
  build a first-match query → map fields to the component's declared props). For a
  `List` block, a panel to pick collection + filter/sort/limit + drop the per-item
  template component + map its props. Reuse the Slice-4 query-builder UI bits + the
  design-system. Show the binding state on the block. EN/FI/ET. Gate.

- TODO: **P2-bind Slice D — AI tools for binding.** Tools so the assistant can do
  the same: `bind_component` (set a block's single-item binding: collection,
  first-match query, field→prop map) and `create_list` / `bind_list` (insert a
  `List` block with query + template component + map). Validate against the registry
  + the target component's `propsSchema` (reject unknown collection/field/prop).
  Register in the existing tool pipeline; reuse the Slice-A/B stores — no forked
  data path. Node tests per tool's validation/execution (mock stores). Gate.

- TODO: **Phase 3 (later, not greenlit) — route-driven detail pages + cross-collection
  refs.** "The item for the current route" (dynamic `/blog/[slug]` → the matching
  item) and `ref` fields (post→author) resolved during binding. Bigger (dynamic
  routing); spec when the user greenlights. v1 single-item is query-first-match, not
  route-driven — that's the deliberate boundary.

- TODO: **Phase 2 (later) — drop/rename/retype field (schema rebuild).**
  System-generated safe table-rebuild (create content_x_new + copy + drop + rename),
  fenced to content_*. Deferred from v1's add-only.

- TODO: **Phase 2 (later) — FTS5 full-text search (DEFERRED from v1, USER DECISION
  2026-06-22).** Per content table, a CONTENTLESS/external-content `content_<slug>_fts`
  virtual table (USING fts5) over text-indexable fields + sync triggers (or
  rebuild-on-write), a `search_collection` AI tool + a `/search` route + UI search.
  WATCH the D1 export limitation (CAVEATS): D1 couldn't export a DB containing fts5
  virtual tables (open bug as of 2026-06-22) — re-check if fixed; use contentless/
  external-content so the index is rebuildable from source after a restore.
