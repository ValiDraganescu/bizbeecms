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
- **(Slice 3) Item value COERCION rules (documented — Slices 4/5/6 depend on
  them):** bool/boolean→0|1; int→trunc; number→REAL; date/datetime/time→**ISO
  string TEXT** (accepts an ISO string OR an epoch-ms number, converts to ISO —
  NOT stored as ms, unlike the system timestamp columns which ARE ms); select→must
  match a declared option value; multiselect→**JSON-stringified array** of allowed
  values (TEXT); required rejects null/undefined/empty-string. `coerceFieldValue`
  is the single source — reuse it in Slice 4/6, don't re-coerce differently.
- **(Slice 3) ALL item SQL is `?`-parameterized via the PURE builders in
  `item-write.ts`** → `contentWrite`/`contentSelect`. The builders inline ONLY
  fixed table names + system column names + enum-derived clauses; EVERY user value
  is a bound param. Tests assert placeholder-count === params-length AND that no
  user value string appears in the SQL. Keep that invariant — never string-concat a
  value into item SQL.
- **(Slice 3) Archive is a PATCH `_op` control key, not a separate verb.** `PATCH
  .../items/[id]` with `{_op:"archive"|"unarchive"}` toggles `archived_at`; any
  other body = a field UPDATE (PATCH semantics: only supplied keys; `_op` is
  stripped before field updates). Don't add a separate archive route — Slice 5/6
  call this `_op` path.
- **(Slice 3) The `_op` key is reserved on item PATCH bodies** — a user field can't
  be named `_op` anyway (field names must match `^[a-z][a-z0-9_]*$`, no leading
  underscore), so there's no collision.
- **(Slice 3) write ops return 404 on 0 changes** (`contentWrite` returns
  `meta.changes`) — that's how update/archive/delete distinguish "item not found"
  from success. Don't assume a write succeeded; check the change count.
- **(Slice 4) Column NAMES go into the query SQL — they MUST be whitelisted, not
  bound.** `compileQuery`/`compileCount` build a `queryableColumns` map (user
  registry fields + the 6 SYSTEM_COLUMNS as synthetic descriptors); a filter/sort
  field NOT in that map → 400, never reaches the SQL. Identifiers can't be `?`-bound
  in SQLite, so this whitelist IS the safety. Slice 5/6 + Phase-2 binding (List
  query) must reuse this compiler — don't build a second query path that inlines a
  raw column name.
- **(Slice 4) Every filter VALUE is coerced via Slice-3 `coerceFieldValue` then
  bound.** Reuse it — don't re-coerce differently. `like`/`search` wrap `%needle%`
  on the BOUND PARAM, never in the SQL string. `in` → N placeholders (one bound,
  coerced value each; empty array = 400). `is_null`/`not_null` take NO value/param.
- **(Slice 4) `LIMIT 1000`/`OFFSET 40` are inlined as PLAIN integers** (clamped,
  validated finite) — so a "no user value inlined" test that does
  `!sql.includes("10")` false-fails on `LIMIT 1000`/value 10. Strip the LIMIT/OFFSET
  clause before that assertion (the test does).
- **(Slice 4) search with NO text fields emits `0 = 1`** (matches nothing) rather
  than silently dropping the search intent. Text-affinity types scanned:
  string/text/richtext/select/multiselect/ref/asset.

- **(Slice 2) Treat the POST/PATCH JSON body as UNTRUSTED** — `normalizeField(s)`
  coerces it to a clean `CollectionField[]` (drops unknown props, requires
  name+type) BEFORE the generator sees it; the generator's strict `COLUMN_NAME_RE`
  + system-column guard are the trust boundary. Don't pass raw body objects into
  the DDL generator.

- **(Slice 5) The CMS i18n catalogs live in `CMS/messages/{en,fi,et}.json`** (NOT in
  src/), loaded by `src/i18n/request.ts`. The admin-nav label+desc for a new section
  go under `adminNav.<key>` + `adminNav.desc.<key>`, AND the section must be added to
  `src/components/admin-sections.ts` ADMIN_SECTIONS (it's a PLAIN module, not a client
  component — see its header comment). Slice 5 added the whole `collections` namespace.
- **(Slice 5) This was the FIRST content-collections slice with user strings** — so
  the `cms-bundle` regen (`npm run bundle:cms` from ProjectManager/) was finally
  needed here. Slices 2-4 added none. Any future slice that adds CMS UI strings MUST
  regen the bundle or the deployed CMS ships stale copy.
