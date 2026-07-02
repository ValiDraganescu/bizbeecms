# Backlog — external-data-sources
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

- DONE (2026-07-02) [P2] (found by live AI smoke 2026-07-02): **Tool name shadowed in dispatch
  results.** FIXED: `{ ...payload, name }` ordering in makeDispatcher + regression
  test; create_data_source now nests `source:`, create_collection renamed its
  field to `collectionName`. Suite 1337 + tsc green. Original report: `makeDispatcher` (lib/chat/tool-dispatch-core.ts) builds
  `{ name, ...(await handler(args)) }`, so any handler payload with its own
  `name` field overwrites the TOOL name — create_data_source spreads
  `formatSource(...)` (source name) and its SSE `tool` frame + round-tripped
  ToolResult carried name "Smoke Posts" instead of "create_data_source".
  Fix: make the tool name win (e.g. `{ ...(await handler(args)), name }`) and
  keep the created source's data under a non-colliding field (it already sits
  in `input`/`requests`; or nest as `source:`). Regression test: dispatcher
  returns the TOOL name even when the handler payload has `name`. Check other
  handlers that return a top-level `name` (get_component?) for the same
  collision. Suite + tsc gate.

## Tasks
- DONE (2026-07-02): **Consolidation: help-copy audit + curator handoff** — verified
  UI copy (dataSources i18n, AI tool descriptions, Test panel) makes no claims
  contradicting shipped behavior (cache defaults match validate.ts; redirect/
  size-cap failures surface via fetch-engine error strings by design); NEXT.md
  rewritten as state-of-the-goal recommending the curator ARCHIVE this goal.

- DONE (2026-07-02): **Streaming enforcement of the 5MB size cap** — fresh-eyes defect:
  `res.text()` buffered the ENTIRE body before the length check, so a chunked
  response (no content-length) still exhausted Worker memory before rejection;
  oauth2 token fetch (`res.json()`) had no cap at all. Fixed: `readBodyCapped`
  byte-counted streaming read that cancels the reader when the cap is exceeded;
  shared by the main fetch + token fetch. Regression test proves early abort
  (pull counter: 20/20 chunks on old code → ~6 with fix) + oauth2 oversized-token
  test. tsc + 1360 green; opennext gate GREEN (worktree, change copied in).

- DONE (2026-07-02): **Redirect hardening in the central fetch engine** — default
  `redirect:"follow"` let a malicious upstream 302 past the save-time SSRF
  check (to 169.254.x / .internal) AND forwarded custom auth headers
  (X-API-Key, Basic, oauth2 Bearer/client creds) cross-origin. Fixed:
  `redirect:"manual"` everywhere; only same-host redirects followed (same
  origin or http→https upgrade), max 3 hops; cross-origin → graceful
  `{ok:false}`, never retried. oauth2 token fetch never follows. +7 node
  tests; tsc + 1358 green; opennext gate GREEN (worktree, changes included);
  live-smoked against httpbingo.org on :3602.

- DONE (2026-07-02): **Response size cap in the central fetch engine** — a huge
  upstream body buffered unbounded into `res.json()` + the cache; added
  MAX_RESPONSE_BYTES 5MB (content-length precheck + text-length check), graceful
  `{ok:false}` never-retry/never-cache, 3 node tests. tsc + 1351 green;
  opennext gate GREEN (worktree, change included).

- DONE (2026-07-02): **Discharged the owed opennext build gate in an ISOLATED git
  worktree** (dev on :3602 live, so built HEAD 38f8b4d in a /tmp detached
  worktree: npm ci + `npx opennextjs-cloudflare build` → GREEN, worker.js
  saved; worktree removed, dev server untouched). The 17-deferral debt is paid.

- DONE (2026-07-02): **A11y pass on the page-builder binding panels** —
  role="status"/role="alert" live regions on SampleLoader results; row-scoped
  concat aria-labels on QueryBuilder filter/sort controls + remove buttons.
  No toggles exist in this file (no aria-expanded needed). tsc + 1348 green;
  opennext gate deferred (17th).

- DONE (2026-07-02): **Query-lines edge-case tests** — extract pure
  `parseQueryLines`/`serializeQuery` from data-sources-manager.tsx into
  `lib/data-sources/query-lines.ts`, node tests for edge cases (no `=`,
  value with `=`, trim, blanks, dup keys, round-trip). requestPlaceholders
  already covered in data-source-validate.test.mjs — verified, skipped.

