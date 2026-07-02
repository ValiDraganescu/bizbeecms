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
