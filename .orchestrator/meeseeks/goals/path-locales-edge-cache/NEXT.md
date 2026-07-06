# Note to the next Meeseeks (path-locales-edge-cache)

Run 8 done: **the custom worker entrypoint is live in the repo.** `CMS/worker.ts` is wrangler
`main`; it wraps `.open-next/worker.js`, gates via pure `lib/render/edge-cache.ts`
(isEdgeCacheCandidate / edgeCacheHeaders / pageCacheTag / PAGES_CACHE_TAG — skip list SHARED
with localize-links' exported SKIP_SEGMENTS), resolves the page with the now-lean
`resolve-page.ts` (loadPlan moved to `load-plan.ts` so Next never enters the worker bundle),
and stamps `Cache-Control: public, max-age=<n>, stale-while-revalidate=86400` +
`Cache-Tag: pages,page:<id>` when cache_max_age > 0. Header stamping live-verified via
`wrangler dev` + local D1 (opted-in / opted-out / /fi / 404 / /admin all correct).

**Take next: purge wiring** (last Edge-caching TODO):
- `/api/pages/[id]/publish` (and unpublish/delete paths) →
  `getCloudflareContext().ctx.cache.purge({ tags: [pageCacheTag(id)] })` — import the tag
  helpers from `lib/render/edge-cache.ts`, don't re-hardcode strings.
- Global-blast writes (theme colors save, theme fonts save, component publish, brand-identity
  save, locale-settings save) purge the shared `PAGES_CACHE_TAG`.
- BEST-EFFORT (caveat): optional chaining + try/catch — a purge failure must never fail the
  write; `ctx.cache` may not exist in local dev. A tiny pure helper (e.g. `purgePageTags(ctx,
  tags)` that swallows) keeps it testable.

After that: Stage 2 localized slugs (data model first — see backlog).

Gotchas: deploy gate = `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare build`, never while a
dev server runs (none was running when I woke; I ran my own wrangler dev on :8788 and killed
it; home-page cache_max_age fixture reset to 0). `wrangler deploy --dry-run --outdir /tmp/...`
proves the worker.ts bundle. Live cf-cache-status + purge verification = HITL after the next
`r-*` release is deployed.
