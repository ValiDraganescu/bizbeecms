# Caveats — external-data-sources
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- **Build on content-collections' binding seam — generalize it, don't fork it.** The
  `BindingRef` / `planList` / hydrate-before-walk machinery is the host. Add a
  `kind: "collection" | "api"` to the source so the SAME List block + single-item
  bind resolve from either. If binding isn't built yet, co-design the `BindingRef`
  shape to be source-agnostic from day one. Two parallel binding systems = drift.

- **Fetch SERVER-SIDE, key NEVER to the browser** (USER DECISION). The Worker calls
  the API during render (in `buildPlanFromPage`, alongside collection queries). Do
  NOT put the key or the raw fetch in the client `script` — that leaks the secret in
  the network tab. Map the response to props server-side; only mapped values reach
  the page.

- **Cache fetches (short TTL).** External APIs are slow + rate-limited; cache per
  (source, request) with a small TTL (KV or the Workers Cache API). A page with a
  weather widget shouldn't hit the API on every view. Make TTL configurable per
  source (default a few minutes).

- **Secrets: encrypted at rest in D1, WRITE-ONLY** (USER DECISION). `data_source`
  stores the secret encrypted (or via a secret store); the API never returns it
  after save (show `••••`, allow replace). Encrypt with a key from the deploy env
  (e.g. derive from `CMS_AUTH_SECRET` or a dedicated secret) — do NOT store
  plaintext. Confirm the encryption approach works on Workers (WebCrypto AES-GCM).

- **Auth methods v1 = header-key / query-key / basic / none. DEFER OAuth2.** All four
  v1 methods are "build a header or query param at request time" — trivial and
  cover weather/geo/content APIs. OAuth2 client-credentials (token fetch + cache +
  refresh) is a real chunk — note it as a later task, don't half-build it.

- **GRACEFUL on failure** (mirror collection binding): API down / timeout / bad
  mapping / empty array → render placeholder/empty, NEVER 500. Add a fetch timeout
  so a slow API can't hang the whole page render.

- **SSRF / safety on the base URL.** The user supplies the API URL. Validate it's an
  http(s) absolute URL; consider blocking obvious internal targets (localhost,
  169.254.x, .internal) since the Worker makes the request. Note the boundary even
  if light in v1.

- **Mapping is field-path → prop, validated against the component's propsSchema.**
  Same allowlist discipline as collection binding: mapped target props must be
  DECLARED on the component; source paths are dot-paths into the JSON response.

- **The goals tree lives under `.orchestrator/meeseeks/goals/`** now (migrated from
  `.claude/skills/orc-meeseeks/goals/` on 2026-06-22) — read/write goal files there.

- **Gate:** CMS `tsc` + `npx opennextjs-cloudflare build` green (NEVER while
  `npm run dev` runs). Regen PM `cms-bundle`. EN/FI/ET for new UI strings. No native
  confirm()/alert() — in-app modal for delete-source.

- **Secret crypto EXISTS — reuse `CMS/src/lib/crypto/secret-box.ts`** (AES-GCM,
  KEK = `CMS_AUTH_SECRET`, round-trip already tested via google-client.test.mjs).
  Do NOT write new encrypt/decrypt helpers; follow the google-client-store /
  settings/google route pattern (route reads the KEK from the Worker env).

- **The "regen PM cms-bundle" gate line is STALE** — `cms-bundle.generated.js` no
  longer exists; Site deploys build the release tag fresh in a container (see
  MEMORY `cms-deploy-builds-from-git-tag`). Skip that step.

- **A dev server may be live on :3602 (CMS) — check `lsof -nP -i :3602` BEFORE the
  opennext build gate.** It may belong to the user or a CONCURRENT Meeseeks; don't
  kill it. If it's running, defer the build gate, note it, and let a later run
  verify (tsc + node tests still gate).

- **Don't brace-check JSON body templates.** `hasValidPlaceholderSyntax` is for
  path/query values only — a JSON `bodyTemplate`'s structural `{}` are legal; the
  Slice-2 engine substitutes only well-formed `{name}` tokens and JSON-escapes.

- **Migrations: drizzle-kit ONLY** (CMS/CLAUDE.md): edit schema.ts →
  `npm run db:generate` → `wrangler d1 migrations apply bizbeecms-cms --local`.
  Never hand-write SQL or raw ALTER TABLE.

- **`retryable` doubles as the "idempotent-safe" marker** in the Slice-2 engine:
  it gates BOTH retries AND cacheability for non-GET (cacheable = cacheEnabled
  && (GET || retryable)). Slice-4 UI should label it "safe to retry/cache
  (idempotent)" — don't split it into two flags without a user directive.

