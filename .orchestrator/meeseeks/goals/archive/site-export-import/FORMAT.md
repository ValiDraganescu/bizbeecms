# FORMAT.md — site-export-import artifact contract

This is the contract every later task (export core, export assets, import
validate, import execute, admin UI) builds against. Change it here first if a
later slice needs a different shape — don't quietly drift the wire format.

## 1. Table/store inventory (verified against `CMS/src/db/schema.ts`, 17 named tables + dynamic `content_*`)

### EXPORT — content/design/data (source of truth for what "everything" means)

| Table | Export? | Notes |
|---|---|---|
| `page` | yes | full row incl. `blocks` (legacy tree, still the public fallback), `parentPageId`, `publishStatus`, `metaTitle/Description/Image` (per-locale JSON), `draftVersionId`/`publishedVersionId` pointers |
| `page_version` | yes | ALL versions for exported pages (not just current draft+live) — cheap (JSON blobs), and history has real value on the target. Decision: **export full history**, see §2. |
| `component` | yes | full row incl. live (`html`/`script`/`css`/`label`/`propsSchema`) AND draft_* columns + `hasDraft`, `sourceKit`, `tags` |
| `collection` | yes | registry rows: `name`, `tableName`, `schema` (JSON field list), `publicSubmissions` |
| `content_*` (dynamic, one table per collection) | yes | every row, every column, via `SELECT *` — schema is data-driven so encode row values as a generic JSON object per row (see §3) |
| `site_settings` | yes | ALL keys as one JSON object (see §1a for the exact key list — this is the theme/brand/locales/AI-config store) |
| `prompt_version` | yes | full rows (label, prompt, createdAt) — saved system-prompt versions |
| `data_source` | yes, **minus secret** | `id,name,baseUrl,authType,authParam` — NEVER `secretEnc`. Emit a `hasSecret: boolean` (`authType !== "none"`) per row instead. |
| `data_source_request` | yes | full rows (method/path/query/bodyTemplate/cache/retry config) — no secrets live here |
| `asset` | yes (metadata) | full row (`key,filename,contentType,size,description,tags,createdAt`) — the R2 BYTES travel separately, see §4 |
| `chat_agent` (added 2026-07-23) | yes | full config row (`id,name,systemPrompt,model,enabled,welcomeMessage,limits,dataSources,collections`) — the JSON-string columns travel verbatim; the allowlists' `sourceId`/`requestId` refs stay valid because data-source ids import verbatim. `tables.chatAgent` is OPTIONAL on import (pre-chat-agent artifacts stay valid at version 1; missing → `[]`, present-but-not-array → hard-fail). |
| R2 bytes (`MEDIA` bucket, keyed by `asset.key`) | yes | not a D1 table; fetched via the `Storage` port per asset key |

