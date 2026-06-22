# Note to the next Meeseeks (content-collections)

BUGS: NONE OPEN. Slices 0 + 1 are DONE.

WHAT EXISTS NOW (use it, don't reinvent):
- `CMS/src/lib/content/fence.ts` — pure SQL validators (Slice 0). Route ALL runtime SQL through them.
- `CMS/src/lib/content/content-db.ts` — `contentSelect`/`contentWrite`/`contentDdl`, the ONLY runtime-SQL→D1 site; fences before each call; injectable `D1Like` for node tests.
- `CMS/src/lib/content/collection-schema.ts` (Slice 1, PURE) — the DDL generator:
  - `CollectionField` / `CollectionFieldType` (vocab: string/text/richtext/number/int/bool/boolean/select/multiselect/date/datetime/time + ref/asset reserved→TEXT).
  - `buildCreateTableSql(tableName, fields)`, `buildAddColumnSql(tableName, field)`, `buildItemColumns(fields)`, `affinityFor`, `tableNameForSlug`, `MAX_COLUMNS=100`, `SYSTEM_COLUMNS`.
  - System columns reserved on EVERY content table: id, slug, status('draft'), archived_at, created_at, updated_at. Slice 3 items CRUD MUST use these names.
- `CMS/src/db/schema.ts` — built-in `collection` registry (migration 0010). `Collection`/`NewCollection` types.
- Tests: `scripts/collection-schema.test.mjs` (13). Gate: `node --test scripts/collection-schema.test.mjs scripts/content-fence.test.mjs` (27).

PICK NEXT: **Slice 2 — create/list/describe collections at runtime (DDL EXECUTION).**
- `POST /api/collections` (create): enforce the 100-COLLECTION cap (count registry rows) BEFORE create; derive `content_<slug>` via `tableNameForSlug`; `buildCreateTableSql` → run through `contentDdl` (it fences); on success write the `collection` registry row (canonical schema JSON). Name-collision = the unique `collection_table_name_unique` index (catch + 409).
- `GET /api/collections` (list from registry) + `GET /api/collections/[name]` (describe).
- `PATCH /api/collections/[name]` add-field → `buildAddColumnSql` → `contentDdl`, then update the registry `schema` JSON (ADD-ONLY v1).
- Drop collection = drop table (`contentDdl` "DROP TABLE content_x") + registry row; IN-APP confirm in the UI later (Slice 5), API just deletes.
- Gate to CMS Admin (cms-auth roles — see `lib/auth` / requireApiKey/cookie guards). Node tests: create→registry+table (inject fake D1), cap rejection, add-column, name-collision. This slice DOES touch the live D1 via the fence — keep content-db.ts's single `env.DB` read intact (sole-reader guard).

GATE every slice: `node --test scripts/...` + `npx tsc --noEmit` + `npx opennextjs-cloudflare build` (dev server DOWN first — it corrupts .next). Slice 2 adds API routes (no user strings yet); Slice 5 UI is where cms-bundle regen + EN/FI/ET kick in.

KEY DECISIONS (settled — don't relitigate): one real table/collection; runtime DDL fenced to content_* + system-generated; 100-collection cap; registry canonical; ADD-ONLY evolution v1; AI gets STRUCTURED tools only; NO FTS5 v1 (LIKE); refs/page-binding = Phase 2.

GOTCHA: imports inside src/ need the `.ts` extension or node --test can't resolve them.
