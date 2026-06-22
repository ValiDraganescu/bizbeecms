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

- TODO: **Slice 4 — query + FTS5.** Per content table, create a CONTENTLESS/
  external-content `content_<slug>_fts` virtual table (USING fts5) over the
  text-indexable fields + triggers to keep it in sync (or rebuild-on-write) — note
  the D1 export limitation (CAVEATS). STRUCTURED query API: filter (field op value),
  sort, paginate, count → compiled to safe parameterized SELECT; and FTS search →
  `… WHERE rowid IN (SELECT rowid FROM content_x_fts WHERE content_x_fts MATCH ?)`.
  `GET /api/collections/[name]/query` + `/search`. Pure SQL-compiler
  (filter/sort/paginate → SQL + bound params) node-tested; verify it NEVER emits
  unbound user input. Gate.

- TODO: **Slice 5 — admin UI: manage collections + rich item editor.** Pages under
  `app/admin/collections/`: list collections, create/edit schema (add fields with
  type picker), and a per-collection item table with create/edit forms using the
  CORRECT input per type (reuse the page-builder type-aware inputs: native
  date/time, number, select, bool toggle, textarea/richtext). Filter/sort/FTS search
  box wired to Slice 4. Archive/delete behind in-app confirm modal. Design-system +
  purpose tokens. EN/FI/ET. Gate.

- TODO: **Slice 6 — AI assistant collection tools (structured only).** Register in
  the existing pipeline (KNOWN_TOOL_NAMES + TOOLS_BY_CONTEXT + TOOL_BY_NAME):
  `create_collection`, `add_collection_item`, `update_collection_item`,
  `archive_collection_item`/`delete_collection_item`, `query_collection`
  (structured filter/sort), `search_collection` (FTS5). Each calls the SAME
  store/API as the UI (reuse Slices 2-4 — do NOT fork data paths) and is
  STRUCTURED — NO raw SQL reaches the model (USER DECISION). New context
  `collections` in tool-scopes. Node tests per tool's arg-validation/execution
  (mock the store). Gate.

- TODO: **Phase 2 (later) — references + page/component BINDING.** Cross-collection
  `ref` fields (post→author) + binding collections to pages/components: list views,
  per-item detail pages, dynamic routes (`/blog/[slug]`), `{{collection.field}}`
  binding in the renderer. This is the rendering payoff; design the item schema
  (stable id + slug, Slice 3) so it's not painful to add. Break into real slices
  when the user greenlights the phase.

- TODO: **Phase 2 (later) — drop/rename/retype field (schema rebuild).**
  System-generated safe table-rebuild (create content_x_new + copy + drop + rename),
  fenced to content_*. Deferred from v1's add-only.
