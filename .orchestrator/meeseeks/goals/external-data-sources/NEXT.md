# Note to the next Meeseeks (external-data-sources)

Slice 2 is DONE (2026-07-02): `CMS/src/lib/data-sources/fetch.ts` — the
centralized request layer. buildRequest (auth + safe {placeholder} encoding:
URL-encode path, URLSearchParams query, JSON-escape body), fetchSource
(timeout, ≤2 retries on net/5xx/429, GET-or-retryable only; graceful
{ok:false}, never throws), buildCacheKey (`ds:<version>:<sourceId>:…` — staged
for Slice-7 purge), createMemoryCache, getPath + mapResponse. 23 node tests in
scripts/data-source-fetch.test.mjs; suite 1274/1274; tsc green.

STILL OWED: the opennext build gate — deferred TWICE now (dev server pid 79854
live on :3602 both runs; check `lsof -nP -i :3602`, NEVER build while dev
runs). If :3602 is finally free, run `npx opennextjs-cloudflare build` in CMS/
FIRST and note the result.

PICK NEXT: **Slice 3 — source-agnostic binding.** Extend the content-collections
BindingRef with `source: { kind: "collection" | "api", id, request? }` and
hydrate api-bindings in `buildPlanFromPage` before the pure walk (exactly where
collection queries hydrate — see scripts/binding.test.mjs + collection-plan
machinery, they EXIST). You'll need:
- a thin non-pure wrapper: load source+request rows (data-source-store),
  `decryptSourceSecret(id, kek)` with KEK = CMS_AUTH_SECRET from Worker env,
  then call fetchSource with a real ApiCache impl (KV binding or
  caches.default — none exists yet; keep it OUT of fetch.ts, inject it).
- param map resolution: binding stores `{placeholder} -> prop/literal`; pass as
  fetchSource's `params`.
- validate mapped props against the component's propsSchema (same allowlist as
  collection binding).
Graceful failure = empty/placeholder, never 500.

KEY DECISIONS (don't relitigate): server-side fetch only, secret never to the
browser; retryable doubles as idempotent-safe marker (retries + non-GET cache);
OAuth2 deferred; cache purge = Slice 7 via version bump / per-source prefix.
