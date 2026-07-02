# Journal — site-export-import
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-07-02 19:03 — Design + inventory slice: wrote FORMAT.md
- **Status:** DONE
- **What I did:** Read `CMS/src/db/schema.ts` in full (all 17 named tables) and
  `CMS/src/db/settings-store.ts` (the complete `site_settings` key list: 10 keys —
  content_locales, theme_overrides, theme_overrides_dark, site_identity,
  model_catalog, image_model, translate_model, image_gen_model, icon_set,
  api_cache_versions). Mined `archive/component-kits` (`CMS/src/lib/components/portable.ts`
  — the `bizbeecms.component`/`bizbeecms.kit` envelope + trust-boundary pattern to
  mirror one tier up as `bizbeecms.site`) and `archive/content-collections`
  (`collection-schema.ts`'s `buildCreateTableSql`/`buildAddColumnSql`, the Slice-0
  fence in `content-db.ts`/`fence.ts`, and `collection-store.ts`'s create/drop
  order) for the fenced-DDL machinery import must reuse verbatim. Also checked
  `lib/ports/db.ts` + `lib/ports/storage.ts` (the Db/Storage ports export/import
  must go through) and confirmed `fflate` is NOT an installed dependency
  (`package.json`). Wrote `goals/site-export-import/FORMAT.md`: the full table
  inventory + export/do-not-export split, the `bizbeecms.site` v1 envelope shape,
  the collection-row encoding rule (generic `SELECT *` → JSON, no per-type coding
  needed since D1 already stores bool/date as int), the asset size-strategy
  decision (manifest + per-asset fetch/upload protocol, NOT a single zip — no
  fflate installed + Workers' ~100MB body ceiling + the Storage port is already
  per-key `put/get/delete`), the collection-recreation rule (import MUST call
  `buildCreateTableSql` + `contentDdl`, never hand-author DDL), and the exact
  destructive-import reset plan (wipe order, preserve list, restore order,
  idempotency-by-construction via unconditional wipe).
