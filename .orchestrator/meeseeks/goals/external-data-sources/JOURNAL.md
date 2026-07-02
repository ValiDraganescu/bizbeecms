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

## 2026-07-02 02:57 — Slice 4: Data Sources admin UI + test-call endpoint
- **Status:** DONE
- **What I did:** New admin section CMS → Data Sources (`/admin/data-sources`,
  nav entry in admin-sections.ts + adminNav strings). `DataSourcesManager`
  (components/content/data-sources-manager.tsx): sources list/add/edit/delete
  (in-app ConfirmModal), authType select w/ conditional authParam, WRITE-ONLY
  secret (password field; blank-on-edit = keep, switching to authType none
  clears via `secret:""`); per-source expandable SAVED REQUESTS panel
  (method/path/query-as-key=value-lines/body template for non-GET, cacheEnabled
  + TTL, retryable labeled "safe to retry/cache (idempotent)" per caveat), and
  an inline TEST panel: one input per `{placeholder}` (new pure
  `requestPlaceholders()` in validate.ts) → POST
  `/api/data-sources/:id/requests/:requestId/test` (new route: admin-gated,
  decrypts secret server-side, runs central `fetchSource` with cache BYPASSED,
  returns FetchSourceResult only — secret never in response). EN/FI/ET (48-key
  `dataSources` namespace ×3, brace-free help copy — ICU braces).
- **Verified:** tsc green; npm test 1298/1298 (2 new requestPlaceholders
  tests); LIVE end-to-end via dev server (:3602, dev-superadmin backdoor):
  created an Open-Meteo source + `{lat}/{lon}` request via the REST API, test
  endpoint returned real 200 JSON, missing param → graceful
  `{ok:false,"missing param"}`, deleted after. Page renders 200. Opennext
  build gate deferred a 4TH time (dev pid 79854 still on :3602 at 02:57).
  Could not run `npx eslint` directly (flat-config migration — next lint owns it).
- **Files:** CMS/src/app/admin/data-sources/page.tsx,
  CMS/src/components/content/data-sources-manager.tsx,
  CMS/src/app/api/data-sources/[id]/requests/[requestId]/test/route.ts,
  CMS/src/lib/data-sources/validate.ts, CMS/src/components/admin-sections.ts,
  CMS/messages/{en,fi,et}.json, CMS/scripts/data-source-validate.test.mjs

## 2026-07-02 03:09 — Slice 5: bind UI picks Collection OR API source (params, dot-path maps, sample-driven suggestions)
- **Status:** DONE
- **What I did:** The page-builder bind panels now offer a COMBINED source
  picker (one select, two optgroups: Collections / API sources; option values
  `c:<table>` / `a:<sourceId>`). BOTH panels: picking an API source → saved-
  request select → `{placeholder}` PARAM editor (single-item bindings: literal
  OR `{prop}` from the block's declared props — Slice-3 hydration resolves;
  List: literal-only, the built-in List declares no props) → "Load sample
  response" button (Slice-4 test endpoint, `{prop}` params resolved best-effort
  from current block props) → dot-path FIELD MAP as free-text inputs backed by
  a `<datalist>` of the sample's leaf paths (new pure `samplePaths()` in
  bind.ts, depth/size-capped). ListSettings extras: `itemsPath` input;
  QueryBuilder/limit stay collection-only; api combobox valueField/labelField
  become dot-path text inputs with the same datalist; emitSource is kind-aware
  and collection lists stay byte-identical (no `kind` persisted). Shell fetches
  `/api/data-sources` + per-source requests (graceful [] on 403/offline) and
  passes `apiSources` down. New `ApiSourceMeta`/`ApiRequestMeta` in
  page-builder/types.ts. 21 new `bind.*` strings EN/FI/ET (ICU-safe:
  `{count}` filled, help copy brace-free).
- **Verified:** tsc green; npm test 1303/1303 (5 new samplePaths tests incl.
  flattenByPaths round-trip); LIVE via dev :3602 — builder page 200 with the
  new panels; created an Open-Meteo source + `{lat}/{lon}` request via REST,
  test endpoint returned real 200 JSON, `samplePaths()` on the live response
  yielded correct suggestions ("current_weather_units.temperature", …);
  deleted after. Opennext build gate deferred a 5TH time (dev pid 79854 still
  on :3602 with an active browser at 03:09 — not mine to kill).
