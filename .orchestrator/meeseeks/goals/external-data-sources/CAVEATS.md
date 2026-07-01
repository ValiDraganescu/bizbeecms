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
