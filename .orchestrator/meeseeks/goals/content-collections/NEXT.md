# Note to the next Meeseeks (content-collections)

BUGS: NONE OPEN. Slices 0 + 1 + 2 + 3 are DONE.

WHAT EXISTS NOW (use it, don't reinvent):
- `CMS/src/lib/content/fence.ts` — pure SQL validators (Slice 0). Route ALL runtime SQL through them.
- `CMS/src/lib/content/content-db.ts` — `contentSelect`/`contentWrite`/`contentDdl`, the ONLY runtime-SQL→D1 site; fences before each call; injectable `D1Like` for node tests.
- `CMS/src/lib/content/collection-schema.ts` (Slice 1, PURE) — DDL generator + `SYSTEM_COLUMNS` (id, slug, status, archived_at, created_at, updated_at), `MAX_COLUMNS=100`.
- `CMS/src/lib/content/collection-plan.ts` (Slice 2, PURE) — `planCreate`/`planAddField`/`normalizeField(s)`, `MAX_COLLECTIONS=100`.
- `CMS/src/db/collection-store.ts` (Slice 2) — collection CRUD; `CollectionView` = {id,name,tableName,fields,createdAt,updatedAt}.
- **Slice 3 (NEW):** `CMS/src/lib/content/item-write.ts` (PURE) — `coerceFieldValue` (per-type validate/coerce, see CAVEATS for rules), `coerceStatus`, and parameterized builders `buildInsert`/`buildUpdate`/`buildArchive`/`buildUnarchive`/`buildDelete`/`buildGet`/`buildList`. `CMS/src/db/item-store.ts` (live) — `listItems`/`getItem`/`createItem`/`updateItem`/`archiveItem`/`unarchiveItem`/`deleteItem`, all `PlanResult<T>`.
- Item routes: `app/api/collections/[name]/items/route.ts` (GET list ?status=&archived=live|archived|all&limit= / POST create→201), `.../items/[id]/route.ts` (GET / PATCH {changes}|{_op:archive|unarchive} / DELETE). Admin-gated. `[name]` = content_<slug> table name; `[id]` = item system id.
- Tests: `scripts/item-write.test.mjs` (12). Gate: `node --test scripts/item-write.test.mjs scripts/collection-plan.test.mjs scripts/collection-schema.test.mjs scripts/content-fence.test.mjs` (48).

PICK NEXT: **Slice 4 — structured query API (NO FTS5 v1 — USER DECISION).**
- `GET /api/collections/[name]/query` — filter (field op value) + sort + paginate + count, compiled to a safe PARAMETERIZED SELECT over typed columns. Text search = simple `LIKE`/`instr` on text fields (NOT FTS5).
- Build a PURE SQL-compiler module (filter/sort/paginate/text-LIKE → SQL + bound params), node-tested; assert it NEVER emits unbound user input (mirror Slice-3's "no value inlined" + "placeholders === params" tests). Whitelist filter ops + sort columns against the registry fields + SYSTEM_COLUMNS; reject unknown columns/ops with 400 — column NAMES go in the SQL so they MUST be validated against the registry, never bound or raw.
- Reuse `coerceFieldValue` from item-write.ts to coerce filter VALUES to the field type before binding. Don't re-coerce differently.
- Same split: PURE compiler (node-tested with fakes) + thin live store using `contentSelect` + `getCollection` for the schema. Live D1 = HITL.

GATE every slice: `node --test scripts/...` + `npx tsc --noEmit` + `npx opennextjs-cloudflare build` (dev server DOWN first — it corrupts .next). Slice 5 UI is where cms-bundle regen + EN/FI/ET kick in (Slices 2-4 add no user strings).

KEY DECISIONS (settled — don't relitigate): one real table/collection; runtime DDL fenced to content_* + system-generated; 100-collection cap; registry canonical; ADD-ONLY evolution v1; AI gets STRUCTURED tools only; NO FTS5 v1 (LIKE); refs/page-binding = Phase 2.

GOTCHAS: imports inside src/ need the `.ts` extension or node --test can't resolve them. `[name]` URL segment IS the content_<slug> table name. Date/datetime values store as ISO TEXT (NOT ms — system timestamps ARE ms; mind the difference when querying). Multiselect stored as JSON-array TEXT — a LIKE search on it works but is naive. Live D1 can't be unit-tested without a binding — node-test the PURE compiler, build-verify the store + routes.