- **(Slice 6) AI tools reuse the Slice 2-4 STORES directly (not the REST routes) —
  one shared registry, no fork.** New tools land in `lib/chat/collection-tools.ts`
  (PURE schemas + arg validators, node-testable) + are wired in `tool-dispatch.ts`
  (TOOL_BY_NAME registry + HANDLERS map) + named in `tool-scopes.ts`
  (KNOWN_TOOL_NAMES + a context's TOOLS_BY_CONTEXT). The chat route auto-derives
  schemas/dispatch from the registry → it needs NO edits when you add a tool; just
  keep the name in all THREE places (KNOWN_TOOL_NAMES, TOOL_BY_NAME, HANDLERS) or a
  test/registry-coverage check fails. `archive_collection_item` is ONE tool that
  op-switches archive|unarchive|delete (the USER asked for archive/delete combined).
- **(Slice 6) Tool descriptions are MODEL-facing, NOT UI strings — NO cms-bundle
  regen, NO EN/FI/ET.** Only CMS *UI* copy (messages/*.json, admin-nav) triggers the
  bundle regen (Slice 5 did). A slice that ONLY adds AI-tool schemas/prompts skips it.
- **(Slice 6) The stores return `PlanResult<T>` (`{ok,plan}` | `{ok:false,status,
  error}`)** — map `!ok` → `{ok:false, errors:[res.error]}` in the handler so the
  model gets a recoverable message; the dispatcher tags `name` and never throws.

- **(Slice A) The renderer lives at `CMS/src/lib/render/`, NOT `lib/content/`.**
  `tree.ts` (`Block`/`BindingRef`/`planPage`/`planTree`, PURE+SYNC) + `render-page.tsx`
  (`buildPlanFromPage`, the async D1+hydrate seam). Backlog hints that say
  `lib/content/tree.ts` mean `lib/render/tree.ts`. `lib/content/` is the collections
  data layer (fence/registry/items/query/binding).
- **(Slice A) Binding hydration happens in `buildPlanFromPage` BEFORE `planPage`** —
  `hydrateBlockBindings(blocks)` recursively walks the tree, runs each binding's
  first-match `queryCollection` (Slice-4, limit 1) in parallel, and `hydrateProps`
  copies `row[field]→props[prop]`. NEVER make `planPage`/`planTree` async. Slice B
  (`List` block) must add its per-row query the SAME way: fetch rows in
  `buildPlanFromPage`, then stamp in a PURE `planList`.
- **(Slice A) `BindingRef.source.filter[].op` is loosely typed `string`** on purpose
  (author/AI supplies it); the Slice-4 query compiler whitelists ops at RUNTIME
  (unknown op → 400 → graceful blank). That's why `render-page.tsx` casts
  `bindingQuerySpec(b) as QuerySpec` — don't tighten the BindingRef op type or you'll
  duplicate the compiler's whitelist.
- **(Slice A) `SYSTEM_COLUMNS` is a string[] (`["id","slug",...]`), NOT objects** —
  `columnNames()` spreads it directly. (Mapped/filter/sort fields may target a system
  column OR a user field; binding validation allows both.)
- **(Slice A) Binding hydration is GRACEFUL by design and is the LIVE source of truth
  when it resolves:** a resolved binding OVERWRITES a static `props` value; an
  unresolved one (no match / dead collection / query error) leaves the static value
  (or blank). `hydrateProps` is pure; the async shell catches query errors → null row.

- **(Slice B) `List` is a BUILT-IN block (`LIST_COMPONENT="List"`), NOT a D1
  component — drop it from EVERY component-existence check.** It's now in
  `BUILTIN_COMPONENTS` + `isBuiltinComponent()` (`render/tree.ts`). `page-blocks.ts`
  already loops `isBuiltinComponent` so any NEW built-in is auto-excluded. The List
  block carries List-ONLY fields: `listSource` (query: collection+filter/sort/limit),
  `listMap` (rowField→templateProp), `listRole` ("template"|"empty" on children),
  and `listRows` (host-hydrated, NEVER authored). Don't put the query under `props`.
- **(Slice B) List rows are hydrated in `buildPlanFromPage`, stamped in PURE
  `planList`.** Same hydrate-before-walk seam as Slice A: the async shell runs
  `queryCollection(listSource.collection, {filters,sort,limit} as QuerySpec)` and
  stashes `res.plan.items` onto `block.listRows`; `planList` (sync, in `planBlock`)
  partitions children into template (`listRole !== "empty"`) vs empty-state, and
  for each row clones the template via `stampRow` injecting `listMap` fields into
  each block's `props`. The PER-PROP allowlist is enforced DOWNSTREAM by
  `planBlock`/`bindTree` (the component's propsSchema) — `planList`/`stampRow` set
  props loosely; an undeclared/unknown mapped prop simply never reaches a slot.
  GRACEFUL: empty/dead/un-hydrated → empty-state slot or nothing, never a throw.
  Cast `as QuerySpec` (listSource filter `op` is loose `string`, compiler
  whitelists at runtime — same reason as Slice A's `bindingQuerySpec`).
- **(Slice B) Renderer logic, NO new user strings → NO cms-bundle regen.** The
  OPERATOR UI to author Lists (collection picker, drop template, map props,
  empty-state) is Slice C and WILL add EN/FI/ET + need the regen. Slice C also wires
  the page-builder to actually EMIT List blocks (today nothing produces one).

- **(Slice 5) Admin UI talks to the Slice 2-4 REST routes only — no new data path.**
  Item create OMITS empty-string field values so column DEFAULTs apply; edit sends
  all keys (PATCH semantics). multiselect round-trips as a JSON-array string (parse on
  read for display + edit). `[name]` in the page route IS the content_<slug> table
  name, same as the API. Reuse `field-input.tsx`/`confirm-modal.tsx` in Phase-2
  binding UI (Slice C) rather than rebuilding inputs.
