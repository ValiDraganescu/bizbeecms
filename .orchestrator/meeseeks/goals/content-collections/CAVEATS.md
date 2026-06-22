# Caveats — content-collections
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- **Runtime DDL is ALLOWED here — but ONLY for `content_*` objects, ONLY
  system-generated, ONLY behind the validator.** This REVERSES the general
  "no DDL after deploy" stance, deliberately, because the namespace guard makes it
  safe (USER DECISION 2026-06-22). The whole feature's safety rests on these
  invariants — violate one and it's a critical hole:
  - Every CREATE/ALTER/DROP/INSERT/UPDATE/DELETE target name MUST match
    `^content_[a-z0-9_]+$` (table) or its FTS sibling `content_*_fts`.
  - VALIDATE by PARSING the statement, not by string-matching — otherwise
    `content_x; DROP TABLE page;--` or quoted/aliased tricks slip through. Reject
    multi-statement strings on the DDL/DML paths.
  - Built-in tables (component, page, page_version, site_settings, asset,
    chat_thread, collection*, d1_migrations, sqlite_*) are NEVER touchable by the
    runtime path. Maintain an explicit denylist AND the allowlist-prefix.
  - Read path (queries): SELECT-only, parameterized, content_*-scoped, with a row
    LIMIT and (if feasible) a statement timeout. No PRAGMA, no ATTACH.

- **The `collection` registry is canonical, not `sqlite_master`.** Store each
  collection's logical schema (fields, types, FTS config, real table name, item
  conventions) in a built-in `collection` table. UI/AI/validation read the registry;
  the physical `content_*` table is kept in sync with it. Don't introspect
  `sqlite_master` as the primary source of truth.

- **100 content-table cap** (USER number). Enforce against the registry BEFORE any
  CREATE. (D1: 100 columns/table is the real per-table limit too — respect it when
  generating columns; a collection with >~90 fields is a design smell.)

- **DDL is GENERATED from a typed field-schema — nobody writes raw DDL.** The
  user/AI defines fields in the `propsSchema`-style vocabulary; the SYSTEM emits the
  `CREATE TABLE content_<slug>(...)`. Map field types → SQLite affinities
  (TEXT/INTEGER/REAL) + app-level type rules. Reuse the component propsSchema type
  vocab + the page-builder type-aware inputs so the rich UI is shared.

- **AI gets STRUCTURED query tools only — NO raw SQL to the model** (USER DECISION).
  Compile filter/sort/FTS params → safe parameterized SQL server-side. Writes via
  structured insert/update/archive tools (validate each field value against the
  registry schema), never freeform INSERT strings.

- **Schema evolution is ADD-ONLY in v1** (USER DECISION). Add field =
  `ALTER TABLE content_x ADD COLUMN` (fenced). Drop/rename/retype = LATER phase via
  system-generated rebuild (create content_x_new + copy + drop + rename). Don't try
  the rebuild dance in v1.

- **FTS5 is OUT of v1 (USER DECISION 2026-06-22).** v1 text search = a simple `LIKE`
  filter on text fields — DO NOT create fts5 virtual tables in v1. FTS5 is a Phase-2
  backlog item. When it returns, mind the D1 limitation below.
- **(Phase 2 only) D1 FTS5 EXPORT/BACKUP LIMITATION (verified 2026-06-22).** D1
  could not export/backup a database containing FTS5 virtual tables (open
  workers-sdk bug: "cannot export databases with Virtual Tables (fts5)"). Each
  per-Site CMS has its own D1, so the first FTS collection would break `wrangler d1
  export` / Time Travel for that Site. When FTS lands: make FTS tables CONTENTLESS /
  external-content so they're REBUILDABLE from source after a restore, and re-check
  whether the bug is fixed.

- **The Db port is Drizzle-only today** (`lib/ports/db.ts` exposes no raw SQL). It
  must be widened to allow controlled `d1.prepare()/exec()` for the content path.
  Keep that capability NARROW (a dedicated content-DB module behind the validator),
  don't open raw SQL to the rest of the app.

- **Each CMS Worker has its own D1** — the registry table change is a normal Drizzle
  migration (deployer applies per-Site); the `content_*` tables are runtime-created.

- **(Phase 2 binding) Keep the renderer PURE+SYNC — hydrate BEFORE the walk.**
  `planPage`/`planTree` (`tree.ts`) are pure & synchronous; data is fetched in the
  async `buildPlanFromPage` (`render-page.tsx`) BEFORE the walk. Binding MUST follow
  this: scan blocks → run the structured query → hydrate resolved values into props
  → THEN the pure walk binds via the existing `{{slot}}`/`bindTree`/`declaredProps`
  allowlist. DO NOT make the tree-walker async or fetch mid-walk.
- **(Phase 2 binding) `List` is a BUILT-IN block modeled on `Section`, not a user
  component** (USER DECISION 2026-06-22). Mirror `SECTION_COMPONENT`/`planSection`:
  a reserved type special-cased in `tree.ts` (`planList`), with a query + ONE child
  slot stamped per row. Single-item binding = a `bindings` map on the block
  (SEPARATE from `props`), pick by query FIRST MATCH. Binding metadata is validated
  on BOTH sides (collection/field exists in the registry; target prop is declared in
  the component's `propsSchema`). All resolution is GRACEFUL (empty/dead/unknown →
  placeholder/blank, never 500 — mirror the unknown-component→hidden behavior).
- **Gate every slice:** CMS `tsc` + `npx opennextjs-cloudflare build` green (NEVER
  while `npm run dev` is up). Regen the PM `cms-bundle`. EN/FI/ET for new strings.
  No native confirm()/alert() — in-app modals only (browser-review sessions hang).