- **Api rows are FLATTENED by dot-path** (Slice 3): `flattenByPaths` keys each
  row by the exact `map`/`listMap` VALUES ("main.temp"), so pure
  `hydrateProps`/`stampRow` work unchanged. Slice-5 UI must store api map values
  as dot-paths; combobox `valueField`/`labelField` on an api List are dot-paths
  too. Do NOT switch to nested rows — that forks the stamping machinery.

- **The ApiCache impl lives in `hydrate.ts`, NOT fetch.ts**: `caches.default`
  keyed by a synthetic `https://bizbee-api-cache.internal/<key>` URL, TTL via
  Cache-Control; `next dev` (no caches global) falls back to a module-level
  memory cache. Slice-7 purge: the Cache-API impl has no enumerate/delete-all —
  purge MUST go through the fetch engine's `cacheVersion` (persist a version
  counter, e.g. in the settings store, and pass it as `deps.cacheVersion`).

- **api-kind validators check only ids + declared props** — response dot-paths
  can't be validated without a sample response (that's the Slice-4 Test button's
  job). Don't add speculative path validation.

- **The fetch engine is PURE — callers own the effects.** `fetchSource` takes a
  decrypted secret on `source.secret` (use `decryptSourceSecret` + KEK from
  Worker env) and an injected `ApiCache`. No Workers cache impl exists yet;
  Slice 3 must build one (KV binding or `caches.default`) — don't add CF
  bindings INTO fetch.ts, it would break the node tests.

- **Local dev auto-auths as SuperAdmin**: `.env.local` sets `CMS_DEV_SUPERADMIN=1`,
  so curl against :3602 passes `requireAdmin` without a cookie — great for live
  API smoke tests; prod builds fail-safe (build-failsafe.ts). Don't mistake a
  local 200 for "auth is broken".

- **next-intl ICU: literal `{braces}` in message strings are ICU arguments** and
  crash at format time if unfilled. Write brace-free help copy; show
  `{placeholder}` syntax via input `placeholder=` attrs (not translated) or
  interpolate them as values, as data-sources-manager does.

- **`npx eslint <file>` fails (eslint v9 flat-config migration)** — `next lint`
  owns linting here; don't chase the eslint config, gate with tsc + node tests.

- **The Test endpoint must BYPASS the cache** (`cacheEnabled:false` + `cache:null`):
  a test shows the live response and must not pollute the render cache. Keep it
  that way when touching the route.

- **ListSettings `emitSource` is KIND-AWARE** (Slice 5): collection lists persist
  NO `kind` field (legacy stored lists stay byte-identical); only api sources
  carry `kind:"api"` + sourceId/requestId/params/itemsPath. Don't start writing
  `kind:"collection"` into stored sources — it would dirty every legacy page diff.

- **List api params are LITERAL-ONLY in the UI** (`propNames={[]}`) because the
  built-in List block declares no props — but Slice-3 hydration DOES resolve
  `{prop}` specs from `block.props` for lists too; if Lists ever get prop inputs,
  just pass real propNames to `ApiParamsEditor`.

- ~~The combobox config section in binding-panels.tsx is hardcoded English~~
  FIXED 2026-07-02: now `pageBuilder.list.presentation*` / `list.cb*` keys
  (EN/FI/ET). The `${name} · ★ ${rating}` labelExpr syntax example deliberately
  stays as an untranslated `placeholder=` attr (ICU-brace caveat).

- **Purge = version-counter bump, ONE settings row** (`api_cache_versions`,
  Slice 7): `cacheVersionFor(versions, sourceId, requestId)` composes
  `global.source.request` into `deps.cacheVersion`; hydrate.ts reads the row
  per api fetch (one extra D1 read — fine). Never try to delete Cache-API
  entries directly. The static `/api/data-sources/purge` segment can't collide
  with `[id]` (source ids are UUIDs). Counters for deleted sources/requests
  linger in the row — harmless tiny ints.

- **AI binding tools resolve source/request by ID OR NAME** (Slice 6,
  `resolveSourceAndRequest` in tool-dispatch.ts) but PERSIST only ids into the
  BindingRef/ListSource. Don't store names — renames would break bindings.

- **bind_list kind-switching is destructure-based** (Slice 6): switching to api
  drops `collection/filter/sort`; switching to collection drops
  `kind/sourceId/requestId/params/itemsPath`; presentation + combobox config
  always survive. Keep it symmetrical if you add ListSource fields.

- **`asRecord` in the pure chat tool modules must reject ARRAYS** — `typeof []
  === "object"`; an array `params` would silently validate as an empty object.
  data-source-tools.ts has the Array.isArray guard; binding-tools' shapeMap is
  saved by its own value checks.

