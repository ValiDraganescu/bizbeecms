# Note to the next Meeseeks (content-collections)

BUGS: NONE OPEN. Slices 0 + 1 + 2 are DONE.

WHAT EXISTS NOW (use it, don't reinvent):
- `CMS/src/lib/content/fence.ts` — pure SQL validators (Slice 0). Route ALL runtime SQL through them.
- `CMS/src/lib/content/content-db.ts` — `contentSelect`/`contentWrite`/`contentDdl`, the ONLY runtime-SQL→D1 site; fences before each call; injectable `D1Like` for node tests.
- `CMS/src/lib/content/collection-schema.ts` (Slice 1, PURE) — DDL generator: `buildCreateTableSql`, `buildAddColumnSql`, `buildItemColumns`, `affinityFor`, `tableNameForSlug`, `MAX_COLUMNS=100`, `SYSTEM_COLUMNS` (id, slug, status, archived_at, created_at, updated_at).
- `CMS/src/lib/content/collection-plan.ts` (Slice 2, PURE) — `planCreate`/`planAddField`/`normalizeField(s)`, `MAX_COLLECTIONS=100`. The cap/collision/DDL DECISIONS; node-tested.
- `CMS/src/db/collection-store.ts` (Slice 2, live I/O) — `listCollections`/`getCollection`/`createCollection`/`addCollectionField`/`deleteCollection`. Returns `PlanResult<T>` = `{ok:true,plan}` | `{ok:false,status,error}`. `CollectionView` = {id,name,tableName,fields,createdAt,updatedAt} (fields parsed from registry JSON). DDL only via `contentDdl`.
- Routes: `app/api/collections/route.ts` (GET list / POST {name,fields}), `app/api/collections/[name]/route.ts` (GET describe / PATCH {field} add-only / DELETE drop). `[name]` = the `content_<slug>` table name. All Admin-gated via `requireAdmin`.
- Tests: `scripts/collection-plan.test.mjs` (10). Gate: `node --test scripts/collection-plan.test.mjs scripts/collection-schema.test.mjs scripts/content-fence.test.mjs` (36).

PICK NEXT: **Slice 3 — collection ITEMS CRUD (structured, validated).**
- `GET/POST/PATCH/DELETE /api/collections/[name]/items` (+ archive = soft, set `archived_at`).
- Per item: id (crypto.randomUUID), slug, status (draft|published), archived_at, created_at/updated_at — the SYSTEM_COLUMNS already created on every content table by Slice 1. USE EXACTLY THESE NAMES.
- ALL writes STRUCTURED: load the collection's `fields` from the registry (`getCollection`), validate+coerce each value against its field type (build a PURE `item-validate.ts`/`item-write.ts` — node-test it), then build a PARAMETERIZED INSERT/UPDATE and run via `contentWrite` (NEVER freeform SQL; `contentWrite` fences + binds params). Coercion: bool→0/1, number→REAL, int→trunc, date/datetime→ms or ISO (decide+document), select validated against options.
- List/get = `contentSelect` (parameterized, content_*-scoped); a full structured query API (filter/sort/paginate/count + LIKE) is Slice 4 — keep Slice 3's list simple (all live rows, maybe status/archived filter).
- Mirror Slice 2's split: PURE planner/validator (node-tested with fakes) + thin live store. Live D1 = HITL.

GATE every slice: `node --test scripts/...` + `npx tsc --noEmit` + `npx opennextjs-cloudflare build` (dev server DOWN first — it corrupts .next). Slice 5 UI is where cms-bundle regen + EN/FI/ET kick in (Slices 2-4 add no user strings).

KEY DECISIONS (settled — don't relitigate): one real table/collection; runtime DDL fenced to content_* + system-generated; 100-collection cap; registry canonical; ADD-ONLY evolution v1; AI gets STRUCTURED tools only; NO FTS5 v1 (LIKE); refs/page-binding = Phase 2.

GOTCHAS: imports inside src/ need the `.ts` extension or node --test can't resolve them. The `[name]` URL segment IS the content_<slug> table name (not the display name) — getCollection looks it up by table_name. Live D1 writes can't be unit-tested without a binding — node-test the PURE planner/validator, build-verify the store + routes.
