# Note to the next Meeseeks (content-collections)

BUGS: NONE OPEN. Slices 0 + 1 + 2 + 3 + 4 are DONE.

WHAT EXISTS NOW (use it, don't reinvent):
- `CMS/src/lib/content/fence.ts` — pure SQL validators (Slice 0). ALL runtime SQL through it.
- `CMS/src/lib/content/content-db.ts` — `contentSelect`/`contentWrite`/`contentDdl`, the ONLY runtime-SQL→D1 site; injectable `D1Like` for node tests.
- `CMS/src/lib/content/collection-schema.ts` (Slice 1, PURE) — DDL gen + `SYSTEM_COLUMNS`, `MAX_COLUMNS=100`, `CollectionField`.
- `CMS/src/lib/content/collection-plan.ts` (Slice 2, PURE) — `planCreate`/`planAddField`/`normalizeField(s)`, `MAX_COLLECTIONS=100`, `PlanResult<T>`.
- `CMS/src/db/collection-store.ts` (Slice 2) — collection CRUD; `CollectionView` = {id,name,tableName,fields,createdAt,updatedAt}; `listCollections`/`getCollection`/`createCollection`/`addCollectionField`/`deleteCollection`.
- `CMS/src/lib/content/item-write.ts` (Slice 3, PURE) — `coerceFieldValue`/`coerceStatus` + builders; `ITEM_STATUSES`.
- `CMS/src/db/item-store.ts` (Slice 3) — items CRUD, all `PlanResult<T>`.
- **Slice 4 (NEW):** `CMS/src/lib/content/query-compiler.ts` (PURE) — `compileQuery`/`compileCount`, types `QuerySpec`/`FilterClause`/`SortClause`/`FilterOp`, `FILTER_OPS`. Whitelists columns vs registry+SYSTEM_COLUMNS, coerces values via `coerceFieldValue`, binds everything; search = LIKE over text fields (NO FTS5). `CMS/src/db/query-store.ts` — `queryCollection(tableName, spec) → {items,total,limit,offset}`.
- Routes: `app/api/collections/route.ts`, `.../[name]/route.ts`, `.../[name]/items/route.ts`, `.../[name]/items/[id]/route.ts`, `.../[name]/query/route.ts` (GET, Admin-gated; ?filter=field:op:value repeatable, ?sort=field:asc|desc repeatable, ?search, ?limit, ?offset, ?status, ?archived). `[name]` = content_<slug> table name.
- Tests gate: `node --test scripts/query-compiler.test.mjs scripts/item-write.test.mjs scripts/collection-plan.test.mjs scripts/collection-schema.test.mjs scripts/content-fence.test.mjs` (67).

PICK NEXT: **Slice 5 — admin UI: manage collections + rich item editor.**
- Pages under `app/admin/collections/`: list collections, create/edit schema (type picker → POST /api/collections + PATCH .../[name] add-field), per-collection item table with create/edit forms using the CORRECT input per type (reuse page-builder type-aware inputs: native date/time, number, select, bool toggle, textarea/richtext).
- Wire filter/sort + a text-search box to the Slice-4 query route (`GET .../[name]/query`). Archive/delete behind an IN-APP confirm modal (NO native confirm()/alert() — browser-review sessions hang).
- **This is the FIRST slice with user strings** → cms-bundle regen in PM + EN/FI/ET for ALL new strings (Slices 2-4 added none). Design-system + purpose tokens.
- Admin UI pattern: `components/pages/pages-manager.tsx`, `components/settings/brand-editor.tsx` — REST + fetch, no form lib.

GATE every slice: `node --test scripts/...` + `npx tsc --noEmit` + `npx opennextjs-cloudflare build` (dev server DOWN first — corrupts .next). Slice 5 adds cms-bundle regen + EN/FI/ET.

KEY DECISIONS (settled — don't relitigate): one real table/collection; runtime DDL fenced to content_* + system-generated; 100-collection cap; registry canonical; ADD-ONLY evolution v1; AI gets STRUCTURED tools only; NO FTS5 v1 (LIKE); refs/page-binding = Phase 2.

GOTCHAS: imports inside src/ need `.ts` extension or node --test can't resolve. `[name]` URL segment IS the content_<slug> table name. Date/datetime stored as ISO TEXT (system timestamps ARE ms). Query column NAMES are whitelisted (can't be bound) — reuse the compiler, don't inline raw column names. LIMIT/OFFSET inline as plain ints (mind "no-inline" tests). Live D1 = HITL — node-test the PURE compiler.
