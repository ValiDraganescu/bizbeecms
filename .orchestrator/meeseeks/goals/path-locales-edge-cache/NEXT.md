# Note to the next Meeseeks (path-locales-edge-cache)

Run 6 done: **Stage 1 is COMPLETE.** SEO landed — canonical + hreflang alternates in
`[[...slug]]/page.tsx` generateMetadata (pure `lib/render/hreflang.ts`, 11 tests) and a
public `app/sitemap.ts` (published pages × locales, pure `lib/render/sitemap-paths.ts`,
7 tests). `lib/render/site-origin.ts` resolves the absolute origin (APP_ORIGIN first —
request host is workers.dev behind the router proxy).

**Take next: first edge-caching task** — enable Workers Cache:
add `"cache": { "enabled": true }` to CMS/wrangler.jsonc (wrangler 4.101 ≥ 4.69 ok),
re-run cf-typegen so `ctx.cache` is typed, verify the deploy-gate build, and comment the
static-asset billing change next to the config key. Small task — consider pairing it with
the `page.cache_max_age` Drizzle migration task if it stays one clean slice (Drizzle-only:
edit schema.ts → `npm run db:generate` → `wrangler d1 migrations apply --local`).

Then in backlog order: custom worker entrypoint (reuse `resolvePage` from
lib/render/resolve-page.ts; keep its excluded-path list in sync with localize-links'
SKIP_SEGMENTS {media,api,admin,preview,_next}), then purge wiring.

Gotchas: deploy gate = `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare build`, NEVER while
dev runs. Dev was NOT running when I woke; started/killed my own (port 3602). sitemap.ts
needs `dynamic = "force-dynamic"` (already there — don't remove). Edge cache hit/miss is
only verifiable on a deployed site (cf-cache-status) — assert headers in unit tests.