- **New chat tools need THREE registrations**: KNOWN_TOOL_NAMES (tool-scopes),
  TOOL_BY_NAME + HANDLERS (tool-dispatch) — tsc's Record<ToolName,…> catches a
  miss. Context scoping (TOOLS_BY_CONTEXT) + context prompt are separate,
  easy-to-forget steps; "general" gets everything automatically.

- **oauth2 rides its TOKEN URL in `authParam`** (Slice 8, no schema change) and
  its secret is `client_id:client_secret` (like basic's `user:password`). If you
  ever move the token URL to its own column, migrate validate.ts + fetch.ts +
  the SourceForm + the AI tool docs together.

- **The oauth2 token cache key (`ds-oauth2-token:<sourceId>`) is UNVERSIONED
  on purpose** — purge targets the RESPONSE cache; a stale/revoked token
  self-heals via the one forced 401 refresh. Don't wire cacheVersion into it
  (per-request versions would mint one token per request key).

- **Keep the oauth2 401 check BEFORE the generic `!res.ok` 4xx return in
  fetchSource** — it refreshes once (`refreshedAuth` flag) and re-fires via
  `attempt -= 1` so the auth retry never eats the normal retry budget and works
  even when maxAttempts is 1 (non-idempotent POST).

- **Counter pruning resets a scope's version to 0 — safe ONLY because ids are
  UUIDs and never reused.** `pruneCounters` returns the SAME object when
  nothing matched (callers use `pruned !== versions` to skip the D1 write);
  `pruneApiCacheVersions` deliberately swallows errors — don't "fix" that, a
  completed delete must never 500 over counter housekeeping. Source delete
  must read its request ids BEFORE deleting (FK cascade wipes them).

- **Page mutations land in the DRAFT `page_version` row, NOT `page.blocks`** —
  the two trees can differ completely (about's blocks column has sections the
  draft doesn't). When live-verifying/cleaning up an AI bind, read/patch the row
  `page_version WHERE id = page.draft_version_id`; checking `page.blocks` will
  say "nothing happened".

- **Top-level `name` in a handler payload is RESERVED for the tool name.**
  makeDispatcher now sets `name` LAST (`{ ...payload, name }`, fixed 2026-07-02)
  so a payload `name` is silently OVERWRITTEN — your domain name would be lost,
  not leaked. Nest it (`source:`) or rename it (`collectionName`).

- **A hand-built api List draft is valid & renders**: `List` block with
  `listSource:{kind:"api",sourceId,requestId}` + `listMap:{prop:"dot.path"}` +
  ONE child `{component:<Template>, listRole:"template"}` inside a Section's
  `__section_column__`; PUT /api/pages/:id/draft accepts it, publish + public
  route SSRs the stamped rows. Cheapest way to smoke the renderer without the
  AI or the builder UI (verified 2026-07-02).

- **ConfirmModal autofocuses its CANCEL button** (a11y fix 2026-07-02) — the Esc
  handler lives on the overlay div and only fires when focus is inside it. If you
  ever pass `children` with their own autoFocus input, the LAST autoFocus in tree
  order wins (the cancel button) — make autoFocus conditional (`!children`) then.

- **Per-row action buttons carry `aria-label={action} — {name}`** via plain string
  concat — do NOT convert these to i18n message templates with braces (ICU crash
  caveat); concat is the deliberate pattern here.

- **binding-panels.tsx has NO expand/collapse toggles** — don't hunt for
  aria-expanded targets there (NEXT notes guessed wrong once). Its a11y pass
  (2026-07-02) = live regions on SampleLoader + row-scoped concat labels in
  QueryBuilder. Row-scoped labels reuse existing i18n keys via concat — no
  new message strings needed.

- **The opennext gate CAN run while dev owns :3602 — use an isolated worktree**:
  `git worktree add --detach /tmp/cms-gate-worktree HEAD` → `npm ci` in its
  CMS/ → `npx opennextjs-cloudflare build` → `git worktree remove --force`.
  Own `.next`/node_modules, zero contact with the live dev server (verified
  2026-07-02, gate GREEN on 38f8b4d). Never build in the repo while dev runs;
  never kill pid on :3602 — worktree instead. Note: it builds committed HEAD,
  so commit first if you want YOUR changes gated — OR `cp` your uncommitted
  changed files into the worktree after `worktree add` (verified 2026-07-02):
  gate covers pre-commit changes, journal stays truthful.

- **fetchSource follows redirects MANUALLY — never re-enable `redirect:"follow"`.**
  Default follow would bypass the save-time SSRF check (upstream 302s to
  169.254.x/.internal) and ship auth headers (X-API-Key/Basic/Bearer) to any
  host the upstream names. Only same-host hops are followed (same origin or
  http→https upgrade, max 3); cross-origin → graceful `{ok:false}`, never
  retried. The oauth2 token fetch never follows at all. If a real API ever
  legitimately redirects cross-origin, the fix is updating the source baseUrl,
  not loosening the redirect policy.

- **fetchSource caps upstream bodies at MAX_RESPONSE_BYTES (5 MB) via
  `readBodyCapped` — STREAMING, byte-counted, reader-cancelling** (fixed
  2026-07-02: the old buffered `res.text()`+length check let a chunked body
  fully buffer before rejection). Applies to the main fetch AND the oauth2
  token fetch. Too-large → `{ok:false}`, never retried, never cached. Never
  replace it with `res.text()`/`res.json()` — that reintroduces the unbounded
  buffer. The no-`res.body` fallback (text()+UTF-16 length) exists only for
  bodyless mocks; real runtimes take the streaming path.

- **Redirect/size-cap failure copy is DELIBERATELY not in i18n** — the Test panel
  surfaces the fetch engine's English error strings ("upstream redirected to a
  different host", "upstream response too large") verbatim. Audited 2026-07-02:
  no UI copy contradicts shipped behavior. Don't add speculative i18n messages
  for engine errors; if localization is ever demanded, map error strings to keys
  at the Test route, not inside fetch.ts (keep the engine pure).

- **Query auth is re-applied on every same-host redirect hop** (fixed 2026-07-02):
  the redirect loop re-sets `authParam=secret` on the hop URL after
  `resolveSafeRedirect` approves it — Location rarely carries the auth query
  param. Don't "simplify" the loop to `currentUrl = next.value` for query-auth
  sources, and never re-apply before the same-host check (that would leak the
  secret cross-origin).

- **Making a page publicly reachable is TWO steps**: `POST /api/pages/:id/publish`
  snapshots the draft version, but the public `[[...slug]]` route ALSO gates on
  `page.publishStatus === "published"` — flip it via `PUT /api/pages` with
  `publishStatus:"published"` or the page 404s despite a published version.

- **httpbingo echoes query params and headers as ARRAYS** — bind dot-paths with a
  trailing index: `args.foo.0`, `headers.X-Api-Key.0`. Parsed JSON bodies echo
  under `json.*` (no array wrap).

- **Form block security model: the client only ever names PAGE + BLOCK ids**
  (hidden `__bb_page`/`__bb_block` inputs); `/api/forms/submit` re-reads
  `formTarget` from the PUBLISHED page's blocks server-side. Never accept a
  sourceId/requestId/collection from the request body — that would let a
  visitor fire arbitrary saved requests / write arbitrary collections.

- **Form submissions force `retryable:false` + `cache:null` at the submit
  endpoint** even if the operator marked the saved request retryable — a
  visitor submission must fire exactly once and never touch the render cache.
  The retryable flag's meaning is for RENDER binds only; don't "unify" them.

- **Form rate limit rides the `login_attempt` table** (kind `"form"`, key
  `form:<ip>`): the pure window (10 min, 20/IP, submit-core.ts) must stay ⊂
  the store's 15-min `windowStart` filter/prune or counts silently truncate.
  Note dev smoke: local IP is "unknown" — 20 rapid curl submits WILL lock you
  out for 10 min; space out live tests.

- **`collection.publicSubmissions` (opt-in flag, default OFF) gates the Form
  collection target**; toggle via `PATCH /api/collections/:name` with
  `{"_op":"set_public_submissions","enabled":true}`. Submitted items are
  FORCED `status:"draft"` and slug/system/unknown fields are dropped in the
  pure `collectionBodyFromFields` — keep that allowlist there, not in the route.

- **planForm degrades to a plain `<div data-form>` when `formTarget.kind` or
  `formPageId` is missing** — `formPageId` is stamped by `stampFormPageId` in
  buildPlanFromPage (renderer-set, like listRows). The Develop single-component
  preview never stamps it, so Forms there render as containers by design.

- **The httpbingo living fixture lives in the LOCAL D1 only** (.wrangler/state,
  gitignored): page `api-fixture-httpbingo`, component `ApiProbe`, 5 sources
  "httpbingo fixture — …" + 12 requests. A DB reset wipes it — rebuild from the
  recipe/ids in JOURNAL 2026-07-02 09:36. Don't delete it during cleanup passes;
  it's a deliberate permanent fixture (per user).
