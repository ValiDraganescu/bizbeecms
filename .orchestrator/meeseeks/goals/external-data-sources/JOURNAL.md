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

## 2026-07-02 04:11 — Prune stale purge counters on source/request delete
- **Status:** DONE
- **What I did:** Added pure `pruneCounters(v, {sourceId?, requestIds?})` to
  lib/data-sources/purge.ts (returns the SAME object when nothing matches so
  callers skip the settings write) + effectful `pruneApiCacheVersions(drop)`
  in db/settings-store.ts (best-effort, swallows errors — never fails a
  completed delete). Wired both DELETE handlers: source delete captures its
  saved-request ids BEFORE the delete (they cascade) and prunes source +
  request counters; request delete prunes its one counter. 2 new node tests.
- **Verified:** tsc green; node suite 1336/1336. LIVE smoke on :3602: created
  source+request, purged both scopes (counters appeared in the
  api_cache_versions row), DELETEd the source → both counters gone, global
  counter preserved. Opennext build gate DEFERRED again (10th) — dev server
  pid 79854 still on :3602 with active browser connections.
- **Files:** CMS/src/lib/data-sources/purge.ts, CMS/src/db/settings-store.ts,
  CMS/src/app/api/data-sources/[id]/route.ts,
  CMS/src/app/api/data-sources/[id]/requests/[requestId]/route.ts,
  CMS/scripts/data-source-purge.test.mjs

## 2026-07-02 04:25 — Live AI e2e smoke: real /api/chat model round-trip over the data-source tools
- **Status:** DONE
- **What I did:** Drove POST /api/chat (context page-builder, DEFAULT_MODEL
  openai/gpt-4o-mini via the remote AI binding + gateway) on :3602 with one user
  message instructing the 3-step flow. The model chained:
  create_data_source ("Smoke Posts", jsonplaceholder.typicode.com, authType none,
  saved request GET /posts) → test_data_source (live fetch, status 200, `paths`
  incl. 0.title/0.body) → create_list (page about, template SectionHeading,
  map {title,subtitle}). First create_list failed ("no block with id Section-2")
  and the model SELF-CORRECTED to Section-1 and succeeded — multi-round tool
  loop + error philosophy proven live. Verified in D1: data_source row + the
  api-bound List-1 ({kind:"api",sourceId,requestId,limit:3} + listMap) persisted
  into the page DRAFT version. Cleaned up fully: stripped List-1 from the draft
  tree (page_version UPDATE), DELETE /api/data-sources/:id (200, prune path
  exercised) — ds/req counts back to 0, draft List gone.