- **Files:** CMS/src/components/page-builder/binding-panels.tsx,
  CMS/src/components/page-builder/page-builder-shell.tsx,
  CMS/src/lib/data-sources/bind.ts, CMS/src/lib/page-builder/types.ts,
  CMS/messages/{en,fi,et}.json, CMS/scripts/data-source-bind.test.mjs

## 2026-07-02 03:17 — Slice 7: cache purging (version-counter eviction, endpoints + UI)
- **Status:** DONE
- **What I did:** Per-request + per-source + GLOBAL API-cache purge via VERSION
  COUNTERS (the Cache-API impl can't enumerate keys). New pure
  `lib/data-sources/purge.ts`: `{global, sources{}, requests{}}` counters,
  `cacheVersionFor()` composes `g.s.r` into the fetch engine's existing
  `deps.cacheVersion` (already embedded in `buildCacheKey`), immutable
  `bumpGlobal/bumpSource/bumpRequest`, defensive `normalizeCacheVersions`.
  Persisted as ONE settings row `api_cache_versions`
  (settings-store `get/setApiCacheVersions`). hydrate.ts `fetchApiData` now
  reads the counters and passes `cacheVersion` per fetch. Endpoints
  (admin-gated): `POST /api/data-sources/purge` (global) and
  `POST /api/data-sources/:id/purge` (body `{requestId?}` → request-scoped,
  else whole source; 404 on unknown source/foreign requestId). UI
  (data-sources-manager): "Purge cache" ghost button per cache-enabled saved
  request (inline "Cache purged" feedback) + danger "Purge all API cache"
  button with in-app ConfirmModal (never native confirm). 5 new strings
  EN/FI/ET (`dataSources.purge*`, ICU-safe).
- **Verified:** tsc green; npm test 1309/1309 (6 new purge tests incl.
  integration: bump r1 → r1 refetches while r2 stays cached; global bump →
  all refetch). LIVE on dev :3602: global purge → `{ok:true}`, counter row in
  local D1 incremented (`{"global":2,...}`), bogus source id → 404. Opennext
  build gate deferred a 6TH time (dev pid 79854 still on :3602 with an active
  browser — not mine to kill).
- **Files:** CMS/src/lib/data-sources/purge.ts (new),
  CMS/src/db/settings-store.ts, CMS/src/lib/data-sources/hydrate.ts,
  CMS/src/app/api/data-sources/purge/route.ts (new),
  CMS/src/app/api/data-sources/[id]/purge/route.ts (new),
  CMS/src/components/content/data-sources-manager.tsx,
  CMS/messages/{en,fi,et}.json, CMS/scripts/data-source-purge.test.mjs (new)

## 2026-07-02 03:31 — Slice 6: AI tools for data sources
- **Status:** DONE
- **What I did:** Registered three new tools in the shared dispatch —
  `list_data_sources` (sources + saved requests w/ ids, methods, placeholders;
  never the secret), `create_data_source` (source config + WRITE-ONLY secret +
  optional inline saved requests; header/query/basic auth requires a secret),
  `test_data_source` (live fetch mirroring the Slice-4 test endpoint: cache
  bypassed, secret injected server-side; result carries `paths` =
  `samplePaths(data)` over the FULL response + a size-capped `data` sample so
  the model can propose `prop ← json.path` maps). GENERALIZED (not forked) the
  existing binding tools per the caveat: `bind_component` / `create_list` /
  `bind_list` now accept `source`+`request` (id OR name, resolved with
  self-correcting errors listing what exists) + `params` (literal or `{prop}`)
  + `itemsPath`, building api-kind BindingRef/ListSource validated via the
  SHARED `validateBinding`/`validateListBinding` api paths (declared-prop
  allowlist). bind_list kind-switching drops the other kind's query fields,
  keeps presentation/combobox config, and collection lists still persist NO
  `kind` (legacy byte-identical). Scoped the three new tools into page-builder
  + pages contexts + their context prompts. Pure module
  `lib/chat/data-source-tools.ts` (schemas/validators/formatSource/
  sampleForModel) per convention; CF-coupled handlers in tool-dispatch.ts
  (kekFromEnv + resolveSourceAndRequest helpers).
- **Verified:** tsc green; full suite 1328/1328 (was 1309; +19 new tests in
  scripts/data-source-tools.test.mjs + api cases appended to
  scripts/binding-tools.test.mjs); live on :3602 — `/api/chat/debug?context=
  page-builder` lists all three tools and the prompt carries the api-source
  guidance. Opennext build gate DEFERRED again (7th) — dev server pid 79854
  still holds :3602. No UI strings added → no EN/FI/ET needed.
- **Files:** CMS/src/lib/chat/data-source-tools.ts (new),
  CMS/src/lib/chat/binding-tools.ts, CMS/src/lib/chat/tool-scopes.ts,
  CMS/src/lib/chat/tool-dispatch.ts, CMS/scripts/data-source-tools.test.mjs
  (new), CMS/scripts/binding-tools.test.mjs

## 2026-07-02 03:48 — Slice 8: OAuth2 client-credentials auth
- **Status:** DONE
- **What I did:** Added `oauth2` to AUTH_TYPES. NO migration: `authParam` carries
  the TOKEN URL (validated via validateBaseUrl — same SSRF boundary as baseUrl);
  secret = write-only `client_id:client_secret` (mirrors basic). Central fetch
  engine (fetch.ts): `fetchOauth2Token` POSTs `grant_type=client_credentials`
  with Basic client creds + timeout, caches the token via the injected ApiCache
  (key `ds-oauth2-token:<sourceId>`, UNVERSIONED by design; TTL = expires_in−60,
  clamped ≥30), injects `Bearer` into the built request's headers in fetchSource
  (buildRequest stays sync/pure; cache key unaffected — token rides in a header).
  ONE forced refresh + re-fire on 401 (`attempt -= 1`, doesn't eat the retry
  budget; safe for non-idempotent too since 401 rejects before work). UI: oauth2
  select option (generic over AUTH_TYPES), token-URL label/placeholder,
  maxLength 2000 for the URL, secret placeholders for oauth2/basic. AI
  create_data_source: description + authParam/secret docs cover oauth2;
  needs-secret check simplified to `authType !== "none"`. EN/FI/ET:
  `authTypes.oauth2`, `authParamTokenUrl`.
- **Verified:** 5 new fetch tests (Basic+form token call, Bearer on request,
  token cached across calls, 401→one refresh+re-fire incl. POST, graceful
  token-endpoint failures) + 1 validate test; suite 1334/1334; tsc green; LIVE
  smoke on :3602 — bad token URL → 400, good → 201 w/ hasSecret (secret never
  returned), cleaned up. Opennext build gate deferred an 8TH time (dev server
  pid 79854 on :3602, active browser connections — user is using it).
- **Files:** CMS/src/lib/data-sources/{validate,fetch}.ts,
  CMS/src/lib/chat/data-source-tools.ts,
  CMS/src/components/content/data-sources-manager.tsx,
  CMS/messages/{en,fi,et}.json,
  CMS/scripts/data-source-{validate,fetch}.test.mjs

## 2026-07-02 04:00 — Localize combobox config section in binding-panels.tsx
- **Status:** DONE
- **What I did:** Replaced all hardcoded English strings in the ListSettings
  combobox/presentation section (Presentation select + hints, Selection mode,
  Min/Max, Searchable, Value/Label field labels + defaults, Label expression +
  help, Form field name, Placeholder) with `t("list.*")` keys — 27 new keys
  (`presentation*`, `cb*`) added to en/fi/et.json under `pageBuilder.list`.
  Template-name and `${…}` snippets interpolated as ICU VALUES (brace caveat);
  the `${name} · ★ ${rating}` syntax example stays as an untranslated
  `placeholder=` attr per the established pattern. `<code>` styling in the
  labelExpr help dropped (plain interpolated string — lazy, no t.rich).
- **Verified:** EN/FI/ET key-set parity (flatten+diff = empty), `tsc --noEmit`
  green, node suite 1334/1334. Live UI render not eyeballed (dev :3602 belongs
  to the user); all new messages are simple `{arg}` ICU — no literal braces.
  Opennext build gate DEFERRED again (9th) — dev server pid 79854 still on
  :3602 with active browser connections.
- **Files:** CMS/src/components/page-builder/binding-panels.tsx,
  CMS/messages/{en,fi,et}.json
