# Journal — external-data-sources
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-07-02 02:31 — Slice 1: data_source + data_source_request schema, write-only encrypted secret, Admin CRUD API
- **Status:** DONE
- **What I did:** Two new D1 tables in `CMS/src/db/schema.ts` — `data_source`
  (connection: name, baseUrl, authType header|query|basic|none, authParam,
  secretEnc) and `data_source_request` (saved request per the 2026-07-02
  revision: method GET|POST|PUT|DELETE, path, query JSON, bodyTemplate,
  cacheEnabled + cacheTtlSec default 60, retryable flag, FK cascade). Drizzle
  migration `migrations/0025_tiresome_freak.sql` generated via db:generate and
  applied locally. REUSED existing `lib/crypto/secret-box.ts` (AES-GCM, KEK =
  CMS_AUTH_SECRET — already node-tested via google-client.test.mjs) instead of
  writing new crypto. New pure module `lib/data-sources/validate.ts` (URL
  http(s)-absolute + SSRF blocklist incl. private IPv4 ranges, auth/method
  enums, relative-path enforcement, `{placeholder}` syntax check for path/query,
  TTL bounds). Store `db/data-source-store.ts` (safe DTOs expose `hasSecret`,
  never `secretEnc`; three-state write-only secret on update: absent=keep,
  ""=clear, string=replace; `decryptSourceSecret` reserved for the Slice-2
  engine). Admin-gated REST: `/api/data-sources`, `/api/data-sources/[id]`,
  `/api/data-sources/[id]/requests`, `/api/data-sources/[id]/requests/[requestId]`.
- **Verified:** 14 new node tests in `scripts/data-source-validate.test.mjs`;
  full suite 1251/1251 green; `npx tsc --noEmit` green; migration applied to
  local D1. COULD NOT run `npx opennextjs-cloudflare build` — a dev server
  (next-server pid 79854) was live on :3602 and the build corrupts `.next`
  while dev runs; not mine to kill. Next Meeseeks: run the build gate first.
- **Files:** CMS/src/db/schema.ts, CMS/migrations/0025_tiresome_freak.sql (+meta),
  CMS/src/lib/data-sources/validate.ts, CMS/src/db/data-source-store.ts,
  CMS/src/app/api/data-sources/** (4 routes),
  CMS/scripts/data-source-validate.test.mjs

## 2026-07-02 02:37 — Slice 2: central fetch + map engine (retries, cache, placeholders)
- **Status:** DONE
- **What I did:** `CMS/src/lib/data-sources/fetch.ts` — THE centralized request
  layer (pure module, all effects injected: fetch/sleep/cache). `buildRequest`
  resolves source+request+params → concrete HTTP request: baseUrl+path join,
  path placeholders URL-encoded, query placeholders raw→URLSearchParams-encoded,
  body placeholders JSON-escaped (breakout-proof), auth injection
  (header/query/basic/none — the ONLY place a secret touches a request).
  `fetchSource`: cache-check → fetch with AbortSignal.timeout (10s default) →
  ≤2 retries (3 attempts) on network error/5xx/429 with linear backoff, never
  other 4xx, only GET or `retryable===true` (mutations never double-fire) →
  JSON parse → cache-put. GRACEFUL: never throws, failures = `{ok:false}`.
  Cacheability = cacheEnabled && (GET || retryable); key =
  `ds:<version>:<sourceId>:<method>:<fnv(url)>-<fnv(body)>` — per-source prefix
  + injectable `cacheVersion` stage Slice-7 purge. `createMemoryCache` (TTL,
  injectable clock). `getPath` dot-paths (incl. array indices) + `mapResponse`
  (array→List stamping, object→one, else null).
- **Verified:** 23 new node tests in `scripts/data-source-fetch.test.mjs`
  (URL/auth building per authType, JSON-body breakout attempt, missing-param,
  cache-key stability, retry counts per status, no-retry-on-POST,
  retryable-POST cacheable, TTL expiry via fake clock, param-varying cache
  entries, mapping). Full suite 1274/1274 green; `npx tsc --noEmit` green.
  COULD NOT run `npx opennextjs-cloudflare build` — dev server pid 79854 STILL
  live on :3602 with an active browser (2nd deferral); tsc+tests gate.
- **Files:** CMS/src/lib/data-sources/fetch.ts,
  CMS/scripts/data-source-fetch.test.mjs

## 2026-07-02 02:46 — Slice 3: source-agnostic binding (api kind hydrates in buildPlanFromPage)
- **Status:** DONE
- **What I did:** `BindingRef.source` + `ListSource` gained `kind:
  "collection"|"api"` (absent = collection, so legacy bindings are untouched;
  `collection` is now optional) plus api fields `sourceId`, `requestId`,
  `params` (`{placeholder}` → literal | `{prop}`), and List-only `itemsPath`
  (dig to a nested rows array, e.g. OpenWeather `{list:[…]}`). KEY TRICK: api
  `map` values are dot-paths, but `hydrateProps`/`stampRow` do flat
  `row[field]` lookups — so api items are FLATTENED into rows keyed by exactly
  those dot-paths (`flattenByPaths`), and the existing pure hydrate/stamp
  machinery consumes api rows verbatim (planList, combobox, empty-slot all
  unchanged). New pure `lib/data-sources/bind.ts` (resolveBindingParams w/
  localized-prop resolution, flattenByPaths, apiListElements, listPaths). New
  thin effectful `lib/data-sources/hydrate.ts`: store reads +
  decryptSourceSecret (KEK from Worker env) + central `fetchSource` with an
  ApiCache = `caches.default` (synthetic internal URL per key, TTL via
  Cache-Control) or module-level memory cache in `next dev`. Wired both into
  `hydrateBlockBindings` (now takes locale) for single-item + List api
  bindings; `validateBinding`/`validateListBinding` got api branches (ids
  present + mapped props declared; dot-paths unverifiable without a sample).
- **Verified:** 22 new node tests in `scripts/data-source-bind.test.mjs`
  (params incl. localization + omission, flatten, itemsPath normalization,
  listPaths, api validator branches, collection path regression, flatten→
  hydrateProps end-to-end, failure keeps static props). Full suite 1296/1296;
  `npx tsc --noEmit` green. COULD NOT run `npx opennextjs-cloudflare build` —
  dev server pid 79854 STILL live on :3602 (3rd deferral; re-checked at
  commit time).
- **Files:** CMS/src/lib/render/plan-types.ts, CMS/src/lib/render/tree.ts,
  CMS/src/lib/content/binding.ts, CMS/src/lib/data-sources/bind.ts,
  CMS/src/lib/data-sources/hydrate.ts, CMS/src/lib/render/render-page.tsx,
  CMS/scripts/data-source-bind.test.mjs