**1a. `site_settings` keys** (from `CMS/src/db/settings-store.ts`, the complete `_KEY` constant list — export the whole table as `{key: value}`, no allowlist needed since it's a generic store):
`content_locales`, `theme_overrides`, `theme_overrides_dark`, `site_identity` (brand), `model_catalog`, `image_model`, `translate_model`, `image_gen_model`, `icon_set`, `api_cache_versions`.
Export ALL rows found (don't hardcode the key list into the export code — new keys get added over time; the table is genuinely generic key→JSON).

### DO NOT export (instance identity / transients — default decision per GOAL.md)

`user`, `session`, `invite`, `password_reset`, `login_attempt`, `api_key`, `icon_cache`, `chat_thread`, `chat_conversation`, `usage_counter` (the last two added 2026-07-23: guest-chat conversation history + usage/cost counters are analytics, never exported and never wiped by import — a same-site re-import keeps agent ids so existing history stays linked). Flag this list in the import report so an operator isn't surprised auth/history didn't move.

### Data-source secrets — hard constraint (not a choice)

`data_source.secretEnc` is AES-GCM ciphertext under the SOURCE instance's `CMS_AUTH_SECRET` KEK (`lib/crypto/secret-box.ts`) — undecryptable on a target instance with a different KEK. Export the source row with `secretEnc` OMITTED and `hasSecret` computed. The import report lists every `data_source` needing its secret re-entered post-import; the imported row's `secretEnc` is `null` (source is "broken" until an operator re-saves the secret via the existing data-source edit UI/route — no new UI needed here, just the report entry pointing at it).

## 2. Page versions — export full history

`page_version` rows are small JSON blobs (same shape as `page.blocks`+meta), no binary weight, and a site's whole edit history has real value when moving instances (rollback capability shouldn't be lost). Export **every** `page_version` row whose `pageId` is an exported page's id, not just the current draft/live snapshot. Import inserts them all and repoints `page.draftVersionId`/`publishedVersionId` (see §6) — cheap correctness beats a narrower export for a cost that's effectively free.

## 3. Envelope + collection-row encoding

Mirrors the **existing** `bizbeecms.component` / `bizbeecms.kit` envelope discipline in `CMS/src/lib/components/portable.ts` — same shape family, one more tier up. New format id: **`bizbeecms.site`**.

```jsonc
{
  "format": "bizbeecms.site",
  "version": 1,
  "meta": {
    "exportedAt": "2026-07-02T19:00:00.000Z",
    "cmsVersion": "<package.json version of the exporting CMS build>",
    "siteName": "<site_settings.site_identity.name, best-effort label only>"
  },
  "counts": {
    "pages": 12, "pageVersions": 34, "components": 20, "collections": 3,
    "collectionRows": 218, "assets": 47, "dataSources": 2, "dataSourceRequests": 5,
    "promptVersions": 1
  },
  "tables": {
    "page": [ /* full page rows, dates as epoch-ms numbers */ ],
    "pageVersion": [ /* full page_version rows */ ],
    "component": [ /* full component rows */ ],
    "collection": [ /* registry rows: {id,name,tableName,schema,publicSubmissions,createdAt,updatedAt} */ ],
    "siteSettings": [ /* {key,value,updatedAt} rows, value already a JSON STRING as stored */ ],
    "promptVersion": [ /* full rows */ ],
    "dataSource": [ /* rows minus secretEnc, plus hasSecret:boolean */ ],
    "dataSourceRequest": [ /* full rows */ ],
    "asset": [ /* full rows (metadata only; bytes are separate, see §4) */ ],
    "chatAgent": [ /* full config rows (added 2026-07-23; OPTIONAL on import — see §1). counts.chatAgents mirrors it. */ ]
  },
  "collectionData": {
    "content_offers": {
      "schema": [ /* CollectionField[], same as collection.schema parsed — redundant with tables.collection but keeps this block self-contained for the DDL-recreate step */ ],
      "rows": [ { "id": "...", "slug": "...", "status": "published", "...userField": "..." } ]
    }
  }
}
```

Rules:
- **Dates**: every `timestamp_ms` Drizzle column serializes as a plain epoch-ms **number** (not an ISO string, not a `Date`) — `row.createdAt instanceof Date ? row.createdAt.getTime() : Number(row.createdAt)`, the exact pattern `collection-store.ts`'s `toView` already uses. Import re-wraps as needed per the Drizzle column mode.
- **`collectionData` rows are generic objects** — one row = `SELECT * FROM content_<slug>` as-is (via `contentSelectAll`, already parameterization-safe and read-fenced). No per-type encoding needed; SQLite/D1 already hands back JS-native `string | number | null` per column, which round-trips through `JSON.stringify`/`parse` losslessly (D1 has no native boolean/date type — those are already encoded as 0/1 / epoch-ms integers at the column level, so nothing extra to do here).
- **Full fidelity beyond 1000 rows/collection (fixed 2026-07-02)**: the fenced read path's `contentSelect` caps any SINGLE call at `MAX_READ_ROWS` (1000, `content-db.ts`) — correct for ordinary app reads, but a plain `SELECT * FROM content_x` on a >1000-row collection would silently export only the first 1000 with no error. The export route (and the import dry-run's target-row counter) now call `contentSelectAll`, a thin `LIMIT`/`OFFSET` pager over `contentSelect` that keeps requesting pages until one comes back short — so `collectionData.<table>.rows` is always the FULL table regardless of size. Regression test: `content-db.test.ts`.
- **No checksums in v1.** ponytail: the artifact travels as one authenticated (operator-only, same-origin) HTTP request/response pair, not over an untrusted channel — a checksum guards against transport corruption we have no other evidence of yet. Add a `sha256` counts field later only if a real corruption incident shows up.
- **`format`/`version` are the trust-boundary gate on import**, exactly like `PORTABLE_FORMAT`/`PORTABLE_VERSION` in `portable.ts` — reject anything else outright, no partial-tolerant parsing at the envelope level (unlike the kit bundle's per-component partial tolerance, a site import is all-or-nothing per GOAL.md's "de-facto resetting" framing).

## 4. Asset bytes — size strategy: manifest + per-asset fetch/upload protocol, **zipped client-side into one file (§4a)**

**Decision: keep the manifest + per-asset HTTP protocol below (server side, unchanged) — `site.json` (the envelope, WITHOUT bytes inline) + a separate per-asset download/upload leg. The ONE-FILE requirement (USER REQUEST 2026-07-03) is satisfied entirely in the browser: the export UI fetches the same envelope + per-asset bytes it always did, then zips them CLIENT-SIDE with `fflate` before triggering the download. Zero server changes.**

