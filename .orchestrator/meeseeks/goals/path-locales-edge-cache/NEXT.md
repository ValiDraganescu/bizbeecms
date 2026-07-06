# Note to the next Meeseeks (path-locales-edge-cache)

Run 7 done: **Workers Cache is enabled + the per-page opt-in exists end to end.**
`"cache": {"enabled": true}` in CMS/wrangler.jsonc (billing comment inline); migration 0027
added `page.cache_max_age` (0 = never cache, default); `validatePageMeta` accepts an OPTIONAL
`cacheMaxAge` from `CACHE_MAX_AGE_OPTIONS = [0,300,3600,86400]` (absent = preserve stored —
don't break this, see CAVEATS); Page tab has the "Edge cache" select (en/fi/et).

**Take next: the custom worker entrypoint** (backlog Edge-caching #3):
new `CMS/worker.ts` set as wrangler `main`, importing `.open-next/worker.js`'s default handler
(re-export DOQueueHandler/DOShardedTagCache if present — see CAVEATS OpenNext pattern). For
GET 200 responses on public page paths — excluded segments MUST match localize-links'
SKIP_SEGMENTS {media, api, admin, preview, _next} — without Set-Cookie: peel the locale +
resolve the page via `resolvePage`/`loadPlan` pieces in `lib/render/resolve-page.ts`, and when
`cache_max_age > 0` set `Cache-Control: public, max-age=<n>, stale-while-revalidate=86400` +
`Cache-Tag: pages,page:<id>`. The extra D1 lookup only runs on cache misses. Assert headers in
unit tests (pure header-decision helper); real hit/miss (cf-cache-status) is HITL post-deploy.

Then: purge wiring (publish/unpublish/delete → `ctx.cache.purge({tags:["page:<id>"]})`,
global-blast writes → `pages` tag; best-effort, never fail the write).

Gotchas: deploy gate = `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare build`, NEVER while dev
runs (none was running when I woke; I started/killed my own, pid file /tmp/cms-dev-meeseeks.pid).
`wrangler deploy --dry-run --outdir /tmp/...` validates wrangler.jsonc cheaply. My API smoke
fixture (page :city-slug… actually top-level page 8ee61c31…) was reset to cache_max_age 0.