- **Found a BUG (recorded in BACKLOG ## Bugs):** tool-dispatch-core's
  makeDispatcher returns `{ name, ...handler(args) }` — a handler payload with
  its own `name` (create_data_source spreads formatSource → source name) SHADOWS
  the tool name in the SSE `tool` frame and the round-tripped ToolResult (frame
  showed name "Smoke Posts" instead of "create_data_source"). Model coped, but
  the client tool card + structured history get the wrong tool name.
- **Verified:** full live model round-trip (2 rounds, ~15k prompt tokens); DB
  state before/after; cleanup confirmed. No source files changed this run.
  Opennext build gate DEFERRED again (11th) — dev server pid 79854 on :3602
  with active browser connections.
- **Files:** goal memory only (+ /tmp/meeseeks-smoke scratch, not committed).

## 2026-07-02 04:33 — BUG FIX: tool name shadowed in dispatch results
- **Status:** DONE
- **What I did:** makeDispatcher (tool-dispatch-core.ts) built
  `{ name, ...handler(args) }`, so a handler payload's own `name` shadowed the
  TOOL name in SSE `tool` frames + round-tripped ToolResults. Reordered to
  `{ ...payload, name }` (tool name always wins). Audited every handler return
  in tool-dispatch.ts for top-level `name`: two offenders — create_data_source
  (spread formatSource → source name; now nested as `source:` so the source
  name survives the overwrite) and create_collection (`name: res.plan.name` →
  renamed `collectionName`). All other `name:` fields are nested (component.*,
  sources[]). Regression test added: dispatcher returns the tool name even when
  the payload carries `name` (fails on the old ordering — proven via node -e).
- **Verified:** tsc green; node suite 1337/1337. Opennext build gate DEFERRED
  again (12th) — dev server pid 79854 still on :3602 with browser connections.
- **Files:** CMS/src/lib/chat/tool-dispatch-core.ts,
  CMS/src/lib/chat/tool-dispatch.ts, CMS/scripts/tool-dispatch.test.mjs

## 2026-07-02 04:47 — Renderer-side e2e render smoke (api-bound List on a PUBLISHED page)
- **Status:** DONE
- **What I did:** Fresh end-to-end insurance after purge/oauth2/dispatch-fix
  landed on top of Slice-3/5. On live dev :3602 (dev-superadmin backdoor), all
  via REST: created source "Render Smoke DS" (jsonplaceholder, authType none) +
  saved request GET /posts?_limit=3; created page `meeseeks-render-smoke`
  (published); PUT a hand-built draft (Section → __section_column__ → List with
  listSource {kind:"api",sourceId,requestId}, listMap {title:"title",
  subtitle:"body"}, SectionHeading listRole:"template" child); published v1;
  GET the PUBLIC route.
- **Verified:** public route 200; all 3 API rows stamped — titles in real SSR'd
  `<h2>` markup (not just RSC payload), bodies in `<p>`. Graceful degrade:
  DELETEd the source, re-render → 200 with 0 rows (never 500). Cleanup: page
  deleted (route 404s), no smoke sources left in /api/data-sources, /tmp
  scratch removed. No code changes this run. Opennext build gate DEFERRED again
  (13th) — dev server pid 79854 still on :3602 with active browser connections.
- **Files:** goal memory only.

## 2026-07-02 04:56 — Data Sources UI help/docs pass
- **Status:** DONE
- **What I did:** Audited all existing help copy first (queryHelp/bodyHelp/secretHelp
  in the manager; apiMapHelp/itemsPathHint/pathPlaceholder/sample loader in
  binding-panels — those were already covered). Filled the two real gaps:
  `dataSources.pathHelp` (path field had zero help; explains base-URL append +
  placeholder tokens, with the literal `{city}` example ICU-interpolated as a
  VALUE per the brace caveat) and `dataSources.testHelp` (Test panel intro:
  live/no-cache, fill placeholders, use response to pick dot-paths like
  main.temp for field maps). EN/FI/ET. Wired both into data-sources-manager.tsx.
- **Verified:** JSON parse ok ×3 locales; tsc green; node suite 1337/1337;
  live smoke on :3602 — EN + FI copy present in the served page. Opennext build
  gate deferred AGAIN (14th) — dev pid 79854 still holds :3602 with active
  browser connections.
- **Files:** CMS/messages/{en,fi,et}.json, CMS/src/components/content/data-sources-manager.tsx

## 2026-07-02 05:05 — A11y pass on the Data Sources forms + ConfirmModal keyboard fix
- **Status:** DONE
- **What I did:** data-sources-manager.tsx: aria-expanded/aria-controls on the
  Requests and Test toggle buttons (panels got matching ids `ds-requests-<id>` /
  `ds-test-<id>`); per-row Edit/Delete/Requests/Test/Purge buttons disambiguated
  with `aria-label="<action> — <name>"` (string concat, no new i18n keys, avoids
  ICU braces); success announcements ("purged" global + per-request, test-status
  line) are now persistent `role="status"` live regions; loading paragraphs got
  role="status"; required/`required={!source?.hasSecret}` on mandatory inputs
  (submit stays disabled-gated, so no native bubbles — semantics only).
  confirm-modal.tsx (shared): `autoFocus` on the cancel button so focus moves
  INTO the dialog on open (Esc handler lives on the overlay and never fired
  while focus stayed on the trigger) + `aria-label={title ?? message}` names the
  dialog. Verified no consumer autofocuses children (grep) — no focus conflict.
- **Verified:** CMS tsc green; node suite 1337/1337; live :3602
  /admin/data-sources 200 with aria-expanded="false" SSR'd on both source rows.
  Opennext build gate STILL deferred (15th) — dev server pid 79854 holds :3602.
- **Files:** CMS/src/components/content/data-sources-manager.tsx,
  CMS/src/components/content/confirm-modal.tsx

## 2026-07-02 05:13 — Query-lines helpers extracted + edge-case node tests
- **Status:** DONE
- **What I did:** Extracted the pure `parseQueryLines`/`serializeQuery`
  helpers out of data-sources-manager.tsx into
  `CMS/src/lib/data-sources/query-lines.ts` (unchanged logic) and added
  `CMS/scripts/query-lines.test.mjs` — 11 tests: blanks/whitespace lines,
  no-`=` → empty value, first-`=` split (value keeps later `=`), trim,
  dup-key last-wins, empty key/value, `{placeholder}` pass-through, CRLF,
  serialize + round-trip. Checked first: `requestPlaceholders` already
  covered in data-source-validate.test.mjs — did NOT duplicate.
- **Verified:** CMS tsc green; node suite 1348/1348 (+11); live :3602
  /admin/data-sources 200 (dev hot-reloaded the import change).
  Opennext build gate STILL deferred (16th) — dev server pid 79854 on :3602.
- **Files:** CMS/src/lib/data-sources/query-lines.ts (new),
  CMS/scripts/query-lines.test.mjs (new),
  CMS/src/components/content/data-sources-manager.tsx (import swap)

## 2026-07-02 05:21 — A11y pass on page-builder binding panels
- **Status:** DONE
- **What I did:** Mirrored the d8ea2c8 manager-forms a11y patterns onto
  binding-panels.tsx: SampleLoader results are now live regions
  (role="status" on the sampleLoaded count, role="alert" on sampleFailed);
  QueryBuilder filter/sort rows got row-scoped aria-labels via plain concat
  (field/op/value selects + remove buttons carry "label — row N" /
  "remove — <field> (N)") so multiple rows aren't ambiguous to screen
  readers. No aria-expanded/controls added — this file has no
  expand/collapse toggles (NEXT.md guessed there were; there aren't).
  ApiParamsEditor/DotPathMap were already per-row labeled. No new strings —
  concat reuses existing keys (ICU-brace caveat honored).
- **Verified:** tsc clean; full suite 1348/1348 green. JSX-attr-only change,
  no pure logic → no new node test (test-business-logic-only). Not
  live-smoked (panel is deep in the builder UI; attrs are static). Opennext
  build gate deferred a 17th time — dev server pid 79854 still on :3602.
- **Files:** CMS/src/components/page-builder/binding-panels.tsx

## 2026-07-02 05:27 — Discharged the owed opennext build gate (isolated worktree)
- **Status:** DONE
- **What I did:** The build gate had been deferred 17 times because the dev
  server (pid 79854, :3602) owns the repo's `.next`. Ran the gate in an
  ISOLATED detached git worktree instead: `git worktree add --detach
  /tmp/cms-gate-worktree HEAD` → `npm ci` in its CMS/ → `npx
  opennextjs-cloudflare build`. Build GREEN: Next compile + OpenNext bundle
  completed, `.open-next/worker.js` saved. Removed the worktree after.
- **Verified:** build output ended "OpenNext build complete" with worker.js
  saved; dev server on :3602 still LISTENing (same pid) after cleanup; repo
  working tree untouched (`git worktree list` back to just main).
- **Files:** none in-repo (build ran in /tmp worktree of HEAD 38f8b4d);
  goal memory files only.

## 2026-07-02 05:36 — Response size cap in the central fetch engine
- **Status:** DONE
- **What I did:** Hardening slice (no open TODOs/bugs; browser tools absent so
  the keyboard-smoke candidate was off the table): `fetchSource` used
  `res.json()`, buffering an UNBOUNDED upstream body into Worker memory
  (128 MB isolate) and re-stringifying it into the cache. Added
  MAX_RESPONSE_BYTES (5 MB): reject via content-length header pre-read, then
  via buffered text length (header may be absent/lie); graceful
  `{ok:false,"upstream response too large"}`, never retried, never cached.
  3 new node tests (header reject 1 call, no-header big body reject + not
  cached, under-cap still parses).
- **Verified:** tsc green; suite 1351/1351 (+3); opennext gate GREEN in an
  isolated /tmp worktree WITH my fetch.ts copied in (recipe from CAVEATS,
  extended: cp uncommitted file into worktree = gate covers pre-commit
  changes); dev pid 79854 on :3602 untouched.
- **Files:** CMS/src/lib/data-sources/fetch.ts,
  CMS/scripts/data-source-fetch.test.mjs

## 2026-07-02 05:45 — Redirect hardening in the central fetch engine (SSRF + secret-leak fix)
- **Status:** DONE
- **What I did:** Closed a PROVEN security gap: `fetchSource` and
  `fetchOauth2Token` used fetch's default `redirect:"follow"`, so a
  compromised/malicious upstream could (a) 302 the Worker past the save-time
  SSRF check to 169.254.x/.internal, and (b) ship the custom auth header
  (X-API-Key / Basic / Bearer + oauth2 client creds) to any host it named.
  Fix: `redirect:"manual"` everywhere; fetchSource follows redirects itself —
  only same-host hops (same origin OR http→https upgrade), max 3; 303 and
  301/302-on-non-GET re-issue as GET without body (spec); rejected redirect →
  graceful `{ok:false}`, never retried. oauth2 token fetch never follows
  (3xx → existing "token endpoint responded N" error). +7 node tests
  (cross-origin reject w/ no attacker fetch, same-origin follow w/ manual
  mode asserted, https-upgrade allow + downgrade reject, hop cap, POST→GET
  rewrite, missing Location, oauth2 302).
- **Verified:** tsc green; suite 1358/1358 (+7); opennext gate GREEN in the
  isolated /tmp worktree with both changed files cp'd in; LIVE smoke on :3602
  via the real test endpoint against httpbingo.org — /redirect/1 (same
  origin) → 200 with data, /redirect-to?url=https://example.com → graceful
  `{ok:false,"upstream redirected to a different host"}`; source deleted
  after (no leftovers).
- **Files:** CMS/src/lib/data-sources/fetch.ts,
  CMS/scripts/data-source-fetch.test.mjs

## 2026-07-02 05:52 — Streaming enforcement of the 5MB size cap (fresh-eyes defect)
- **Status:** DONE
- **What I did:** Manager asked for (a) provable defect or (b) consolidation —
  found (a). The 5MB cap in `fetch.ts` measured `text.length` AFTER
  `res.text()` had already buffered the whole body, so a chunked upstream
  (no content-length header) could still stream 100MB+ into Worker memory
  before rejection; the oauth2 token fetch (`res.json()`) had NO cap at all.
  Fix: new `readBodyCapped(res)` — streams `res.body` via getReader(), counts
  raw bytes per chunk, cancels the reader the moment the cap is exceeded
  (TextDecoder streaming decode; no-body fallback to text()+length for mocks).
  Wired into both the main fetch path and `fetchOauth2Token`.
- **Verified:** Regression test proves EARLY ABORT: 20×1MB chunked stream with
  a pull counter — old code pulls 20/20 (test FAILS on HEAD~), fixed code
  pulls ~6 and errors "too large". +oauth2 oversized-token test (also fails on
  old code). tsc green; full suite 1360/1360 (was 1358). Opennext gate run in
  the isolated /tmp worktree with the changed fetch.ts copied in (dev live on
  :3602, untouched).
- **Files:** CMS/src/lib/data-sources/fetch.ts,
  CMS/scripts/data-source-fetch.test.mjs

## 2026-07-02 05:56 — Consolidation: help-copy audit + state-of-the-goal curator handoff
- **Status:** DONE
- **What I did:** Audited all operator-facing copy against shipped fetch-engine
  behavior: dataSources i18n namespace (en/fi/et), AI tool schema descriptions
  (data-source-tools.ts), Test-panel error surfacing. No claim contradicts the
  code — cache defaults in copy (on, 60s) match validate.ts defaults; the
  retryable label matches its dual retry/cache semantics; redirect + size-cap
  failures surface as the fetch engine's self-describing error strings
  ("upstream redirected to a different host", "upstream response too large"),
  so no i18n copy is owed. Overwrote NEXT.md as a crisp state-of-the-goal +
  curator handoff (slices 1–8 shipped, revision directive satisfied, 2 security
  passes, gates green) recommending ARCHIVE.
- **Verified:** grepped copy sources for redirect/size/retry/cache claims;
  checked cacheEnabled/cacheTtlSec defaults in validate.ts (true / 60);
  confirmed no open bugs/TODOs in BACKLOG. Memory-only run — no code touched,
  no build gate owed.
- **Files:** goal memory only (NEXT.md, JOURNAL.md, BACKLOG.md, CAVEATS.md).

## 2026-07-02 06:03 — Fresh-eyes defect hunt #3 (CLEAN PASS)
- **Status:** DONE
- **What I did:** Manager asked for ONE more independent defect hunt across the
  whole data-sources surface (fetch/auth/cache/purge/binding/AI tools) —
  provable defects only with a failing-first test, else a clean-pass entry and
  NO code changes. Read every module: fetch.ts (substitution/encoding, auth
  injection, manual redirects, streaming 5MB cap, oauth2 grant + 401 refresh,
  retry budget, cache-key/versioning), bind.ts (param resolution, flat-by-path
  row keys — no proto-write vector), hydrate.ts (graceful effects wrapper,
  Cache-API impl), purge.ts (version counters), validate.ts (URL/SSRF +
  placeholders), data-source-store.ts (write-only secrets, request→source
  scoping), and all 7 routes (every one Admin-gated; secretEnc never returned).
  Found NO provable defect. Two candidates weighed and dismissed as
  accepted-scope, not defects:
  (1) numeric-form IP SSRF bypass — `validateBaseUrl("http://2130706433")`
  (=127.0.0.1), octal/hex/IPv4-mapped-IPv6 similarly slip the internal-host
  blocklist. Real gap in the check's stated intent, BUT explicitly accepted
  "light v1" (GOAL + user directive + caveat), NOT exploitable on Cloudflare
  Workers (fetch can't reach 127.0.0.1/169.254; no metadata service), and the
  redirect resolver already blocks cross-host hops. Not provably exploitable
  here → not touched (would be scope creep past the user's light-v1 decision).
  (2) query-auth secret dropped when following a same-host redirect (the
  Location URL rarely carries the auth query param) — functional edge only,
  same-host, query-param APIs rarely 3xx. Low-value, not a defect.
- **Verified:** `tsc --noEmit` exit 0 (clean); `node --test data-source-*.test.mjs`
  102/102 green. Memory-only run — no code touched, so no opennext gate owed
  (dev live on :3602 anyway, per caveat). Full-suite 1360 green stands from the
  prior run (no code changed since).
- **Files:** goal memory only (JOURNAL.md, BACKLOG.md, NEXT.md).

## 2026-07-02 06:07 — Query-auth secret re-applied on same-host redirect hops
- **Status:** DONE
- **What I did:** Fixed the last open functional edge from defect hunt #3: `buildRequest`
  sets query auth on the initial URL only, and the manual redirect loop took the
  Location target verbatim — so a same-host hop silently dropped the query secret
  (header auth survived hops; query auth didn't). Fix: after `resolveSafeRedirect`
  approves the hop, re-set `source.authParam=secret` on the next URL (query-auth
  sources only; never cross-origin — those are rejected before this point).
- **Verified:** Failing-first regression test (hop URL must carry `?key=sek`) —
  fails on old code (secret dropped → route miss), passes with fix. tsc clean;
  full suite 1361/1361 green (+1). opennext gate GREEN via isolated worktree with
  fetch.ts copied in; worktree removed. Dev on :3602 untouched.
- **Files:** CMS/src/lib/data-sources/fetch.ts, CMS/scripts/data-source-fetch.test.mjs

## 2026-07-02 06:11 — Final verification pass (verification-only, no code)
- **Status:** DONE
- **What I did:** Clean-checkout verification at HEAD e25895e: tsc --noEmit (exit 0), full node suite (1361/1361 pass, 0 fail), opennext gate via isolated worktree (`/tmp/cms-gate-worktree`, npm ci + `npx opennextjs-cloudflare build` → worker.js saved, GREEN; worktree removed, dev :3602 untouched). All gates green — goal confirmed ready for curator ARCHIVE.
- **Verified:** everything above; nothing red, nothing changed.
- **Files:** goal memory only.

## 2026-07-02 09:36 — httpbingo living test fixture page (USER task)
- **Status:** DONE
- **What I did:** Built the user-requested end-to-end living fixture in the local
  CMS site (dev :3602, local D1) exercising the whole feature against
  https://httpbingo.org. All via live REST (no repo code changed):
  - Component `ApiProbe` (PUT /api/components/ApiProbe, published): heading,
    proves (self-documentation), l1–l3/v1–v3 (label/bind-value pairs), p1/p2
    (param feeds for `{prop}` param specs).
  - 5 data sources (names prefixed "httpbingo fixture — "), one per auth mode:
    public/none `4cf4fb2a-cc5a-4cff-9d78-f0995e88f22b`,
    basic (`bee:hive`) `bebdcfc8-44f0-40f5-bb3a-b7164aab13d5`,
    bearer (header Authorization) `97bae8ab-3f64-4d64-9258-e546d918a2a6`,
    header key (X-Api-Key) `6f005fb9-5da6-479a-a2ae-68ff24fd662f`,
    query key (api_key) `4aa4db9e-9293-49d0-b44d-60810861e0b8`.
  - 12 saved requests: GET /get echo, GET /json (List bind), GET
    /anything/{thing}?greeting={greeting} (placeholder path+query), POST /post +
    PUT /put (JSON bodyTemplate with {msg}), DELETE /delete?reason={reason},
    /uuid cached TTL 300s vs /uuid cache-off, /basic-auth/bee/hive, /bearer,
    /headers, /get (query-key echo).
  - Page `api-fixture-httpbingo` (id `29acc0c0-4295-4ac5-bb6e-5d73d0ae492b`),
    published, root-level: 7 sections — intro, GET single-item bind, List bind
    (itemsPath slideshow.slides, grid), {placeholder}-from-props (params
    {thing:{prop:"p1"},greeting:{prop:"p2"}}), POST/PUT/DELETE (literal params),
    cache visibility (frozen vs live uuid side by side), 4 auth probes. Every
    card's `proves` prop documents exactly what that block proves, on the page.
  - Did NOT build any visitor form submission (explicitly excluded; now a
    separate approved TODO in BACKLOG).
- **Verified:** all 12 requests green via the Test endpoint; public route
  http://localhost:3602/api-fixture-httpbingo SSRs real API data — checked
  echoed query param, List rows ("Wake up to WonderWidgets!"/"Overview"),
  URL-encoded path param (honey%20pot), POST/PUT body echoes, DELETE reason,
  bearer token, X-Api-Key + api_key echoes, basic user=bee; 3 consecutive
  renders: cached uuid IDENTICAL, cache-off uuid DIFFERENT each time (caching
  made visible). Booleans (authenticated=true) render fine in string slots.
  No repo code touched → no tsc/opennext gate owed.
- **Files:** goal memory only; fixture lives in the local D1
  (.wrangler/state, gitignored) + this recipe.

## 2026-07-02 09:51 — Form block slice (a): built-in Form + dual-mode submit endpoint (api + collection targets)
- **Status:** DONE
- **What I did:** The user-approved Form block, first slice. (1) `FORM_COMPONENT`
  ("Form") built-in in plan-types.ts (+BUILTIN_COMPONENTS, so the block PUT
  route's component check passes); `Block.formTarget` (source-agnostic:
  kind api → sourceId/requestId, kind collection → tableName; plus optional
  successMessage/errorMessage/redirect) and renderer-set `Block.formPageId`.
  (2) Pure `plan-form.ts`: `planForm` renders a real `<form method="POST"
  action="/api/forms/submit">` wrapping the block's children (native submit
  semantics — a child component's type=submit button just works) with hidden
  `__bb_page`/`__bb_block` identity inputs + an aria-live `[data-form-status]`
  region; `FORM_ENHANCE_SCRIPT` (shipped once via planPage assets, like the
  combobox) intercepts submit and re-posts the same FormData with
  Accept:application/json for inline success/error; `stampFormPageId` stamps
  the page id in buildPlanFromPage (no-op without a Form). Un-targeted/
  un-stamped Forms degrade to a plain container. (3) PUBLIC endpoint
  `POST /api/forms/submit`: parses form-data OR JSON, caps (64KB body, 100
  fields, 8KB/value), per-IP rate limit (20/10min riding login_attempt kind
  "form"), resolves the target from the PUBLISHED page's blocks (client never
  names a target), then: api kind → central fetchSource with placeholders
  filled from form fields, cache bypassed + retryable forced false; collection
  kind → `collection.publicSubmissions` opt-in gate (new D1 column, migration
  0026, default OFF; toggle via collections PATCH `_op:"set_public_submissions"`)
  → declared-schema-fields-only body → `createItem` with FORCED draft status.
  Dual response: Accept json → `{ok,error?}`; native → 303 redirect (authored
  same-site `redirect` or Referer) + `?bb_form=ok|error`. Pure trust-boundary
  logic in dep-free `lib/forms/submit-core.ts`.
- **Verified:** tsc clean; node suite 1375/1375 (14 new: plan-form 5,
  submit-core 9); opennext gate GREEN in isolated worktree (changes copied in;
  dev :3602 untouched). Live on :3602 (temp published page, then cleaned up):
  SSR shows both `<form>`s w/ identity inputs + one enhancement script; api
  target native mode → 303 `?bb_form=ok` and JSON mode → `{ok:true}` against
  httpbingo POST /post echo ({msg} placeholder filled from the form field);
  missing placeholder → 400 naming "msg"; non-Form block id → 404; collection
  target: 403 before opt-in, ok after; item landed status=draft with rogue/
  status/slug fields dropped; required-field miss → 400; page delete → 404.
  Did NOT live-trip the rate limit (would lock local IP 10 min) — pure logic
  node-tested.
- **Files:** CMS/src/lib/render/{plan-types.ts,plan-form.ts,plan-form.test.ts,
  tree.ts,render-page.tsx}; CMS/src/lib/forms/{submit-core.ts,
  submit-core.test.ts}; CMS/src/app/api/forms/submit/route.ts;
  CMS/src/app/api/collections/[name]/route.ts; CMS/src/db/{schema.ts,
  collection-store.ts,login-attempt-store.ts}; CMS/migrations/0026_*.sql
  (+meta).

## 2026-07-02 10:01 — Form slice (c): live Form test cards on the httpbingo fixture page
- **Status:** DONE
- **What I did:** Extended the living fixture (local D1 only, NO repo code) with a
  new `fx-forms` Section (2 cols) on page api-fixture-httpbingo
  (29acc0c0-4295-4ac5-bb6e-5d73d0ae492b), published (version 3):
  - Component `FormProbeApi` (PUT /api/components — body is `html` string, NOT a
    tree): heading/proves props + one `<input name="msg">` + native
    `type="submit"` button.
  - Component `FormProbeContact`: heading/proves + name/email/message inputs
    (required) + submit button.
  - Collection "Form fixture enquiries" → `content_form_fixture_enquiries`
    (id 2e068309-03b2-4939-a505-abfd848bb825), fields name/email/message all
    required string, publicSubmissions ON via PATCH _op:set_public_submissions.
  - Block `fx-form-api`: Form w/ formTarget kind=api,
    sourceId 4cf4fb2a-cc5a-4cff-9d78-f0995e88f22b (public httpbingo source),
    requestId deec059d-72da-419d-8162-2081a64e5e71 (POST /post, {msg} body
    placeholder), authored success/error messages; child FormProbeApi.
  - Block `fx-form-coll`: Form w/ formTarget kind=collection,
    collection=content_form_fixture_enquiries; child FormProbeContact.
  - Both cards' `proves` prop documents on-page exactly what they prove
    (identity-input security model, placeholder fill, no-retry/no-cache,
    opt-in gate, forced draft, dual modes).
- **Verified (all live on :3602):** SSR: exactly 2 `<form data-form
  action="/api/forms/submit">` w/ hidden __bb_page/__bb_block identity inputs
  (page id stamped by stampFormPageId), 2 submit buttons, 2 status regions,
  enhancement script shipped ONCE. Submits (5 total, under the 20/10min IP
  limit): api native → 303 `?bb_form=ok`; api fetch/Accept:json → `{ok:true}`;
  collection native → 303 ok; collection fetch → `{ok:true}`; both items landed
  `status:"draft"` with the submitted rogue `status=published` +
  `rogue_field` DROPPED; publicSubmissions toggled OFF → 403 "this form does
  not accept submissions", toggled back ON (restored), item count unchanged.
  No repo code touched → no tsc/opennext gate owed.
- **Files:** goal memory only; fixture state lives in the local D1
  (.wrangler/state, gitignored) — rebuild from the ids above + JOURNAL
  2026-07-02 09:36 recipe.

## 2026-07-02 10:05 — P1 bug fix: inspector bind panel blind to api-keyed bindings
- **Status:** DONE
- **What I did:** Root-caused the P1 "DATA SOURCE — none —" bug: `BindingPanel`
  hard-read `block.bindings?.item`, but the renderer hydrates EVERY binding key
  (`Object.entries`, render-page.tsx:453) — the httpbingo fixture's hand-built
  binds are stored under key `"api"`, so they SSR'd fine but were invisible and
  uneditable in the inspector. Fix: new pure `firstBinding(bindings)` in
  `lib/content/binding.ts` returns the block's first `[key, ref]` entry (any
  key; skips null entries; defaults `["item", undefined]`); `BindingPanel` now
  reads it and BOTH emit paths (`emit`/`emitApi`) write back under that same
  preserved key — display → edit → save round-trips whatever the key.
  `ListSettings` reads `block.listSource` directly and never had the bug.
  Also added `scripts/ssr-bind-panel-check.mjs` — a manual (not-in-suite)
  esbuild+react-dom/server harness that renders the REAL BindingPanel and
  ListSettings with the REAL fx-get-echo / fx-slides-list fixture blocks + en
  messages and asserts the source/request options are `selected` and the
  map/itemsPath inputs carry values; it takes an optional path arg to run
  against an old panel revision.
- **Verified:** fails-before/passes-after: check FAILS against the pre-fix
  panel (`git show HEAD:` copy → "— none —" selected) and PASSES against the
  fixed one, for BOTH panels. 4 new node tests in scripts/binding.test.mjs
  (key preservation contract). tsc clean; `npm test` 1379/1379 (was 1375);
  opennext gate GREEN via the isolated-worktree recipe (HEAD 0095fb6 + my two
  src files copied in; dev on :3602 untouched). Draft API confirmed to serve
  `bindings.api` to the builder (fx-get-echo). Could NOT click through the
  browser UI this run (no browser tooling available to this instance) — the
  SSR check + key-preserving emits + the API's proven acceptance of api-keyed
  bindings cover display→edit→save; a human/browser-equipped run can eyeball
  the builder for final confidence. Did NOT touch the fixture page draft (a
  parallel Meeseeks was working Form slice (c) on that same page).
- **Files:** CMS/src/lib/content/binding.ts (firstBinding),
  CMS/src/components/page-builder/binding-panels.tsx (read+write via
  bindingKey), CMS/scripts/binding.test.mjs (+4 tests),
  CMS/scripts/ssr-bind-panel-check.mjs (new manual check).

## 2026-07-02 10:12 — P2 bug: stale collection-only bind/list panel copy
- **Status:** DONE
- **What I did:** Retitled the bind/list panel copy source-agnostically now that
  the DATA SOURCE picker offers API sources: `pageBuilder.bind.title`
  "Bind to collection" → "Bind to data source", `bind.help` → "…first matching
  collection item, or a mapped API response", `list.help` → "…once per item from
  the selected data source", plus the same-family `layoutList` "List (from
  collection)" → "List (from data source)". EN/FI/ET (fi: tietolähde, et:
  andmeallikas). `list.title` ("List") was already neutral — untouched.
  Regression: new `scripts/bind-copy.test.mjs` — (1) asserts none of the exact
  stale strings render in bind.title/help, list.title/help, layoutList (fails on
  pre-fix messages, proven via `git stash -- messages/`), (2) key-parity lock on
  pageBuilder.bind + pageBuilder.list across EN/FI/ET + no blanks.
- **Verified:** regression test fails-before/passes-after; isolated-worktree gate
  (HEAD 0523765 + my 4 files copied in): `npm run cf-typegen` → tsc clean →
  suite 1381/1381 → `npx opennextjs-cloudflare build` GREEN. Local
  `ssr-bind-panel-check.mjs` still OK (renders the panels under the new
  messages). NOTE: repo-local tsc currently fails in lib/chat/* — that's the
  PARALLEL Form-AI-tools Meeseeks's in-flight uncommitted work, not mine.
- **Files:** CMS/messages/{en,fi,et}.json, CMS/scripts/bind-copy.test.mjs

## 2026-07-02 10:20 — Form slice (d): AI tools create_form / bind_form
- **Status:** DONE
- **What I did:** Two new AI tools for the built-in Form block. Pure
  `lib/chat/form-tools.ts`: CREATE_FORM_TOOL/BIND_FORM_TOOL schemas,
  validateCreateForm/validateBindForm (source+request XOR collection; redirect
  must be same-site "/…" not "//…"; bind_form is PATCH-like with `clear:true`
  and rejects empty patches with guidance), and pure `mergeFormTarget`
  (kind-switch drops the other kind's fields; messages/redirect survive).
  CF handlers in tool-dispatch.ts: `resolveFormTarget` validates api targets
  via the existing resolveSourceAndRequest (id OR name; only IDs persisted)
  and collection targets via getCollection + the publicSubmissions gate —
  the opt-in-off error is self-correcting (names the exact PATCH
  `_op:set_public_submissions` fix and says it's operator-only). NO field→
  placeholder map argument BY DESIGN: submit-core maps by NAME, so both tools
  return `fields` (requestPlaceholders() for api / declared schema field
  names for collection) + a `note` telling the model to author a child
  component with matching `<input name=…>` + a type="submit" button.
  Registrations: KNOWN_TOOL_NAMES + TOOL_BY_NAME + HANDLERS + TOOLS_BY_CONTEXT
  (page-builder, pages) + both context prompts. page-blocks.ts: isForm,
  addFormBlock/addFormToSection (mirror of the List inserters), setBlockField
  Pick extended with formTarget, FORM_COMPONENT re-exported; newListId
  generalized to newBlockId(component).
- **Verified:** 15 new node tests (form-tools.test.ts); tsc clean; full suite
  1396/1396; live GET /api/chat/debug?context=page-builder on :3602 lists both
  tools + the prompt mentions create_form; opennext gate GREEN in an isolated
  /tmp worktree (HEAD 0523765 + my 5 files copied in). NOT verified: a real
  model round-trip driving create_form (mirror the Slice-6 live AI smoke if
  wanted — costs a model call).
- **Files:** CMS/src/lib/chat/form-tools.ts (new),
  CMS/src/lib/chat/form-tools.test.ts (new), CMS/src/lib/chat/tool-dispatch.ts,
  CMS/src/lib/chat/tool-scopes.ts, CMS/src/lib/pages/page-blocks.ts

## 2026-07-02 10:29 — Live AI e2e smoke: Form tools (create_form, both target kinds + error path)
- **Status:** DONE
- **What I did:** Drove real /api/chat (context page-builder, default
  gpt-4o-mini) rounds on :3602 against a TEMP page (`meeseeks-form-ai-smoke`,
  one Section `smoke-sec`) + a TEMP non-opted-in collection
  `content_smoke_noopt_enquiries`. The model, live:
  (1) create_component SmokeApiChild (input name="msg" + type=submit) and
  SmokeContactChild; (2) **create_form api target** by NAMES ("httpbingo
  fixture — public" / "POST echo") → Form-1 persisted with resolved IDs +
  authored success/error messages; result carried fields ["msg"] + the
  author-matching-inputs note; (3) get_page → update_page_blocks full-tree
  re-pass placing the child inside Form-1; (4) **create_form collection target
  on the non-opted-in collection → the self-correcting error fired verbatim**
  (names publicSubmissions + the exact PATCH `_op:set_public_submissions` fix)
  **and the model recovered in the same round** — retried with
  `content_form_fixture_enquiries` → Form-2 (fields name/email/message) and
  placed SmokeContactChild; (5) when live submit 400'd `field "email" is
  required` (model's child lacked it), a follow-up chat did
  get_component → update_component adding the email input — component edit
  landed as DRAFT; I published it via POST /api/components/... action:publish.
  Published the page (version 1 + full-body PUT publishStatus) and live-fired
  ALL 4 submit paths: api native → 303 `?bb_form=ok`, api fetch/JSON →
  `{ok:true}`, collection native → 303 ok, collection fetch (with rogue
  `status=published` + `rogue_field`) → `{ok:true}`; both items landed FORCED
  `status:"draft"` with rogue/unknown fields dropped. 5 model calls, 5 submits
  (under the 20/10min IP limit). Full cleanup: temp page deleted (route 404s),
  temp collection + both Smoke components deleted; fixture untouched (its 2 new
  draft enquiries are the deliberate accumulating proof).
- **Findings (recorded as BACKLOG TODOs):**
  (a) page-blocks validation says `id must be a short identifier…` when the id
  is MISSING — not self-correcting enough: one run had gpt-4o-mini retry the
  byte-identical payload twice and give up; another run recovered. Should say
  "missing — add a short unique id, e.g. …".
  (b) create_form → "place a child" requires the full-replace
  update_page_blocks; an un-nudged gpt-4o-mini twice REPLACED the whole tree
  with a hand-built fake "Form" block (never calling create_form / dropping
  the real formTarget). An optional `child` component arg on create_form
  (addFormToSection already exists) would make one call yield a working form.
- **Verified:** everything above live; no repo code changed → no tsc/opennext
  gate owed. Memory-only commit.
- **Files:** goal memory only (/tmp scratch removed).

## 2026-07-02 10:35 — Form slice (b): page-builder UI for the Form block (PINNED)
- **Status:** DONE
- **What I did:** Full builder surface for the built-in Form block:
  (1) **FormSettings panel** (binding-panels.tsx, new export) wired into the
  shell's Block tab via `isForm()` (before the generic component branch):
  source-agnostic target picker (SAME SourceSelect optgroups as binds —
  collections + API sources), saved-request select for api kind, and — by
  design, mirroring slice (d)'s "NO map arg" — **no field→placeholder map
  editor**: the submit endpoint matches fields BY NAME, so the panel SHOWS the
  exact expected input names as mono chips (api = the request's
  `{placeholders}` via requestPlaceholders; collection = its schema field
  names) with per-kind help copy. Success/error message inputs (placeholders =
  the real FORM_DEFAULT_* fallbacks), optional same-site redirect with a live
  invalid warning (`/`-prefix check matching formRedirectUrl's rule), and a
  role="alert" warning + link to /admin/collections when the picked
  collection's `publicSubmissions` is OFF. Kind-switching is destructure-based
  like bind_form (other kind's ids dropped; messages/redirect survive).
  Content component set like the List template (single child by name via
  select, `__child` → setBlockChildren); a multi-child (AI-authored) form
  shows its children read-only instead so the select can't clobber them.
  (2) **Form primitive insertable**: `{kind:"form"}` DragPayload, rail button
  (`layoutForm`) under Section/List, layers-tree column drop → new
  onDropForm → addFormBlock (slice-d helper). (3) **publicSubmissions toggle
  in the Collections UI** (collections-manager.tsx): per-row checkbox PATCHing
  `_op:set_public_submissions`, aria-labelled per collection, hint via title.
  (4) `CollectionMeta.publicSubmissions?` added (GET /api/collections already
  returns it — verified live on :3602). (5) shell: onUpdateBlockField accepts
  `formTarget`; new onUpdateForm (formTarget via setBlockField + __child via
  setBlockChildren). (6) EN/FI/ET: `pageBuilder.layoutForm`,
  `pageBuilder.form.*` (18 keys), `collections.publicSubmissions{,Hint}` —
  all brace-free (ICU caveat).
- **Regression:** scripts/form-copy.test.mjs (suite): EN/FI/ET key parity for
  the new namespaces + a no-literal-ICU-braces lock on all form copy.
  scripts/ssr-bind-panel-check.mjs EXTENDED: SSRs FormSettings with fixture-
  style api- and collection-target Form blocks — asserts selected source +
  request options, expected-input-name chips, authored success message +
  redirect displayed, warning present when publicSubmissions OFF and absent
  when ON. (next/link had to be dropped for a plain <a> — the check's esbuild
  bundle can't dynamic-require react/jsx-runtime; new caveat.)
- **Verified:** repo tsc clean; suite 1398/1398; ssr-bind-panel-check OK (all
  panels); GET /api/collections live on :3602 returns publicSubmissions
  (fixture enquiries = true). Isolated-worktree gate (changes copied in):
  npm ci → cf-typegen → tsc → 1398/1398 → opennextjs-cloudflare build ALL
  GREEN; worktree removed, dev server untouched. NOT verified: a real-browser
  drag/click smoke of the panel (SSR display check + wiring types cover
  rendering; interaction handlers follow the byte-similar List panel pattern).
- **Files:** CMS/src/components/page-builder/{binding-panels,page-builder-shell,layers-tree,components-rail}.tsx,
  CMS/src/components/content/collections-manager.tsx,
  CMS/src/lib/page-builder/{types,dnd}.ts, CMS/messages/{en,fi,et}.json,
  CMS/scripts/form-copy.test.mjs (new), CMS/scripts/ssr-bind-panel-check.mjs.

## 2026-07-02 11:05 — Self-correcting missing-block-id error (AI-smoke finding 1)
- **Status:** DONE
- **What I did:** validateBlocks' `walk` (lib/pages/page-blocks.ts) collapsed
  ABSENT and MALFORMED ids into one message ("…id must be a short identifier"),
  which the live AI smoke proved non-self-correcting: gpt-4o-mini retried a
  byte-identical payload (still no id) twice and gave up. Split the check:
  (1) `b.id == null || b.id === ""` → "`${path}.id` is missing — give the
  block a short unique id (letters, digits, -, _), e.g. \"contact-form-child\"";
  (2) malformed → names the exact bad token (`JSON.stringify(b.id)` capped at
  80 chars) before the rule, per the error-philosophy memory (name the bad
  token + the fix). Empty string deliberately counts as missing; non-string
  ids (e.g. 42) are malformed-not-missing.
- **Regression:** new test in scripts/page-blocks.test.mjs — proved
  failing-first by swapping in the HEAD copy of page-blocks.ts (old message ✗
  /\.id is missing/), restored fix → 31/31. Asserts absent, empty-string,
  bad-token naming ("has spaces!"), and 42-is-malformed.
- **Verified:** tsc clean; full suite 1399/1399; opennext gate GREEN in an
  isolated worktree off HEAD 9b6f219 (slice (b) now committed) with my two
  files copied in (npm ci → cf-typegen → tsc → tests → build); worktree
  removed, dev on :3602 untouched. No UI strings → no i18n.
- **Files:** CMS/src/lib/pages/page-blocks.ts,
  CMS/scripts/page-blocks.test.mjs.