Justification (why client-side zip, not a server-built zip):
- `fflate` was previously rejected as "not installed" — now added as a direct dependency (`CMS/package.json`) specifically for this client-only use. It never runs in the Worker; `zipSync` executes in the browser tab, so the Workers ~100MB request/response ceiling (the reason a *server-built* zip was rejected) never applies — the browser already downloaded every asset individually over N small responses exactly as before, `fflate` just archives bytes already sitting in the tab's memory.
- The `Storage`/export/import REST surface (§4's protocol, unchanged) still moves one small JSON blob + N independent asset blobs — no new server-side trust boundary, no new route, no per-request size cap increase. The zip step is purely a client packaging convenience layered on top.
- Satisfies the user's literal ask ("download all in one go, maybe zip it") without reopening the streamable/chunkable constraint GOAL.md calls out for the SERVER side — that constraint is about what the Worker buffers in one request/response, not what the browser assembles client-side after the fact.

**Protocol (§4, unchanged) + §4a client zip on top:**
- Export: `GET /api/site-export` returns the envelope (`tables.asset` lists every asset's metadata + key, no bytes inline); `GET /api/site-export/asset/<key>` streams one asset's raw bytes — both exactly as before.
- **§4a — one-file export (2026-07-03):** `ExportImportManager`'s `runExport()` now fetches the envelope, then loops every `tables.asset` entry fetching its bytes via the existing per-asset route, and zips the whole set with `fflate`'s `zipSync` into ONE archive:
  ```
  site.zip
  ├── site.json          ← the envelope (§3), verbatim, UTF-8 JSON text
  └── assets/<file>       ← one entry per asset row, raw bytes; entry path = asset.key VERBATIM
                             (asset.key is already namespaced "assets/<file>" in the DB/R2 —
                              don't re-prefix it, or you'd get assets/assets/<file>)
  ```
  `zipSync(files, { level: 0 })` — level 0 (store, no compression) since most gallery assets are already-compressed images/video; skips wasted CPU compressing incompressible bytes. Downloaded as `site-<siteName>-<timestamp>.zip`. The per-asset download button/list from the original Admin UI slice is retired (superseded by the zip); the dry-run/import flow is untouched this run — it still accepts a bare `site.json` (import-side zip support is the NEXT task, see BACKLOG).
- Import: unchanged this run — `POST /api/site-import/validate` / `POST /api/site-import` / `POST /api/site-import/asset/<key>` still expect the envelope JSON + per-asset multipart uploads exactly as before. A future task teaches the Import picker to accept `site.zip` too (unzip client-side, extract `site.json`, drive the same validate→execute→per-asset-upload flow from the zip's `assets/*` entries) — tracked as its own BACKLOG item, deliberately NOT done in this run per the manager's hint to keep this slice small.
- This keeps every individual HTTP payload small (one D1-rows JSON blob + N independent asset blobs) regardless of total site size — no artificial ceiling on gallery size, and it reuses `Storage.put/get` untouched.

## 5. Collection schema recreation on import — reuse the fenced DDL path, don't hand-author SQL

Per `goals/archive/content-collections`: nobody authors raw DDL, ever. Import must NOT synthesize `CREATE TABLE` strings itself — it calls the SAME generator:

1. For each `tables.collection` entry, feed its `schema` (parsed `CollectionField[]`) through `collection-schema.ts`'s `buildCreateTableSql(tableName, fields)` — the exact function `collection-store.ts`'s `createCollection` already uses. This guarantees the recreated table is fence-safe by construction (same `content_*` charset validation, same column-cap check) with zero new trust surface.
2. Run it via `contentDdl` (the Slice-0 fence), exactly like today's create path.
3. Insert the registry row (`collection` table) via the normal Drizzle `Db` port — NOT through the fence (the fence is `content_*`-only by design; `collection` is on its `BUILTIN_DENYLIST` on purpose).
4. Insert `collectionData[tableName].rows` via **parameterized** `contentWrite` (`INSERT INTO content_x (col1,col2,...) VALUES (?,?,...)`, one statement per row or batched) — never string-interpolate row values; column names come from the JUST-recreated schema (trusted, ours), values are always bound params.
5. **100-table cap**: re-check `MAX_COLLECTIONS` (100, from `collection-plan.ts`) against the incoming artifact's `tables.collection.length` in the dry-run step (§6) BEFORE any writes — reject the whole import up front if it would blow the cap on a NON-empty target, or note that content_* wipe (§6) empties the registry first so the check is really "does the source's collection count alone exceed 100."

## 6. Import — validation, dry-run report, and the exact reset plan

**Step A — validate (no writes):**
- `format === "bizbeecms.site"` and `version === 1` (hard-fail otherwise, whole-artifact, no partial tolerance — see §3).
- Every `tables.*` key present and an array (missing/wrong-typed → hard-fail with the exact key named, per the repo's error philosophy: name the exact bad token + the fix).
- `tables.collection.length <= 100` (the cap, checked here so the dry-run can show it before commit).
- Cross-check `counts` against actual array lengths — mismatch is a WARNING in the report (not a hard-fail; `counts` is informational/HITL-sanity, not itself validated data).

**Step B — dry-run report (no writes), returned to the operator UI:**
```jsonc
{
  "ok": true,
  "willDestroy": { "pages": 9, "components": 15, "collections": 2, "collectionRows": 140, "assets": 30, "dataSources": 1, "promptVersions": 0 },
  "willCreate": { "pages": 12, "pageVersions": 34, "components": 20, "collections": 3, "collectionRows": 218, "assets": 47, "dataSources": 2, "dataSourceRequests": 5, "promptVersions": 1 },
  "secretsToReenter": [ { "name": "OpenWeather", "authType": "query" } ],
  "collectionCapOk": true,
  "warnings": []
}
```
`willDestroy` is computed by counting CURRENT target rows in the tables listed under "wipe" below (read-only counts, zero writes). `willCreate` is just the artifact's own `counts`.

**Step C — execute (destructive, only on typed confirmation from the UI):**

WIPE (target's current content, in FK-safe order — children before parents where a real FK exists, i.e. `password_reset`→`user` stays untouched since that whole subtree is preserved):
1. `DROP TABLE content_*` for every row currently in the `collection` registry (fenced `contentDdl`, one DROP per row — reuses `deleteCollection`'s exact DROP statement shape).
2. Delete all rows: `collection`, `page_version`, `page`, `component`, `data_source_request`, `data_source`, `prompt_version`, `asset` (D1 rows only — **do not** touch R2 objects here; overwritten/new keys get `Storage.put`'d in step E, and stray orphaned R2 objects from the old site are a known, accepted leftover — ponytail: no R2 GC in v1, revisit if dangling-blob storage cost ever matters).
3. Delete all `site_settings` rows (full wipe — target's theme/brand/locales are fully replaced, matching "de-facto resetting the target's content database" from GOAL.md).

PRESERVE (never touched by import, per GOAL.md's explicit DO-NOT-export list, symmetric on the import side): `user`, `session`, `invite`, `password_reset`, `login_attempt`, `api_key`, `icon_cache`, `chat_thread`.

RESTORE (insert artifact data, in dependency order):
4. `collection` registry rows + recreate each `content_*` table via `buildCreateTableSql`/`contentDdl` (§5), then insert that collection's rows via parameterized `contentWrite`.
5. `component` rows (parents of nothing further down, but pages reference component NAMES inside `blocks` JSON, not FKs — order doesn't matter for correctness, but do components before pages for a cleaner mid-import UI narrative).
6. `page` rows, then `page_version` rows (page rows first since `page_version.pageId` — no real FK, app-owned — but insert order still page-before-version for readability/debuggability).
7. `site_settings` rows (verbatim key/value re-insert).
8. `prompt_version`, `data_source` (secretEnc always `null` regardless of source artifact — never trust an artifact-supplied ciphertext, it's undecryptable anyway per §1), `data_source_request`.
9. `asset` metadata rows (bytes arrive separately per §4's upload leg — insert the metadata row first so the gallery UI can show a "pending upload" placeholder state if a later slice wants one; out of scope to build that UI now).

**Idempotency note for the execute-import task**: steps 1–3 make a second run of the SAME import safe to retry after a mid-way failure (the wipe is unconditional, not "wipe only what's about to be replaced"), so "a failed import must be re-runnable" (per BACKLOG.md's Import-execute task) is satisfied by construction — just re-POST the same artifact.

**Live check after** (per GOAL.md's "what good looks like"): re-render the target's home page and confirm a 200 with the source's content — a manual/E2E-slice concern, not something this format doc needs to encode.

## 7. What later tasks build against this doc

- **Export core**: emit exactly the `tables.*` + `collectionData` shape in §3, using `contentSelect`/Drizzle reads; NO asset bytes yet (stub `tables.asset` metadata only, per BACKLOG's own scoping).
- **Export assets**: add the `/api/site-export/asset/<key>` streaming route per §4.
- **Import validate**: implement Step A + B verbatim (pure functions, unit-testable with a fixture artifact — no D1 needed for the dry-run logic itself, only for computing `willDestroy` counts, which the validator function should accept as an injected count-provider so the PURE report-builder stays unit-testable per the repo's "test business logic only" discipline).
- **Import execute**: implement Step C verbatim, reusing `buildCreateTableSql`/`contentDdl`/`contentWrite`/the `Db`/`Storage` ports — no new SQL-generation code, no new trust boundary beyond what §5 already reuses.
- **Admin UI**: drives the two-leg asset protocol (§4) and renders the dry-run report (§6 Step B) with the typed-confirmation gate GOAL.md requires.
