# Backlog — content-collections
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
Build order: the SAFETY fence + registry first (everything unsafe without it), then
runtime create, then items, then query/FTS, then UI, then AI tools. Each slice
gates on CMS tsc + opennext build green + node tests + EN/FI/ET for new strings.

- TODO: **Slice 0 — runtime-DDL SAFETY fence + content-DB module (the keystone).**
  Before ANY collection feature: a dedicated content-DB module that is the ONLY
  place runtime SQL runs. Widen the Db access narrowly to reach `d1.prepare()/exec()`
  (keep raw SQL OUT of the rest of the app — `lib/ports/db.ts` stays Drizzle-only
  for built-ins). Pure validators (node-tested, the core of the feature's safety):
  `isContentName(name)` (`^content_[a-z0-9_]+$`), a BUILT-IN denylist, a statement
  guard that PARSES a statement and rejects: multi-statement strings, any
  non-`content_*` target, PRAGMA/ATTACH, and (on the read path) anything but a
  single SELECT/FTS MATCH. Tests MUST include attack strings (`content_x; DROP TABLE
  page`, quoted/aliased built-in refs, comment tricks). NO collection CRUD yet —
  just the fence + its tests. This is the load-bearing slice; do it carefully.

- TODO: **Slice 1 — `collection` registry + field-schema → DDL generator.** Built-in
  `collection` table (Drizzle migration): id, name, tableName (`content_<slug>`),
  schema JSON (fields: name, type, required, default, ftsIndexed?, etc.), timestamps.
  Reuse/extend the component `propsSchema` field-type vocabulary
  (string/text/richtext/number/int/bool/date/datetime/select/multiselect — ref/asset
  flagged for the binding phase). Pure `buildCreateTableSql(schema)` mapping field
  types → SQLite affinity + constraints, and `buildItemColumns`. Pure +
  node-tested (correct DDL string, content_ prefix, column count ≤ D1 limit). NO
  execution yet — pure generation + validation against the Slice-0 fence.

- TODO: **Slice 2 — create/list/describe collections at runtime (DDL execution).**
  `POST /api/collections` (create): enforce the 100-table cap (registry count),
  generate DDL (Slice 1), run it through the Slice-0 fenced exec, create the real
  `content_<slug>` table, write the registry row. `GET /api/collections` (list from
  registry) + `GET /api/collections/[name]` (describe schema). Add-field:
  `PATCH /api/collections/[name]` → `ALTER TABLE content_x ADD COLUMN` (ADD-ONLY v1,
  fenced). Drop collection = drop table + registry row (in-app confirm). Gated to
  CMS Admin (cms-auth roles). Node tests (create→registry+table, cap rejection,
  add-column, name-collision). Gate.

- TODO: **Slice 3 — collection ITEMS CRUD (structured, validated).** Per item:
  insert/update/get/list/delete + ARCHIVE (soft) — likely an `id`, `slug`, `status`
  (draft/published), `archived_at`, timestamps as system columns on every content
  table (decide + document; the binding phase needs id+slug). All writes are
  STRUCTURED: validate each field value against the registry schema, build a
  PARAMETERIZED insert/update (never freeform SQL). `GET/POST/PATCH/DELETE
  /api/collections/[name]/items`. Pure value-validation/coercion per field type,
  node-tested. Gate.

- TODO: **Slice 4 — structured query (NO FTS5 in v1 — USER DECISION 2026-06-22).**
  STRUCTURED query API only: filter (field op value), sort, paginate, count →
  compiled to safe PARAMETERIZED SELECT over the typed columns. `GET
  /api/collections/[name]/query`. Pure SQL-compiler (filter/sort/paginate → SQL +
  bound params) node-tested; verify it NEVER emits unbound user input. Text search
  in v1 = a simple `LIKE`/`instr` filter on text fields (good enough without FTS);
  FTS5 is deferred (see Phase 2 below). Gate.

- TODO: **Slice 5 — admin UI: manage collections + rich item editor.** Pages under
  `app/admin/collections/`: list collections, create/edit schema (add fields with
  type picker), and a per-collection item table with create/edit forms using the
  CORRECT input per type (reuse the page-builder type-aware inputs: native
  date/time, number, select, bool toggle, textarea/richtext). Filter/sort + a simple
  text-search box (LIKE filter, Slice 4) wired up. Archive/delete behind in-app
  confirm modal. Design-system + purpose tokens. EN/FI/ET. Gate.

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