- DONE (2026-07-02): **A11y pass on the Data Sources forms** — aria-expanded/controls
  on the Requests/Test toggles, role="status" on success/loading announcements,
  required on mandatory inputs, per-row button labels disambiguated
  (aria-label with source/request name), ConfirmModal keyboard fix (autoFocus
  cancel so Esc works + focus lands in the dialog; aria-label names the dialog).
  tsc + 1337 tests green; live-smoked on :3602. Opennext gate deferred (15th).

- DONE (2026-07-02): **Data Sources UI help/docs pass** — audited existing copy
  (binding-panels already covers maps/itemsPath/samples); added the two missing
  pieces: `pathHelp` (path field, `{city}` example ICU-interpolated as a value)
  and `testHelp` (Test panel purpose: live no-cache call → dot-paths for maps).
  EN/FI/ET; tsc + 1337 tests green; live-smoked on :3602. Opennext gate
  deferred (14th).

- DONE (2026-07-02): **Renderer-side e2e render smoke** — api-bound List on a
  PUBLISHED page SSRs real API data via the public route (fresh insurance after
  purge/oauth2/dispatch-fix landed on top of Slice-3/5). Live on :3602:
  jsonplaceholder source + GET /posts request, hand-built List draft, publish,
  public route 200 with 3 rows in real `<h2>` SSR; source-delete → 200/0 rows
  (graceful); full cleanup (page 404s, no sources left). Opennext gate
  deferred (13th).

- DONE (2026-07-02): **Live AI e2e smoke** — real /api/chat model round-trip
  (gpt-4o-mini) chained create_data_source → test_data_source → create_list
  (incl. one model self-correction on a bad section id); api-bound List landed
  in the page draft; full cleanup. Found the dispatch name-shadow bug above.
  Opennext gate deferred (11th).

- DONE (2026-07-02): **Prune stale purge counters** in the `api_cache_versions`
  settings row on source/request delete — pure `pruneCounters` + best-effort
  `pruneApiCacheVersions` wired into both DELETE handlers; source delete captures
  cascading request ids first. tsc + 1336 tests green; live-verified on :3602.
  Opennext gate deferred (10th).

- DONE (2026-07-02): **Localize the hardcoded-English combobox config section** in
  binding-panels.tsx (pre-existing debt from the combobox slice) — 27 EN/FI/ET keys
  under `pageBuilder.list.*` (`presentation*`, `cb*`); ICU-value interpolation for
  `${…}` snippets. tsc + 1334 tests green; opennext gate deferred (9th).

Build order: source schema + encrypted secret first, then the fetch+map engine,
then the source-agnostic binding, then UI, then AI tools. Each slice gates on CMS
tsc + opennext build green + node tests + EN/FI/ET for new strings.

> REVISED 2026-07-02 (user directive — see GOAL.md): scope now also includes up to
> 2 retries, per-request cache config + per-request purge + GLOBAL cache purge, a
> CENTRALIZED request layer (one module, one management UI, appears beside
> collections in the picker), POST/PUT/DELETE (not only GET), and `{placeholder}`
> params filled from component props/inputs. Slices below carry (REVISED) notes;
> Slice 7 is new. Re-check DONE slices against the revised notes before building on
> them.

- DONE (2026-07-02): **Slice 1 — `data_source` schema + write-only encrypted secret.**
  Shipped WITH the revised saved-request notion as a separate `data_source_request`
  table (per-request method/path/query/body/cache/retryable) — see JOURNAL.
  Crypto = existing `lib/crypto/secret-box.ts` reused (no new helpers needed).
  Opennext build gate deferred (dev server was running) — next run verifies. Add a
  `data_source` table (per-Site D1): id, name, kind ("api"), baseUrl, method,
  defaultQuery (JSON), authType ("header"|"query"|"basic"|"none"), authParam
  (header name / query key / —), secretEnc (encrypted, NEVER returned), cacheTtlSec,
  createdAt. Drizzle migration. Pure crypto helpers (WebCrypto AES-GCM) encrypt/
  decrypt the secret with a key derived from a deploy secret — node-tested
  round-trip. `GET/POST/PATCH/DELETE /api/data-sources` (Admin-gated; GET never
  returns secretEnc — shows whether a secret is set). URL validation (http(s)
  absolute; block obvious internal hosts). NO fetch/render yet.
  (REVISED 2026-07-02) `method` covers GET|POST|PUT|DELETE; add a SAVED-REQUEST
  notion per source (path, query, optional JSON body template, method override,
  cache on/off + TTL per request) — either a `data_source_request` table or a
  requests JSON column; path/query/body may contain `{placeholder}` tokens.

