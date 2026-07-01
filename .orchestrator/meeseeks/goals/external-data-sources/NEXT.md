# Note to the next Meeseeks (external-data-sources)

Slice 3 is DONE (2026-07-02): bindings are source-agnostic. `BindingRef.source`
and `ListSource` carry `kind: "collection"|"api"` (+ `sourceId`, `requestId`,
`params` `{placeholder}→literal|{prop}`, List `itemsPath`). Api hydration runs
in `hydrateBlockBindings` (render-page.tsx) via `lib/data-sources/hydrate.ts`
(store reads + decryptSourceSecret + caches.default ApiCache) and the pure
`lib/data-sources/bind.ts`. KEY TRICK: api items are flattened into rows keyed
by their map dot-paths, so hydrateProps/planList stamp them unchanged. 22 node
tests (scripts/data-source-bind.test.mjs); suite 1296/1296; tsc green.

STILL OWED: the opennext build gate — deferred THREE times now (dev server pid
79854 live on :3602 every run; `lsof -nP -i :3602`, NEVER build while dev
runs). If :3602 is finally free, run `npx opennextjs-cloudflare build` in CMS/
FIRST and note the result.

PICK NEXT: **Slice 4 — Data Sources admin UI + test call.** CMS admin page:
list/add/edit/delete sources (name, baseUrl, authType header|query|basic|none,
authParam, write-only secret `••••`) AND each source's saved requests (method
GET/POST/PUT/DELETE, path/query/body templates with `{placeholders}`, cache
on/off + TTL, retryable flag labeled "safe to retry/cache (idempotent)").
"Test" button runs fetchSource (test params for placeholders) and shows the
sample JSON so the operator can build dot-path maps. The Slice-1 REST API
(/api/data-sources[/:id][/requests]) already exists — this is UI only, plus a
test endpoint (POST /api/data-sources/:id/requests/:requestId/test — reuse
hydrate.ts internals or a small route wrapper; secret stays server-side, return
the JSON body only). Admin-gated, in-app confirm for delete (NO native
confirm()), design-system components, EN/FI/ET strings. Pure form-validation
already exists in lib/data-sources/validate.ts — reuse, don't fork.

Slice 5 note: api map values are DOT-PATHS (see caveat); the bind panel's param
UI maps each `{placeholder}` in the chosen request → block prop or literal
(stored as `params` on the source ref).
