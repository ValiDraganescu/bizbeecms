# Goal: external-data-sources
> Decomposes [main goal](../main/GOAL.md). The root north star is the ultimate yardstick.

Let an operator (or the AI) define an **external API as a data source** (e.g. a
weather API) with configurable auth, then **bind components/lists to it just like a
collection** — the renderer fetches the API server-side at render and maps the
response into component props.

USER DIRECTIVE (2026-06-22): "An 'External data sources' option where I could define
an external API (e.g. a weather API) and configure the authentication method
(usually an API key in a header). I should be able to pick this API instead of
picking a collection and render the output — with mapping (the user checks the API
docs, or the AI assistant does it for them)."

USER DIRECTIVE (2026-07-02): revision pass — the goal must also cover:
- **Retries**: up to 2 retries per outbound request (so max 3 attempts).
- **Caching + purging**: caching is CONFIGURABLE PER REQUEST (TTL etc.), with
  per-request cache purge AND a global "purge all API cache" action.
- **Centralized API request management**: one central place where all external API
  requests/sources are defined and managed; it appears as a data source pickable
  BESIDES the collections (same picker).
- **All methods**: support POST, PUT, DELETE — not only GET.
- **Param passing**: pass params from a component / component input into an API
  data-source request (interpolated into path / query / body).

USER DIRECTIVE (2026-07-02, later in session): **Form block** — an implicit form
block (like the List block) that renders as a `<form>` bound to a data-source
saved request (POST/PUT/DELETE); any component with inputs can render inside it,
and the component's own submit button triggers the form. Submission is proxied
through a Worker endpoint into the central fetch engine (secret stays
server-side); form values fill the request's `{placeholder}`s. See BACKLOG for
the decomposed slice.

## The settled architecture (decided with user 2026-06-22)
- **A data source is the ABSTRACTION; binding is source-agnostic.** A `BindingRef`
  (from content-collections Phase-2 binding) names a SOURCE — `collection` OR
  `api` — plus a query/path + field→prop map. The same `List` block + single-item
  bind work against either. This goal adds the `api` source TYPE and makes the
  binding seam pick a source kind.
- **Fetch = SERVER-SIDE at render, CACHED** (USER DECISION). The Worker calls the
  API during render (in `buildPlanFromPage`, alongside collection queries), with a
  short-TTL cache (KV / Cache API). The API key stays server-side — NEVER shipped to
  the browser. Reuses the existing hydrate-before-walk seam (renderer stays pure).
- **Auth methods v1**: (a) API key in a HEADER (`Authorization: Bearer …` or a
  custom header name like `X-API-Key`), (b) API key in a QUERY PARAM (e.g.
  OpenWeatherMap `?appid=`), (c) BASIC auth, (d) NONE (public). DEFER OAuth2
  client-credentials (token fetch + refresh + cache — a real chunk; note it). These
  four cover essentially every weather/geo/content API.
- **Secrets = encrypted in the per-Site D1, WRITE-ONLY** (USER DECISION). A
  `data_source` table stores config + the secret (encrypted at rest); the secret is
  never returned to the client after save (shows `••••`). Self-service — adding a
  source needs NO redeploy.
- **Mapping**: response JSON → component props via a field-path map (e.g.
  `temp <- main.temp`). The operator reads the API docs; OR the AI assistant can
  fetch/inspect a sample response and propose the map (a tool).
- **Centralized request layer** (2026-07-02): ALL outbound API calls go through ONE
  module (e.g. `CMS/src/lib/data-sources/fetch.ts`) — auth injection, retries,
  caching, and purging live there, nowhere else. Sources + their saved requests are
  managed centrally (Data Sources UI) and surface in the SAME source picker as
  collections.
- **Retries** (2026-07-02): up to 2 retries (3 attempts total) on network error /
  5xx / 429, small backoff. NEVER retry on 4xx (other than 429). Retries only for
  idempotent-safe cases by default (GET / explicitly-marked requests) — a POST that
  creates things must not silently double-fire.
- **Caching + purge** (2026-07-02): cache config is PER REQUEST (enable/disable +
  TTL; sensible default e.g. 60s), stored on the saved request. Cache key =
  source + method + resolved URL/params/body hash. UI: purge button per request +
  global "purge all API cache". Only cache GETs (or requests explicitly marked
  cacheable).
- **HTTP methods** (2026-07-02): GET, POST, PUT, DELETE. Render-time BINDING
  defaults to GET, but POST-to-query APIs (GraphQL, search endpoints) are
  first-class: a bound request may be POST with a JSON body template. Mutating
  semantics (create/update/delete) are for explicit triggers (forms/actions), not
  render — but the central request layer supports all four uniformly.
- **Param passing** (2026-07-02): a saved request's path / query params / body may
  contain `{placeholders}` filled at bind time from component props / inputs (e.g.
  a `city` prop → `?q={city}`). Values are URL-encoded / JSON-escaped on insert —
  component input is untrusted; never string-splice it raw into a URL or body.

## What "good" looks like
- Operator: CMS → Data Sources → add an API source (name, base URL, method,
  default query params, auth type + secret, optional sample/test call). Test button
  shows a sample response so they can build the map.
- In the page-builder bind panel (content-collections Phase-2 UI), the source
  picker offers Collections AND API sources; picking an API lets them set the
  request (path/params) + map response fields → the component's declared props.
- A `List` bound to an API that returns an array stamps the item template per
  element; a single-item bind maps one object's fields.
- At render the Worker fetches (cached, ≤2 retries), maps, SSRs — key never
  exposed; failures degrade gracefully (empty/placeholder, never 500), mirroring
  collection binding.
- Each saved request has cache settings (on/off + TTL) and a purge button; Data
  Sources has a global "purge all API cache" action.
- A bound request can take params from the binding component's props/inputs via
  `{placeholder}` substitution, safely encoded.
- POST/PUT/DELETE requests can be defined and tested in the manager; POST-to-query
  works in render-time binds.
- The AI can create an API source + propose a field map from a sample response.
- Gate every slice: CMS `tsc` + `opennextjs-cloudflare build` green; regen PM
  `cms-bundle`; EN/FI/ET for new UI strings.

## Dependencies
- **content-collections Phase-2 binding** (`BindingRef`, `planList`,
  hydrate-before-walk). This goal GENERALIZES that seam to multiple source kinds —
  coordinate: the `BindingRef.source` gains a `kind: "collection" | "api"`. Ideally
  land after binding Slice A/B exist, or co-design the `BindingRef` shape so it's
  source-agnostic from the start.

## Reference (current state, verified 2026-06-22)
- NO external-fetch / data-source machinery exists today; the renderer only reads
  D1 (components/pages) + (planned) collections.
- Binding seam: content-collections `BACKLOG.md` Phase 2 — `BindingRef` on `Block`,
  `planList` (Section-style), hydrate-in-`buildPlanFromPage`-before-pure-walk.
- Render entry: `CMS/src/lib/render/render-page.tsx` `buildPlanFromPage` (async,
  fetches before the pure `planPage`). `tree.ts` is pure+sync.
- Secrets pattern to mirror/avoid: deploy-time secrets are env vars
  (`CMS_AUTH_SECRET` etc.); per-source secrets are NET-NEW (encrypted D1 column).
- NOTE (2026-06-22): the meeseeks goals tree now lives under
  `.orchestrator/meeseeks/goals/` (migrated from `.claude/skills/orc-meeseeks/goals/`).