- **(Slice 0 DONE) The fence is built — USE it, don't reinvent.** All runtime SQL
  MUST go through `lib/content/content-db.ts` (`contentSelect`/`contentWrite`/
  `contentDdl`); they call `assertStatement` from `lib/content/fence.ts` before any
  D1 call. If you need a new SQL shape, make sure the system-generated string passes
  `validateStatement(sql, mode)` — e.g. it must contain a `content_*` identifier or
  the guard rejects it ("no content_* object referenced").
- **(Slice 0) The fence guard PARSES, it does not regex the raw SQL.** It strips
  single-quote literals + `--`/`/* */` comments, splits on `;` (multi-statement →
  reject), unwraps `"x"`/`[x]`/`` `x` `` quoted identifiers, then scans bare tokens.
  Keep DDL/DML SINGLE-statement (the fence rejects multi-statement). DDL via `exec()`
  takes NO bound params; DML/SELECT via `prepare().bind()` ARE parameterized.
- **(Slice 0) content-db functions take an injectable `D1Like` last arg** so node
  `--test` can drive them against a fake D1 without the CF runtime (importing the .ts
  is fine — `getCloudflareContext` only runs when no db is injected). Reuse this
  pattern in later slices' stores so they stay node-testable.
- **(Slice 0) The PostToolUse security hook flags `d1.exec()` as `child_process.exec`
  — FALSE POSITIVE.** It's the Cloudflare D1 database `exec` (SQL), no shell involved.
  Ignore that warning on the content-db module.
- **(Slice 0) `node --test` warns MODULE_TYPELESS_PACKAGE_JSON** on the .ts imports —
  harmless (CMS package.json has no `"type": "module"`; matches every other test).

- **`content-db.ts` is a SANCTIONED `env.DB` reader in the binding-adapters
  sole-reader guard** (`scripts/ports-sole-reader.guard.test.mjs`, fixed
  2026-06-22). It's allowlisted by EXACT PATH (`ALLOWLIST_FILES` set), NOT by
  directory, and a separate assertion pins it to EXACTLY ONE binding read. So:
  (a) keep content-db.ts's `env.DB` access to that ONE `liveDb()` site — a 2nd
  read there fails the guard; (b) any NEW raw-binding reader you introduce will
  fail this guard until you add its exact path to `ALLOWLIST_FILES` with a
  justification — that's intentional friction; route through the ports/the fence
  first, only widen the allowlist when there's truly no port path.

- **(Slice 1) Imports inside `src/` MUST use the `.ts` extension** (e.g.
  `import { isContentName } from "./fence.ts"`) — the project sets
  `allowImportingTsExtensions` and the `node --test` type-stripping loader resolves
  ONLY the explicit `.ts` path; a bare `./fence` import throws ERR_MODULE_NOT_FOUND
  in tests. Mirror content-db.ts / fence.ts.
- **(Slice 1) Generate the migration with `npx drizzle-kit generate`, never hand-write
  it** — it also writes `migrations/meta/0010_snapshot.json` + bumps
  `migrations/meta/_journal.json`; commit ALL THREE or the deployer's
  `wrangler d1 migrations apply` desyncs. New table 0010 = `collection`.
- **(Slice 1) System columns are RESERVED on every content table** (decided +
  emitted now): `id`(PK TEXT), `slug`, `status`(default 'draft'), `archived_at`
  (nullable ms), `created_at`/`updated_at`(ms). User field names can't collide
  (guarded). Slice 3 (items CRUD) MUST use exactly these names — don't reinvent.
- **(Slice 1) Generated DDL is fence-safe BY CONSTRUCTION** but DON'T trust that —
  Slice 2 must still pass each string through `contentDdl`/`validateStatement`
  before exec. `unixepoch()`/column names are non-keyword bare tokens the fence
  ALLOWS (they're not builtins); that's why `created_at INTEGER DEFAULT
  (unixepoch() * 1000)` clears the guard.

- **(Slice 2) SPLIT the route logic: PURE planner + thin live store.** Live D1
  (Drizzle reads + `contentDdl` exec) can't be unit-tested without a CF binding, so
  ALL the decisions (cap, `content_<slug>` derive, collision, DDL gen, value
  coercion) live in a PURE module (`collection-plan.ts`) returning a `PlanResult<T>`
  = `{ok:true,plan}` | `{ok:false,status,error}`; the store maps `!ok` → that HTTP
  status, `ok` → the effect. Routes just call the store + map status. Node-test the
  planner; build-verify the store/routes (HITL for live D1). Reuse this shape in 3/4.
- **(Slice 2) `createCollection` runs `contentDdl(CREATE)` BEFORE the registry
  INSERT** so a failed DDL leaves no orphan row; the `collection_table_name_unique`
  index is the final collision backstop → a unique-violation on insert returns 409
  (the table was created — orphan-table cleanup is a deliberate non-concern for v1,
  surface the real error rather than masking it with a DROP).
- **(Slice 2) The `[name]` URL segment IS the `content_<slug>` table name**, not the
  display name. `getCollection`/`addCollectionField`/`deleteCollection` look up by
  `table_name`. `DROP TABLE ${tableName}` is still fenced (it's a content_* identifier
  from the registry) — `contentDdl` re-validates, so even a corrupted registry name
  can't escape the namespace.
- **(Slice 2) Treat the POST/PATCH JSON body as UNTRUSTED** — `normalizeField(s)`
  coerces it to a clean `CollectionField[]` (drops unknown props, requires
  name+type) BEFORE the generator sees it; the generator's strict `COLUMN_NAME_RE`
  + system-column guard are the trust boundary. Don't pass raw body objects into
  the DDL generator.
