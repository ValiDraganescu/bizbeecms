# Backlog — external-data-sources
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
Build order: source schema + encrypted secret first, then the fetch+map engine,
then the source-agnostic binding, then UI, then AI tools. Each slice gates on CMS
tsc + opennext build green + node tests + EN/FI/ET for new strings.

- TODO: **Slice 1 — `data_source` schema + write-only encrypted secret.** Add a
  `data_source` table (per-Site D1): id, name, kind ("api"), baseUrl, method,
  defaultQuery (JSON), authType ("header"|"query"|"basic"|"none"), authParam
  (header name / query key / —), secretEnc (encrypted, NEVER returned), cacheTtlSec,
  createdAt. Drizzle migration. Pure crypto helpers (WebCrypto AES-GCM) encrypt/
  decrypt the secret with a key derived from a deploy secret — node-tested
  round-trip. `GET/POST/PATCH/DELETE /api/data-sources` (Admin-gated; GET never
  returns secretEnc — shows whether a secret is set). URL validation (http(s)
  absolute; block obvious internal hosts). NO fetch/render yet.

- TODO: **Slice 2 — fetch + map engine (server-side, cached, graceful).** A pure-ish
  `fetchSource(source, request)`: build the URL (baseUrl + path + merged query),
  apply auth (header/query/basic/none) with the DECRYPTED secret, fetch with a
  TIMEOUT, cache by (sourceId, request) for `cacheTtlSec` (KV or Cache API). Pure
  `mapResponse(json, fieldMap)` resolving dot-paths → props (array → list of
  prop-objects; object → one). Graceful: timeout/error/empty → null (caller renders
  placeholder). Node tests: URL+auth building per authType (mock fetch), map dot-
  paths, array vs object, failure → null. NO live API in tests. Secret stays
  server-side.

- TODO: **Slice 3 — source-agnostic binding (generalize content-collections'
  BindingRef).** Extend `BindingRef` with `source: { kind: "collection" | "api", id,
  request? }`. In `buildPlanFromPage`, when a binding's source.kind === "api", call
  `fetchSource` + `mapResponse` (Slice 2) to hydrate props BEFORE the pure walk —
  exactly where collection queries hydrate. `planList` stamps per array element for
  an api source too. Validate mapped props against the component's propsSchema (same
  allowlist). Pure tests: api-source binding hydrates props; array → N stamped
  items; failure → graceful empty. (DEPENDS on content-collections Phase-2 binding
  Slice A/B — if not landed, co-design the BindingRef shape and note it.) Gate.

- TODO: **Slice 4 — Data Sources admin UI + test call.** CMS → Data Sources: list /
  add / edit / delete (in-app confirm) API sources — name, base URL, method,
  default query, auth type + secret (write-only `••••` field, replace-only),
  cache TTL. A "Test" button runs `fetchSource` and shows a sample response so the
  operator can see the shape to map. Admin-gated (cms-auth roles). Reuse design-
  system + purpose tokens. EN/FI/ET. Pure form validation tested. Gate.

- TODO: **Slice 5 — bind UI picks Collection OR API source.** In the page-builder
  bind panel (content-collections Phase-2 UI), the source picker lists Collections
  AND API data sources. For an API source: choose the request (path/params) and map
  response fields (dot-path) → the component's declared props, with the Slice-4 test
  response as a guide. EN/FI/ET. Gate.

- TODO: **Slice 6 — AI tools for data sources.** Tools so the assistant can:
  `create_data_source` (config + secret), `test_data_source` (fetch a sample so the
  AI can SEE the response shape), and propose/set a field map when binding (the AI
  reads the sample + the component's propsSchema → suggests `prop <- json.path`).
  Reuse the Slice-2/3 engine; register in the existing tool pipeline (shared
  dispatch). Validate against propsSchema. Node tests per tool (mock fetch/store).
  Gate.

- TODO (later) — **OAuth2 client-credentials auth.** Token fetch from a token URL +
  cache + refresh, as a 5th authType. Deferred from v1's header/query/basic/none.