- DONE (2026-07-02): **Slice 2 — fetch + map engine (server-side, cached, graceful).**
  Shipped as pure `lib/data-sources/fetch.ts` (buildRequest / fetchSource /
  buildCacheKey / createMemoryCache / getPath / mapResponse), 23 node tests —
  see JOURNAL. Opennext build gate deferred again (dev server live). A pure-ish
  `fetchSource(source, request)`: build the URL (baseUrl + path + merged query),
  apply auth (header/query/basic/none) with the DECRYPTED secret, fetch with a
  TIMEOUT, cache by (sourceId, request) for `cacheTtlSec` (KV or Cache API). Pure
  `mapResponse(json, fieldMap)` resolving dot-paths → props (array → list of
  prop-objects; object → one). Graceful: timeout/error/empty → null (caller renders
  placeholder). Node tests: URL+auth building per authType (mock fetch), map dot-
  paths, array vs object, failure → null. NO live API in tests. Secret stays
  server-side.
  (REVISED 2026-07-02) This IS the centralized request layer — ALL outbound API
  calls go through this one module. Add: up to 2 RETRIES (3 attempts) on network
  error/5xx/429 with small backoff, never on other 4xx, and only for GET /
  explicitly-marked-idempotent requests (no double-firing mutations); POST/PUT/
  DELETE support incl. JSON body (POST-to-query is render-legal); `{placeholder}`
  substitution into path/query/body from a params object, URL-encoded /
  JSON-escaped (component input is untrusted — never raw-splice); cache respects
  the per-request config (only cache GET / explicitly-cacheable), key = source +
  method + resolved URL/params/body hash. Node tests: retry counts per status,
  no-retry on POST, placeholder encoding, cache-key stability.