- **Verified:** Cross-checked every table name/column claim directly against
  `schema.ts` (read in full, not skimmed) and every settings key against the
  actual `_KEY` constants in `settings-store.ts` (not GOAL.md's prose, which only
  gestured at "theme, brand identity, content locales, AI persona/prompts
  config" — the real key list is now enumerated exactly). Confirmed `fflate`
  absence via `package.json`. No product code touched this run, per the task's
  own scope.
- **Files:** `goals/site-export-import/FORMAT.md` (new), `BACKLOG.md` (flipped
  first TODO to DONE), `JOURNAL.md`, `NEXT.md`.

## 2026-07-02 19:08 — Export core: GET /api/site-export (tracer, no asset bytes)
- **Status:** DONE
- **What I did:** Built the `bizbeecms.site` v1 envelope per FORMAT.md §3/§7,
  split into a PURE serializer + a thin route:
  - `CMS/src/lib/site-export/site-export.ts` — `buildSiteExport(input)`, zero
    D1/CF/`@/` imports (node-testable). Takes already-fetched rows (Drizzle
    `$inferSelect` shapes, locally re-declared as structural interfaces so the
    file has no runtime deps) and returns the envelope: `format`/`version`/
    `meta` (`exportedAt`/`cmsVersion`/best-effort `siteName` from the
    `site_identity` settings row)/`counts`/`tables.*`/`collectionData`. Every
    `timestamp_ms` column normalizes to epoch-ms via `toEpochMs` (accepts both
    `Date` and already-numeric, so fixtures don't need real `Date` objects).
    `data_source` rows drop `secretEnc` entirely and add a derived `hasSecret`
    boolean (mirrors `data-source-store.ts`'s existing `toSafeSource` pattern —
    same trust rule, re-expressed here since this module can't import that
    store without pulling in D1-coupled code). `asset` rows are metadata only,
    no bytes field (that's the next BACKLOG task).
  - `CMS/src/app/api/site-export/route.ts` — `GET`, `requireAdmin`-gated
    (same guard every other admin REST route uses). Reads `page`, `pageVersion`
    (ALL rows, not just current draft/live — full history per FORMAT.md §2),
    `component`, `collection`, `siteSettings`, `promptVersion`, `dataSource`,
    `dataSourceRequest`, `asset` via the `Db` port (Drizzle, one
    `Promise.all([...])` batch), then one `contentSelect("SELECT * FROM " +
    tableName)` per registered collection (the existing fenced read path —
    `MAX_READ_ROWS` cap of 1000/table is an existing, accepted platform limit,
    not something this task changes). Hands everything to `buildSiteExport`,
    returns the envelope as a downloadable `site-export.json` JSON response.
    `cmsVersion` sourced from `process.env.NEXT_PUBLIC_CMS_VERSION` (already
    wired build-time from `package.json` in `next.config.ts` for the sidebar
    version badge — reused rather than adding a new `package.json` import,
    which risks breaking under OpenNext/Workers bundling).
  - `CMS/src/lib/site-export/site-export.test.ts` — 8 unit tests: envelope
    format/version, `siteName` extraction (present/absent/malformed JSON),
    epoch-ms normalization for both `Date` and numeric inputs, `secretEnc`
    NEVER present + `hasSecret` derived correctly (both with and without a
    secret), `counts` (array lengths + summed `collectionData` rows across
    multiple collections), a collection with no matching `collectionData` key
    exports empty rows instead of crashing, and asset rows have no bytes field.
- **Verified:** `node --test src/lib/site-export/site-export.test.ts` — 8/8
  pass. `npx tsc --noEmit` — clean, zero errors. `npm test` (full suite) —
  1476/1476 pass, 0 fail (includes the 8 new tests). Live smoke-tested against
  the running `:3602` dev server (dev was already up, could NOT run
  `opennextjs-cloudflare build` per CLAUDE.md — would've corrupted `.next`):
  `curl http://localhost:3602/api/site-export` → HTTP 200, real envelope with
  `format:"bizbeecms.site"`, `version:1`, `counts:{pages:13,pageVersions:136,
  components:41,collections:7,collectionRows:73,assets:61,dataSources:6,
  dataSourceRequests:12,promptVersions:2}` against the actual local tableonline
  site data, confirmed via a small Python check that NO `dataSource` row in the
  live response contains a `secretEnc` key.
- **Files:** `CMS/src/lib/site-export/site-export.ts` (new), `CMS/src/lib/site-export/site-export.test.ts`
  (new), `CMS/src/app/api/site-export/route.ts` (new), `BACKLOG.md` (flipped
  "Export core" TODO to DONE), `JOURNAL.md`, `NEXT.md`.

## 2026-07-02 19:13 — Export assets: GET /api/site-export/asset/<key> streaming route
- **Status:** DONE
- **What I did:** Added `CMS/src/app/api/site-export/asset/[...key]/route.ts` per
  FORMAT.md §4's settled manifest+per-asset protocol. `requireAdmin`-gated
  (same guard as every other admin REST route + the sibling `GET /api/site-export`).
  Mirrors the public `/media/[...key]/route.ts` streaming pattern (catch-all
  segment since asset keys contain `/`, e.g. `assets/foo_123_abc.png`) but two
  deliberate differences: (1) content-type is read from the `asset` D1 row
  (`schema.asset`, looked up by `key` via the `Db` port), not R2 `httpMetadata`
  — keeps this route's only I/O dependency the same `Db`+`Storage` port pair
  `GET /api/site-export` already uses, and matches what the envelope's
  `tables.asset[].contentType` already claims for that key; (2) no
  cache-control/etag/SVG-sandbox headers — this endpoint is an operator-only
  export leg, not the public image-serving path, so those headers don't apply
  (added `content-disposition: attachment` instead, for a sane filename on
  direct download). Reused `isValidAssetKey` (traversal guard) unchanged. 404s
  on invalid key shape, missing D1 row, or missing R2 object (three distinct
  early-outs, all same 404 response — no need to leak which case).
  No changes to `GET /api/site-export` itself (`tables.asset` already lists
  every key, per Export core's explicit metadata-only scoping).
- **Verified:** `npx tsc --noEmit` — clean. `npm test` — 1476/1476 pass (route is
  a thin I/O wrapper — guard + one D1 lookup + one `Storage.get` — no pure logic
  to unit-test per this repo's "test business logic only" discipline; no
  colocated `route.test.ts` exists for any other `api/*/route.ts` either, so this
  matches convention). Live round-trip check against the running `:3602` dev
  server (already up, did NOT run `opennextjs-cloudflare build`): picked a real
  1.5MB gallery PNG from `GET /api/assets`, fetched it via the NEW
  `GET /api/site-export/asset/<key>` route AND via the existing public
  `GET /media/<key>` route, compared both downloads — identical byte size
  (1,540,277 bytes) and identical `sha256` checksum
  (`3f3c5c3...b3512d`), confirming byte-identical round-trip through the
  `Storage` port. Also curl-verified the guard rails: a traversal-shaped key
  (`../../etc/passwd`, URL-encoded) → 404 (rejected by `isValidAssetKey` before
  any D1/R2 call), a validly-shaped but nonexistent key → 404 (D1 row miss),
  bare `/api/site-export/asset/` (no key segment) → 308 (Next's own catch-all
  redirect behavior, not a route bug).
- **Files:** `CMS/src/app/api/site-export/asset/[...key]/route.ts` (new),
  `BACKLOG.md` (flipped "Export assets" TODO to DONE), `JOURNAL.md`, `NEXT.md`.

## 2026-07-02 19:17 — Import validate + dry-run: POST /api/site-import/validate
- **Status:** DONE
- **What I did:** Implemented FORMAT.md §6 Steps A + B, split into a PURE
  validator/report-builder + a thin route (same discipline as Export core):
  - `CMS/src/lib/site-export/site-import-validate.ts` — `validateSiteImport(artifact,
    getWillDestroy)`, zero D1/CF/`@/` imports. Step A: `format`/`version` gate
    (hard-fail, names the exact bad value), every `tables.*` key present +
    array (hard-fail, names the exact bad key — e.g. `"tables.component must be
    an array"`), `tables.collection.length <= 100` cap (checked but NOT a
    hard-fail — see below). Step B: builds the dry-run report — `willCreate`
    computed from the artifact's own `tables.*`/`collectionData` array lengths
    (never trusts the artifact's `counts` block for this), `counts` vs actual
    length mismatch appended as a WARNING string (not hard-fail, per FORMAT.md
    §6 Step A's explicit "informational/HITL-sanity" framing), collection cap
    over 100 is ALSO a warning not hard-fail (FORMAT.md's own dry-run report
    shape has `collectionCapOk` as a boolean field the UI surfaces, not a
    reason to refuse rendering the report at all — a hard-fail there would
    prevent the operator from ever SEEING why via the dry-run UI), and
    `secretsToReenter` filters `tables.dataSource` for `hasSecret === true`.
    `willDestroy` comes from an **injected count-provider** callback (FORMAT.md
    §7's own instruction), called only on the non-hard-fail path (an invalid
    artifact never triggers a live D1 count) — this is what keeps the whole
    report-builder pure/synchronous-shaped and unit-testable without D1.
  - `CMS/src/app/api/site-import/validate/route.ts` — `POST`,
    `requireAdmin`-gated (same guard as every other admin route incl. the
    sibling export routes). Parses the posted JSON body (malformed JSON → 400
    `{ok:false,error:"request body must be valid JSON"}` before ever touching
    the validator), then supplies the count-provider closure: counts CURRENT
    target rows for `page`/`component`/`collection`/`dataSource`/
    `promptVersion`/`asset` via the `Db` port (one `Promise.all`, matching
    Export core's read pattern) plus a per-collection `contentSelect("SELECT *
    FROM content_x")` loop for `collectionRows` (same `MAX_READ_ROWS`-capped
    fenced read path Export core already uses — an existing, accepted
    platform limit, not something this task changes). Zero writes anywhere in
    this route — purely read-only counts + the pure validator call. Returns
    the report as JSON, HTTP 200 if `ok:true`, HTTP 400 if `ok:false`
    (hard-fail).
  - `CMS/src/lib/site-export/site-import-validate.test.ts` — 13 unit tests:
    non-object artifact, wrong format (names the bad value), wrong version,
    missing `tables` object entirely, a `tables.*` key present-but-wrong-typed
    (names the exact key), a `tables.*` key missing entirely (names the exact
    key), collection cap OK under 100 (no warnings), collection cap exceeded
    is a WARNING not hard-fail, `counts` mismatch is a WARNING not hard-fail,
    `willCreate` reflects the artifact's own array lengths (not the `counts`
    block), `secretsToReenter` only lists `hasSecret:true` rows, `willDestroy`
    passes through the injected provider's return value unmodified, and a
    hard-fail path NEVER calls the count-provider (asserted via a
    call-tracking closure) — proving the "no writes / no D1 touch on invalid
    input" contract at the unit level, not just by inspection.
- **Verified:** `node --test src/lib/site-export/site-import-validate.test.ts`
  — 13/13 pass. `npx tsc --noEmit` — clean, zero errors. `npm test` (full
  suite) — 1489/1489 pass, 0 fail (1476 prior + 13 new). Live smoke-tested
  against the running `:3602` dev server (already up, did NOT run
  `opennextjs-cloudflare build`): (1) a deliberately wrong-format body →
  `HTTP 400`, `{"ok":false,"error":"unsupported format \"bizbeecms.kit\" —
  expected \"bizbeecms.site\""}`; (2) malformed (non-JSON) body → `HTTP 400`,
  `"request body must be valid JSON"`; (3) **real round-trip**: `curl
  GET /api/site-export` (the live tableonline site's actual export, 1.5MB)
  piped straight into `POST /api/site-import/validate` → `HTTP 200`,
  `ok:true`, `willDestroy` exactly equal to `willCreate` for every key
  (expected: same instance, so "what's there now" == "what the export
  contains") — `pages:13, components:41, collections:7, collectionRows:73,
  assets:61, dataSources:6, promptVersions:2`, `collectionCapOk:true`,
  `warnings:[]`, and `secretsToReenter` correctly listed the 4 real
  httpbingo-fixture data sources that have `hasSecret:true` (basic/header/
  header/query auth types) — confirms the count-provider's live D1 counts,
  the validator's array-length `willCreate`, and the secrets filter all agree
  end-to-end against real data, not just fixtures.
- **Files:** `CMS/src/lib/site-export/site-import-validate.ts` (new),
  `CMS/src/lib/site-export/site-import-validate.test.ts` (new),
  `CMS/src/app/api/site-import/validate/route.ts` (new), `BACKLOG.md` (flipped
  "Import validate + dry-run" TODO to DONE), `JOURNAL.md`, `NEXT.md`.

## 2026-07-02 19:26 — Import execute: the destructive path (FORMAT.md §6 Step C)
- **Status:** DONE
- **What I did:** Built `POST /api/site-import` (operator-only, DESTRUCTIVE) per
  FORMAT.md §6 Step C verbatim. Confirmation contract (not pinned by FORMAT.md,
  decided this run): request body is `{artifact, confirm}`; `confirm` must equal
  the artifact's `meta.siteName` EXACTLY (case-sensitive) — a blank `siteName`
  (no `site_identity` row set on the source) can NEVER be confirmed and the
  import is refused outright with a named error, rather than silently accepting
  an empty/omitted `confirm`. Pure planner `CMS/src/lib/site-export/site-import-execute.ts`
  (`planImport`, `checkConfirmation`, `WIPE_BUILTIN_TABLES`, `PRESERVED_TABLES`)
  re-validates format/version/tables-shape (defensively — never trusts the
  caller already ran `/validate`) and additionally HARD-BLOCKS (not
  warning-only, unlike dry-run) if `tables.collection.length > 100` — resolves
  the CAVEATS.md-documented cap ambiguity exactly as flagged: warning in
  validate, hard block in execute. `planImport` returns the full ordered
  wipe+restore plan as DATA (table names, rows, `secretEnc` already nulled) so
  it stays a pure, mocked-port-testable function; the route
  (`CMS/src/app/api/site-import/route.ts`) is the thin executor that walks the
  plan: DROP every `content_*` table in the current registry (fenced
  `contentDdl`) → delete all rows from `collection, page_version, page,
  component, data_source_request, data_source, prompt_version, asset,
  site_settings` (via the plain `Db` port — `user/session/invite/
  password_reset/login_attempt/api_key/icon_cache/chat_thread` never touched,
  not in the wipe list) → recreate each collection's table via
  `buildCreateTableSql`/`contentDdl` (never hand-authored DDL, per CAVEATS) →
  insert collection rows via parameterized `contentWrite` → collection registry
  rows → components → pages → page versions → site settings → prompt versions
  → data sources (secretEnc forced `null`) → data source requests → asset
  metadata rows (bytes are a follow-up per-key upload leg, out of scope this
  run per NEXT.md). Response includes `assetKeysToUpload` (every asset key
  needing its bytes re-uploaded next).
- **Bug found + fixed via live verification (would NOT have been caught by
  unit tests alone):** D1's per-statement bound-parameter cap is 100 —
  `db.insert(table).values([...])` compiles ALL rows into ONE multi-row INSERT
  with every cell bound, so a wide table (e.g. `component`'s 16 columns) 500s
  after only ~6-7 rows in a single artifact-sized insert. Added `insertRows()`
  in the route: chunks any builtin-table insert so `chunkSize = floor(90 /
  columnCount)`, comfortably under the cap regardless of table width. Confirmed
  empirically against the live dev D1: 5 `component` rows (80 params) succeeds,
  8 rows (128 params) 500s with no D1 error surfaced to the client (silent
  request failure) — this is now a CAVEATS entry since it's a hard Workers/D1
  constraint, not specific to this task.
- **Verified:** `npm test` — 1500/1500 pass (13 new tests in
  `site-import-execute.test.ts`: confirmation contract, format/version
  re-checks, hard cap block at/over 100, plan shape mirrors artifact tables
  verbatim, `secretEnc` always nulled, `WIPE_BUILTIN_TABLES`/`PRESERVED_TABLES`
  never overlap and match FORMAT.md's exact order). `tsc --noEmit` clean.
  **Live end-to-end on `:3602`** (dev server already running, did NOT run
  `opennextjs-cloudflare build`): exported the real tableonline site (13
  pages/136 pageVersions/41 components/7 collections/73 collectionRows/61
  assets/6 dataSources/12 dataSourceRequests/2 promptVersions), synthesized a
  non-empty `meta.siteName` (source site has none set — confirmed the
  blank-siteName refusal path first: `{"ok":false,"error":"artifact has no
  meta.siteName to confirm against — cannot import"}`), then POSTed the SAME
  artifact back with the matching `confirm` — re-importing into the SAME
  instance is FORMAT.md/NEXT.md's own suggested simplest smoke test. Result:
  `{"ok":true,"restored":{...all 9 keys matching the export counts exactly...}}`,
  home page re-rendered `200` with the correct `<title>`, D1 counts matched
  (`page:13, component:41, collection:7, site_settings:12, data_source:6,
  asset:61, content_restaurants:42`), `data_source.secret_enc` confirmed
  `NULL` on every row, `user` table untouched (2 rows preserved throughout).
  **Idempotency**: re-POSTed the exact same artifact a SECOND time — `200 OK`
  again, counts unchanged, home page still renders — confirms "a failed import
  must be re-runnable" by the unconditional-wipe design, no rollback machinery
  needed.
- **Not built this run (explicitly out of scope per NEXT.md):** the per-key
  asset BYTES upload route (`POST /api/site-import/asset/<key>`, FORMAT.md §4's
  second leg) and the Admin UI. `assetKeysToUpload` in the response is the
  checklist a future UI/route drives against.
- **Files:** `CMS/src/lib/site-export/site-import-execute.ts` (new),
  `CMS/src/lib/site-export/site-import-execute.test.ts` (new),
  `CMS/src/app/api/site-import/route.ts` (new), `BACKLOG.md` (flipped "Import
  execute" TODO to DONE), `CAVEATS.md`, `JOURNAL.md`, `NEXT.md`.

## 2026-07-02 19:31 — Asset bytes upload leg: POST /api/site-import/asset/<key>
- **Status:** DONE
- **What I did:** Added `CMS/src/app/api/site-import/asset/[...key]/route.ts` —
  the FORMAT.md §4 second import leg, the upload counterpart to
  `GET /api/site-export/asset/<key>`. `POST /api/site-import/asset/<key>`:
  `requireAdmin` guard, `isValidAssetKey` traversal guard (identical to
  export's asset route), looks up the key in the (already import-execute-
  restored) `asset` table and 404s with a named error if it's not there
  (refuses to `Storage.put` bytes under a key the metadata doesn't know
  about — an operator can't smuggle an arbitrary R2 object key through this
  route), reads the raw request body via `request.arrayBuffer()`, and calls
  `Storage.put(key, bytes, {contentType: row.contentType})`. Resolved the two
  open questions NEXT.md left: (a) yes, verify the key exists in `asset`
  first; (b) content-type is READ FROM THE D1 ROW (restored by import
  execute, same value the export side captured), NOT trusted from the
  client's request header at all — the route ignores any client
  `content-type` header entirely rather than merely validating against it
  (simpler and strictly safer: the row is authoritative, there's nothing a
  mismatched header could legitimately override). No pure-logic extraction
  needed — this route is a thin passthrough exactly like `GET
  /api/site-export/asset/<key>`, which likewise has no dedicated unit test
  file; both routes' only "logic" is the guard + one D1 lookup + one port
  call, already covered by `isValidAssetKey`'s own tests and manual/live
  verification.
- **Verified:** `npx tsc --noEmit -p CMS` clean. `npm test` in `CMS/`: 1500/1500
  pass (no regressions; no new pure logic to unit-test per above). LIVE
  round-trip on the real dev D1/R2 (`:3602`, dev server already running, did
  NOT run `opennextjs-cloudflare build`): picked a real gallery asset
  (`assets/auj8y5_1782300296745_ccc1e2cf.jpg`, 88664 bytes, `image/jpeg`),
  downloaded it via `GET /api/site-export/asset/<key>`
  (sha256 `ea1f574f...28a2`), re-uploaded the SAME bytes to the SAME key via
  the new `POST /api/site-import/asset/<key>` (`{"ok":true,"key":...,
  "size":88664}`), re-downloaded via the export route again — sha256
  IDENTICAL — then hit the PUBLIC `/media/<key>` route: `200`,
  `content-type: image/jpeg`, `size: 88664` — confirms it actually renders
  post-round-trip, not just that R2 accepted the bytes. Also verified both
  guards live: a traversal-attempt key (`..%2f..%2fetc%2fpasswd`) → `404`;
  a syntactically-valid but not-yet-restored key → `404` with the named
  "not in the restored asset table" error, no `Storage.put` call made.
- **Files:** `CMS/src/app/api/site-import/asset/[...key]/route.ts` (new),
  `BACKLOG.md` (flipped this TODO to DONE), `JOURNAL.md`, `NEXT.md`.

## 2026-07-02 19:39 — Admin UI: Settings → "Export / Import"
- **Status:** DONE
- **What I did:** Built the whole client-side orchestration UI per FORMAT.md
  §4/§6/§7 and NEXT.md's suggested flow, driving the already-shipped API
  surface with zero new server code:
  - `CMS/src/app/admin/settings/export-import/page.tsx` — server component
    shell (mirrors `theme`/`api-keys` pages: `SettingsNav` + header +
    `getTranslations`), renders the client manager.
  - `CMS/src/components/settings/export-import-manager.tsx` — the whole flow,
    one `"use client"` component (matches the repo's existing pattern: one
    manager component per Settings sub-page, e.g. `ApiKeysManager`,
    `ThemeEditor`):
    - **Export**: button → `GET /api/site-export` → client-side
      `Blob`+`<a download>` triggers a `site-export-<name>-<ts>.json` file
      save (no server changes — same envelope every prior task already
      built). Below it, every `tables.asset[]` entry renders as a row with a
      "Download" link that fetches `GET /api/site-export/asset/<key>` client-
      side and triggers its own `<a download>` — chose this over a
      client-side zip (no zip lib installed; FORMAT.md §4 explicitly reasoned
      against bundling into one blob) — "one export" stays ONE primary click
      (the JSON), with assets individually available right below rather than
      a second required step.
    - **Import**: file `<input>` (JSON only) → `pickFile` reads+parses text
      client-side (bad JSON caught before ever POSTing) → `POST
      /api/site-import/validate` with the raw parsed body (route expects the
      artifact directly, NOT wrapped) → renders the dry-run report
      (`willDestroy`/`willCreate` side-by-side, `collectionCapOk`-derived hard
      warning that also disables the confirm button, `warnings[]`,
      `secretsToReenter[]` with a re-entry hint) → a `<input multiple>` file
      picker for the gallery assets the user separately downloaded from the
      SOURCE site's export screen → a typed-confirmation text input that
      must equal `artifact.meta.siteName` EXACTLY (case-sensitive, per
      `checkConfirmation`'s contract from Import execute) — **a blank
      `meta.siteName` disables the input entirely and shows a named error**,
      matching the route's own "blank siteName can never be confirmed"
      refusal (verified live: the real tableonline site currently has NO
      `site_identity` row, so this exact path is what a real operator hits
      today, not just a theoretical case) → `POST /api/site-import` with
      `{artifact, confirm}` (matches `planImport`'s exact body shape) → on
      success, sequentially uploads every key in the response's
      `assetKeysToUpload` via `POST /api/site-import/asset/<key>` with the
      raw file bytes (`file.arrayBuffer()` as the body, matching the route's
      `request.arrayBuffer()` read), matching picked files by exact filename
      first then by the key's final path segment as a fallback (asset keys
      are `assets/<slug>_<ts>_<hash>.<ext>`, filenames are the original
      upload name) → progress counter (`done`/`total`) → final report
      (restored counts, any upload failures named, a secrets-re-entry
      reminder if applicable, "import another file" reset).
  - `CMS/src/components/settings/settings-nav.tsx` — added the `exportImport`
    tab (`/admin/settings/export-import`), same pattern as every other tab.
  - `CMS/messages/{en,fi,et}.json` — added `exportImport.*` (28 keys) +
    `settingsNav.exportImport` to all 3 locales via one Python script (kept
    them in sync, avoided a partial-locale gap).
- **Design decisions not pinned by FORMAT.md/NEXT.md, made this run:**
  - No `t.rich()` — the repo has zero prior `t.rich` usage anywhere, so kept
    the confirm-label copy as plain `t()` + a separate `<strong>` for the
    site name instead of introducing a new next-intl pattern for one label.
  - Asset upload matching is by-filename (exact) then by-key-tail (fallback)
    since the export UI's per-asset download uses the ORIGINAL `filename`
    (not the storage `key`) as the saved file's name — an operator re-picking
    those exact downloaded files in the import step will match by filename;
    the key-tail fallback covers a user who renames/re-selects differently.
  - Collection-cap-exceeded (`collectionCapOk:false`) additionally disables
    the execute button client-side (not just a red warning banner) — the
    route hard-blocks it anyway (Import execute's CAVEATS-documented
    warning-vs-hard-fail split: warn in validate, hard-block in execute), so
    surfacing the eventual failure at the confirm-button level avoids a
    guaranteed-to-fail POST.
- **Verified:** `npx tsc --noEmit` clean. `npm test` — 1500/1500 pass
  (no new pure logic here — this is UI orchestration calling already-tested
  server logic, matches the repo convention of no test file for thin/UI-only
  components, e.g. `ApiKeysManager` has none either). Live-verified against
  the running `:3602` dev server (already up, did NOT run `opennextjs-
  cloudflare build`): (1) `GET /admin/settings/export-import` → `200`, page
  renders with the new nav tab + both sections' copy; (2) curl-simulated the
  EXACT fetch calls my client code makes — `GET /api/site-export` (real
  envelope, `siteName:""` confirming the blank-name UI path is real, not
  theoretical), `GET /api/site-export/asset/<key>` with a `/`-containing key
  exactly as my template string builds it (200, correct bytes) confirming the
  catch-all route resolves my URL construction correctly, `POST
  /api/site-import/validate` with the raw unwrapped artifact body (matches
  `pickFile`'s fetch) → `ok:true` dry-run report shape matches my
  `DryRunReport` interface field-for-field; (3) full destructive round-trip:
  patched the artifact's `meta.siteName` to a test value, POSTed `{artifact,
  confirm}` to `/api/site-import` (exact body shape `runImport` sends) →
  `{"ok":true,"restored":{...},"assetKeysToUpload":[...]}` — response shape
  matches my `ImportResult` interface exactly, then confirmed
  `GET /` still renders `200` post-import (same-instance smoke test, the
  documented-safe pattern from the Import-execute task's own JOURNAL entry).
  No `.claude-in-chrome` browser tools were available in this run's toolset
  (not granted to this Meeseeks instance) — verification was via the exact
  same HTTP calls the client issues rather than clicking through Chrome;
  every fetch URL/body/response-shape the component depends on was checked
  against the real live server, not just against route source code.
- **Not built this run**: the E2E/HITL cross-instance slice (BACKLOG's last
  remaining TODO) — that needs a genuinely SECOND CMS instance (scratch local
  D1 or `bizbeecms-cms-test-1`), out of scope for this UI task.
- **Files:** `CMS/src/app/admin/settings/export-import/page.tsx` (new),
  `CMS/src/components/settings/export-import-manager.tsx` (new),
  `CMS/src/components/settings/settings-nav.tsx`, `CMS/messages/en.json`,
  `CMS/messages/fi.json`, `CMS/messages/et.json`, `BACKLOG.md` (flipped
  "Admin UI" TODO to DONE), `JOURNAL.md`, `NEXT.md`.

## 2026-07-02 19:50 — E2E/HITL slice: real cross-instance export→import, found + fixed 2 bugs
- **Status:** DONE
- **What I did:** Stood up a genuinely SEPARATE second CMS instance and ran the
  full export→import→click-through against it (never touched the primary
  :3602 dev DB except one legitimate content write — see below).
  - **Second instance setup**: `next dev`'s Turbopack refuses ANY symlinked
    path outside its own project root (`node_modules`, `src` — tried both,
    both hard-error `"Symlink … points out of the filesystem root"` /
    `"app_dir must be a directory"`), so a symlink-based scratch dir doesn't
    work. Instead: a real sibling directory
    `~/git/dev/bizbeecms-scratch2/` (OUTSIDE the bizbeecms repo, never
    committed) with `node_modules`/`src`/`messages`/`migrations`/`scripts`/
    `public` **physically copied** (not symlinked) from `CMS/`, its own
    `wrangler.jsonc` (renamed `name` to `bizbeecms-cms-scratch2`, cosmetic
    only), its own `.dev.vars` (`SITE_ID=test-2-scratch`,
    `APP_ORIGIN=http://localhost:3603`), run via `npx next dev --port 3603`
    from that directory — `initOpenNextCloudflareForDev()` resolves its
    `.wrangler/state/v3` persist dir relative to CWD, so a different CWD =
    a fully independent local D1 + R2, zero shared state with :3602's.
    Applied all 27 migrations via `npx wrangler d1 migrations apply
    bizbeecms-cms --local` from the scratch dir (this is a DIFFERENT
    on-disk D1 than the primary's — the command's `--local` scope is CWD-
    relative, confirmed by the primary's dev server staying up/unaffected
    throughout). Scratch dir + process fully torn down at the end of this
    run (`pkill` the :3603 process, `rm -rf` the scratch dir) — nothing
    left running or on disk outside the repo.
  - **One legitimate primary-instance write**: the real tableonline site had
    NO `site_identity` row (brandName blank), which — correctly, by design —
    makes the artifact's `meta.siteName` blank and import unconfirmable
    (`checkConfirmation` hard-refuses a blank expected name). This is real
    operator-facing behavior, not a test artifact, so the right move is what
    a real operator would do: set a brand name. `PUT
    /api/settings/brand {"brandName":"Restovista", ...}` (there was already
    a brandName+tagline in fact — see the bug below, the EXPORT was reading
    the wrong JSON key) — this is legitimate content authoring on :3602, not
    a destructive/test action, and doesn't touch pages/components/collections/
    assets at all.
  - **Bug #1 FOUND + FIXED — `readSiteName` read the wrong JSON key.**
    `CMS/src/lib/site-export/site-export.ts`'s `readSiteName` parsed the
    `site_identity` settings row and read `parsed?.name`, but the actual
    stored shape (`SiteIdentity` in `lib/settings/site-settings.ts`) keys the
    field as `brandName`. Every real site with a brand name set (the
    tableonline site DOES have one — brandName "Restovista") was exporting
    `meta.siteName: ""` regardless, making the artifact PERMANENTLY
    unconfirmable for import (a blank expected name can never be typed to
    match) — this was a **hard blocker for the entire import flow on any
    real site**, invisible until this run because every prior task's
    verification checked "does exporting/validating/executing work" in
    isolation, never "does the export's siteName actually reflect the site's
    real brand name end-to-end". Fixed the field name; fixed the matching
    unit test's fixture (`site-export.test.ts` was asserting against `{name:
    "Tableonline"}`, i.e. the test itself encoded the same wrong key —
    confirmed it FAILS against the corrected source with the old fixture,
    proving the bug was real, then fixed the fixture to `{brandName:
    "Tableonline"}` and it passes).
  - **Bug #2 FOUND + FIXED — `planImport`'s `dropContentTables` used the
    SOURCE artifact's collection list instead of the TARGET's.** The
    destructive import route (`POST /api/site-import`) DROPs every
    `content_*` table in `plan.dropContentTables` before recreating them from
    the artifact. `planImport` (pure, `site-import-execute.ts`) built that
    list from `t.collection.map(c => c.tableName)` — i.e. the ARTIFACT's
    (source site's) own collections. On a real second instance with ZERO
    collections yet, this tries `DROP TABLE content_authors` (etc.) on a
    table that was never created on the target → `D1_ERROR: no such table:
    content_authors` → the whole import 500s immediately, before writing
    ANYTHING. 100% invisible on every prior same-instance round-trip test
    (source===target, so the source's collection list always happened to
    equal what already existed) — this is the textbook case the E2E task
    exists to catch. Fixed: `planImport` now takes a 3rd optional param
    `existingContentTableNames: string[]` (defaults to `[]`, i.e. "nothing to
    drop" — safe default, not "fall back to the old buggy behavior"); the
    route now queries the TARGET's live `collection` registry
    (`db.select().from(schema.collection)`) BEFORE calling `planImport` and
    passes those table names through. Added a regression test proving the
    default is `[]` (would have failed pre-fix, since the old code path had
    no 3rd param and used the artifact's list unconditionally) and updated
    the existing "dropContentTables" test to pass a target list explicitly
    and assert it — not the source's — table name comes back.
  - **Full E2E click-through, both bugs fixed, against the real second
    instance**: exported :3602 (`GET /api/site-export`, 13 pages / 136 page
    versions / 41 components / 7 collections / 73 collection rows / 61
    assets / 6 data sources / 12 data-source requests / 2 prompt versions —
    matches the task hint's expected counts exactly) → `POST
    /api/site-import/validate` on :3603 (empty target) → dry-run report
    `willCreate` matched the export counts exactly, `willDestroy` all
    zeroes, `collectionCapOk:true` → `POST /api/site-import` with
    `{artifact, confirm:"Restovista"}` → `200 {"ok":true,"restored":{...all
    9 counts match...},"assetKeysToUpload":[...61 keys...]}` → uploaded all
    61 assets via `POST /api/site-import/asset/<key>` (61/61 succeeded, 0
    failures) → `GET /` on :3603 → `200`, same `<title>`, same nav links,
    byte-identical Tailwind-utility-sheet diff aside (per-request compiled
    sheet, expected to vary slightly by cache warm state per CAVEATS, not a
    content bug) → `GET /helsinki` (a real city page) → `200` on both
    instances, identical `<title>Restaurants | Restovista</title>` → `GET
    /restaurants/kogu-resto` (a real restaurant detail page) → `200` on both,
    byte-identical page size (175243 bytes both) → fetched the `book` page,
    extracted the real Form-1 block's field set + `__bb_page`/`__bb_block`
    hidden identity (preserved identically across import, as expected — page
    IDs are artifact-preserved, not regenerated) → `POST
    /api/forms/submit` on :3603 with a real booking payload → `{"ok":true}`
    → verified via `wrangler d1 execute --local` that the row actually
    landed in `content_bookings` on the TARGET (4 rows total: 3 imported +
    1 new submission, the new one's `customer_name`/`email` match exactly
    what was posted) → spot-checked a gallery image referenced INLINE on
    the restaurant page (`/media/assets/…fcd337ae.png`) renders `200
    image/png` on :3603, and separately verified one asset is BYTE-IDENTICAL
    sha256 between source and target (`ea1f574f…28a2`).
  - Recorded 3 new lower-priority TODOs surfaced by this pass into
    `BACKLOG.md`'s "New TODOs found by the E2E slice" section (UI copy nit,
    wipe-loop atomicity gap, and a note on lack of a first-class way to spin
    up a second local instance if this becomes a recurring need).
- **Verified:** `npm test` in `CMS/` — 1501/1501 pass (1499 prior + 2 new:
  the corrected dropContentTables-default regression test and the corrected
  siteName-fixture test already existed and now assert the RIGHT thing).
  `npx tsc --noEmit -p CMS` clean. Full live HTTP click-through against a
  genuinely separate second instance as detailed above — this is the FIRST
  run in this goal that exercised source≠target, and it caught 2 real bugs
  same-instance testing structurally could not have caught. Primary :3602
  confirmed unaffected throughout (counts identical before/after: 13 pages /
  41 components / 7 collections / 61 assets), and the scratch instance +
  process were fully torn down at the end (nothing left running, nothing
  left on disk outside the repo).
- **Files:** `CMS/src/lib/site-export/site-export.ts` (readSiteName field-name
  fix), `CMS/src/lib/site-export/site-export.test.ts` (fixture fix),
  `CMS/src/lib/site-export/site-import-execute.ts` (dropContentTables now
  target-registry-sourced via new 3rd param), `CMS/src/lib/site-export/
  site-import-execute.test.ts` (updated + new regression test),
  `CMS/src/app/api/site-import/route.ts` (queries target's live collection
  registry before planning), `BACKLOG.md` (flipped E2E TODO to DONE, added 3
  new lower-priority TODOs), `JOURNAL.md`, `NEXT.md`.

## 2026-07-02 19:55 — Wipe-loop atomicity: batch the DROP TABLE loop
- **Status:** DONE
- **What I did:** Took the "wipe-loop atomicity" TODO from BACKLOG.md's
  E2E-slice list (manager hint named it as one of 3 candidates). `POST
  /api/site-import`'s WIPE step 1 looped `await contentDdl(\`DROP TABLE
  ${tableName}\`)` once per content_* table — a transient D1 error partway
  through left some tables dropped and some not, with no way to tell which
  from the outside, and RESTORE step 4 would then try to recreate a table
  that might still exist (or skip one it assumed was gone). Fixed by
  replacing the per-table loop with ONE call to `contentDdlBatch` (already
  existed in `content-db.ts`, built for the schema-rebuild path — D1's
  `batch()` wraps an ordered statement list in one implicit transaction, so
  the whole DROP set now lands atomically or not at all). No new primitive,
  no new trust surface — same fence (`assertStatement`), same statement
  shape, just batched instead of sequential. Also skip the call entirely
  when `dropContentTables` is empty (was already effectively a no-op loop,
  now an explicit early-out).
- **Verified:** `npm test` in `CMS/` — 1501/1501 pass (planner tests
  untouched, this was a route-level change with no route-level test infra
  per this repo's "test business logic only" — routes aren't unit-tested,
  they use real D1). `npx tsc --noEmit` clean. Live-verified against the
  REAL dev D1 (:3602, dev server already running): exported the current
  site (`GET /api/site-export` → 13 pages/136 versions/41 components/7
  collections/73 rows/61 assets/6 data sources/12 requests/2 prompt
  versions), then re-imported the SAME artifact back into the SAME instance
  (`POST /api/site-import` with `confirm:"Restovista"`) — 200 OK, `restored`
  counts matched exactly, `assetKeysToUpload` listed all 61 keys as
  expected (asset bytes untouched by this change, D1-only wipe/restore).
  Confirmed `/` and `/helsinki` both still render 200 after the round-trip.
  This exercises the NEW `contentDdlBatch` path end-to-end (7 real
  collections DROPped + recreated in one batch) — the pure-planner unit
  tests can't reach the route's actual D1 call, so this live check is the
  real coverage for this change.
- **Files:** `CMS/src/app/api/site-import/route.ts` (import `contentDdlBatch`,
  batch the DROP loop), `BACKLOG.md` (flipped the wipe-loop-atomicity TODO to
  DONE), `JOURNAL.md`, `NEXT.md`.

## 2026-07-02 20:05 — 2nd-instance tooling: `CMS/scripts/scratch-instance.sh`
- **Status:** DONE
- **What I did:** Took the manager-hinted "2nd-instance tooling" TODO (the
  other of the 2 remaining low-priority items in BACKLOG.md's E2E-slice
  section). First checked the "confirm-string UI copy nit" TODO (the manager's
  suggested small-first pick) — read the actual shipped copy
  (`messages/en.json`'s `exportImport.confirmLabel`/`blankSiteName`/
  `blankSiteNameError`) and the component (`export-import-manager.tsx` lines
  362-380): the expected site name is ALREADY shown in a `<strong>` right next
  to the label, the input is disabled with a named error when blank, and all
  3 locales have real (not placeholder) translated copy. There's nothing
  concrete to change without inventing busywork — NEXT.md itself flagged this
  as "probably already fine." So took the 2nd TODO instead, a genuine gap:
  `next dev`'s no-symlink constraint means every future cross-instance E2E
  pass on this goal (or any other goal that needs a 2nd local CMS) would
  otherwise repeat the SAME manual multi-step recipe from scratch (documented
  in CAVEATS but not automated). Wrote `CMS/scripts/scratch-instance.sh`
  (`up [port]` / `down [port]`) that automates EXACTLY the CAVEATS-documented
  manual recipe, nothing more: copies `node_modules/src/messages/migrations/
  scripts` (+ `public` if present — this repo has none, made the copy loop
  skip missing dirs) into a scratch dir, writes a cosmetically-renamed
  `wrangler.jsonc` + a fresh `.dev.vars` (`SITE_ID=test-2-scratch`,
  `APP_ORIGIN` matching the chosen port), applies all D1 migrations there via
  `wrangler d1 migrations apply --local` (CWD-scoped, confirmed isolated from
  the primary), then runs `next dev --port <port>` in the foreground; `down`
  kills the port and `rm -rf`s the scratch dir.
- **2 real bugs found + fixed while dry-running the script itself** (would
  have made it unusable as shipped): (1) the scratch dir path resolved to
  `$CMS_DIR/..` = the REPO ROOT, i.e. `bizbeecms/bizbeecms-scratch2` —
  INSIDE the repo, showing up as an untracked dir in `git status`, contrary
  to CAVEATS' explicit "OUTSIDE the bizbeecms repo, never committed"
  requirement from the E2E-slice run; fixed to resolve one level higher
  (`$REPO_ROOT/..`), a true sibling of `bizbeecms/` itself, matching the
  original manual recipe exactly. (2) forgot `.env.local`
  (`CMS_DEV_SUPERADMIN=1`) in the copy list — every admin-gated route
  (`/api/site-import/validate` etc.) 401'd with `{"error":"unauthorized",
  "reason":"noSession"}` on the scratch instance until added; CAVEATS'
  original E2E entry mentions `.dev.vars` but not `.env.local` explicitly,
  so this would have silently bitten the next person running the script too.
- **Verified LIVE, twice** (once pre-fix confirming the bugs, once post-fix
  confirming the real flow): ran `scripts/scratch-instance.sh up 3603` in the
  background — 27 migrations applied to a fresh isolated local D1, `next dev`
  came up on :3603 (`✓ Ready in 141ms`, `.env.local` listed under
  "Environments"). `GET /api/site-export` from the REAL primary :3602
  (13 pages/136 versions/41 components/7 collections/73 rows/61 assets/6 data
  sources/12 requests/2 prompt versions) piped into `POST
  /api/site-import/validate` on the fresh :3603 scratch instance →
  `{"ok":true, "willDestroy":{all zeros}, "willCreate":{matches export
  counts exactly}}` — proves the script produces a genuinely empty,
  independently-migrated, admin-reachable second instance, i.e. exactly what
  a future E2E cross-instance run needs, without any manual copy/rename/
  migrate steps. Confirmed primary :3602 unaffected throughout (same
  `/api/site-export` counts before and after). Ran `down 3603` — port freed,
  scratch dir fully removed, primary still 200. No unit test written (this
  is a bash dev-tooling script with no pure logic — no `.ts`/`.mjs` here,
  matches the "test business logic only" discipline; the live dry-run IS the
  verification, same as how routes with "no pure logic to extract" are
  verified elsewhere in this goal's JOURNAL).
- **Files:** `CMS/scripts/scratch-instance.sh` (new), `BACKLOG.md` (flipped
  the 2nd-instance-tooling TODO to DONE), `JOURNAL.md`, `NEXT.md`.
