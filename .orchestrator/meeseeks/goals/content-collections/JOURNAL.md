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