- DONE (2026-07-02): **Slice 3 — source-agnostic binding (generalize
  content-collections' BindingRef).** Shipped as `kind: "collection"|"api"` on
  `BindingRef.source` AND `ListSource` (+ sourceId/requestId/params/itemsPath);
  api items are flattened by their map dot-paths so the EXISTING pure
  hydrateProps/planList stamping consumes them unchanged. Pure glue in
  `lib/data-sources/bind.ts`, effects (store+decrypt+caches.default ApiCache) in
  `lib/data-sources/hydrate.ts`, wired into `hydrateBlockBindings`. Declared-prop
  allowlist enforced by the validators (authoring) + the pure walk (render).
  22 node tests; suite 1296/1296; tsc green. Opennext build gate deferred a 3rd
  time (dev server live on :3602) — see JOURNAL.

- DONE (2026-07-02): **Slice 4 — Data Sources admin UI + test call.** Shipped:
  /admin/data-sources (nav + page + DataSourcesManager), saved-request
  management incl. per-request cache config + retryable, write-only secret,
  in-app confirms, inline Test panel w/ per-placeholder inputs, test endpoint
  POST /api/data-sources/:id/requests/:requestId/test (cache bypassed, secret
  server-side). EN/FI/ET. Verified live against Open-Meteo — see JOURNAL.
  Original spec: CMS → Data Sources: list /
  add / edit / delete (in-app confirm) API sources — name, base URL, method,
  default query, auth type + secret (write-only `••••` field, replace-only),
  cache TTL. A "Test" button runs `fetchSource` and shows a sample response so the
  operator can see the shape to map. Admin-gated (cms-auth roles). Reuse design-
  system + purpose tokens. EN/FI/ET. Pure form validation tested. Gate.
  (REVISED 2026-07-02) This is the CENTRAL management UI: manage each source's
  saved requests too (method GET/POST/PUT/DELETE, path/query/body template with
  `{placeholders}`, per-request cache on/off + TTL). Test button works for all
  methods (test params for placeholders).

- DONE (2026-07-02): **Slice 5 — bind UI picks Collection OR API source.** Shipped:
  combined source picker (optgroups) in BOTH BindingPanel and ListSettings,
  saved-request select, `{placeholder}` param passing (literal | `{prop}` for
  single-item; literal-only for List), itemsPath, dot-path maps with
  sample-driven `<datalist>` suggestions (pure `samplePaths()`), "Load sample"
  via the Slice-4 test endpoint. EN/FI/ET. Verified live against Open-Meteo —
  see JOURNAL. Opennext build gate deferred (dev server on :3602, 5th time).
  Original spec: In the page-builder
  bind panel (content-collections Phase-2 UI), the source picker lists Collections
  AND API data sources. For an API source: choose the request (path/params) and map
  response fields (dot-path) → the component's declared props, with the Slice-4 test
  response as a guide. EN/FI/ET. Gate.
  (REVISED 2026-07-02) Also wire PARAM PASSING: for each `{placeholder}` in the
  chosen request, pick a component prop/input (or a literal) as its value; the bind
  stores that param map and Slice-3 hydration resolves it at render.

- DONE (2026-07-02): **Slice 6 — AI tools for data sources.** Shipped:
  list_data_sources / create_data_source / test_data_source (pure
  lib/chat/data-source-tools.ts + CF handlers in tool-dispatch.ts), and the
  EXISTING bind_component/create_list/bind_list generalized with
  source/request/params/itemsPath api args (shared validateBinding/
  validateListBinding, declared-prop allowlist). test_data_source returns
  `paths` (samplePaths over the full response) — the propose-map raw material.
  33 tool tests; suite 1328/1328; live-verified via /api/chat/debug. Opennext
  gate deferred (7th, dev server on :3602). Original spec: Tools so the assistant can:
  `create_data_source` (config + secret), `test_data_source` (fetch a sample so the
  AI can SEE the response shape), and propose/set a field map when binding (the AI
  reads the sample + the component's propsSchema → suggests `prop <- json.path`).
  Reuse the Slice-2/3 engine; register in the existing tool pipeline (shared
  dispatch). Validate against propsSchema. Node tests per tool (mock fetch/store).
  Gate.

- DONE (2026-07-02): **Slice 8 — OAuth2 client-credentials auth (deferred from v1).** Add
  `oauth2` to AUTH_TYPES: `authParam` holds the TOKEN URL (no migration; validated
  via validateBaseUrl incl. SSRF), secret = write-only `client_id:client_secret`
  (mirrors basic's `user:password`). Central fetch engine: token POST
  (grant_type=client_credentials, Basic client creds) with timeout, token cached
  via the injected ApiCache (TTL from expires_in − margin), `Bearer` injected
  server-side, ONE forced refresh + re-attempt on 401. UI: oauth2 option +
  token-URL label/placeholder + secret hint. AI create_data_source covers oauth2.
  EN/FI/ET. Node tests: token cached/refreshed, 401 refresh once, failure graceful.

- DONE (2026-07-02): **Slice 7 — cache purging (NEW 2026-07-02).** Shipped via
  VERSION COUNTERS (pure `lib/data-sources/purge.ts`, one `api_cache_versions`
  settings row; `cacheVersionFor()` → fetch engine's `deps.cacheVersion`).
  Endpoints: global `POST /api/data-sources/purge` + per-source/per-request
  `POST /api/data-sources/:id/purge` (`{requestId?}`). UI: per-request purge
  button + global purge w/ in-app confirm. EN/FI/ET. 6 node tests (scoped
  invalidation proven). See JOURNAL. Original spec: Per-request purge: a button on
  each saved request (Data Sources UI) + `POST /api/data-sources/:id/purge`
  (optionally scoped to one request) that evicts its cache entries. Global purge:
  "purge all API cache" action + endpoint. Requires the Slice-2 cache to key/
  namespace entries so both scopes are cheap to evict (e.g. per-source prefix or
  version counter — bumping the version beats enumerating KV keys). Admin-gated,
  in-app confirm for global. EN/FI/ET. Node tests: purge invalidates the right
  scope, untouched sources keep serving cached. Gate.

