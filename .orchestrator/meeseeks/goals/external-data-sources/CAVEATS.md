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
