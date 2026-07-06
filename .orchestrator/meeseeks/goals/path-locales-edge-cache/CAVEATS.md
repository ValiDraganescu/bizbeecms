# Caveats — path-locales-edge-cache
Read every line before working. Each entry was learned the hard way by a previous Meeseeks
(the first batch was established during the 2026-07-07 design conversation).

- The old "path-prefix routing can't deploy to Workers" memory is about **next-intl middleware
  routing in the admin UI** (PM, Next 16). It does NOT apply here: published pages go through our
  own `[[...slug]]` catch-all + `resolvePage` walk. Do NOT reach for next-intl routing for public
  pages — peel the locale segment ourselves.
- **Never add a cookie-based redirect on unprefixed URLs** (e.g. honoring an old `bb_content_locale`
  to bounce `/about` → `/fi/meista`). A cookie-dependent response makes default-locale URLs
  uncacheable — the exact thing this goal exists to gain.
- RSC pages **cannot set response headers**, and Next stamps dynamic pages `no-store`. Cache-Control
  and Cache-Tag must be set in the custom worker entrypoint wrapping `.open-next/worker.js`
  (documented OpenNext pattern: `import { default as handler } from "./.open-next/worker.js"`,
  wrangler `main` → the custom file, re-export DOQueueHandler/DOShardedTagCache if present).
- Workers Cache facts (verified against CF docs 2026-07-07): only GET/HEAD cached; requests with
  `Authorization` and responses with `Set-Cookie` bypass automatically; `Vary: *` disables caching;
  variants purge together; tags ≤1024 ASCII chars, ≤1000 per response, case-insensitive at purge;
  needs wrangler ≥ 4.69.0 (repo has 4.101.0).
- Enabling `"cache"` changes billing: **static-asset requests start billing at standard request
  rate** (they're free today). Small at our traffic, but flag it in the wrangler.jsonc comment.
- The edge cache is **only verifiable on a deployed site** (check `cf-cache-status`). `next dev`
  never runs the custom worker; local `wrangler dev`/preview doesn't enforce the real edge cache.
  Assert headers in unit tests; hit/miss behavior is a HITL check after deploy.
- Link props (`type:"link"`) are single strings and **deliberately not translatable** (see
  `lib/pages/page-blocks.ts` isLinkProp). Localized-slug internal links are solved by render-time
  reverse-resolution in the plan walk — do NOT try to make link props per-locale maps.
- `bb_content_locale` has consumers beyond render-page (`plan-language-switcher.ts` exports
  CONTENT_LOCALE_COOKIE; grep before removing). The switcher script currently cookie+reloads —
  Stage 1 replaces it with navigation.
- Wildcard `:param` slugs and query-param-driven pages must keep working: locale peel happens BEFORE
  the tree walk; wildcards are locale-agnostic; the cache key includes the query string by default.
- Purge calls are best-effort: never fail a publish/save because `ctx.cache.purge` threw (e.g. in
  local dev where it may not exist). Guard with optional chaining + try/catch.
- Never run `npx opennextjs-cloudflare build` while `npm run dev` is running (corrupts .next).
- Project conventions apply: pure helpers dep-free for `node --test`, every UI string in
  messages/{en,fi,et}.json, Drizzle-only migrations, REST route handlers only (no server actions).
- Since locale-prefix routing landed, the built-in LanguageSwitcher is DELIBERATELY inert on
  published pages (cookie+reload no longer changes the render — the URL wins). Do NOT "fix" it
  by re-adding cookie reads to the public path; the fix is the switcher-navigation backlog task.
  Preview/Develop still use the cookie path (`resolveContentLocaleContext` without explicitLocale).
- CMS `.env.local` carries `CMS_DEV_SUPERADMIN=1`; the auth build-failsafe throws in any
  production build. Run the deploy gate as `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare build`
  (real env vars override `.env.local`). The deployer builds from a clean git checkout, so prod
  is unaffected.
- CONTENT_LOCALE_COOKIE stays (decision 2026-07-07): the /preview/ iframe has no locale-prefixed
  routes, so the switcher script cookie+reloads THERE ONLY; published paths navigate. Don't delete
  the cookie constant or the cookie branch in resolveContentLocaleContext.
- LANGUAGE_SWITCHER_SCRIPT embeds `switchLocalePathname` via `.toString()` — keep that function
  fully self-contained (no imports/outer-scope refs, browser-safe syntax only); a test asserts the
  interpolation, and changing it means the client + unit tests share one source.
- If Stage-2 localized slugs land, `switchLocalePathname` (prefix-only rewrite) becomes wrong —
  the switcher must then emit per-locale FULL paths computed at plan time (see backlog Stage 2).
- Localized SERVER errors pattern: API routes return English `error` + a stable `code` field
  (e.g. `slugIsLocaleCode`, `localeIsPageSlug`); the admin client maps known codes to t() keys.
  Don't try to run next-intl inside route handlers. Page saves have THREE paths — /api/pages,
  the AI create_page tool, and (slug-immutable) SEO/publish bodies — guard the first two.
- The slug-vs-locale guard (`localeSlugConflicts`) deliberately includes the DEFAULT locale and
  only top-level slugs; child pages may legitimately be named "fi". Stage-2 localized slugs must
  apply the same guard to top-level `localized_slugs` values.
- Href locale-prefixing is a POST-pass over the finished ElementPlan (last step of `planPage`),
  NOT done during slot binding — that's what makes it cover static tree hrefs + hydrated values.
  Don't add a second prefixing site upstream or links double-prefix (the guard would eat it, but
  still). It also runs on preview/Develop renders (cookie locale) — intended, true-to-site.
- localize-links' skip set is SEGMENT-exact {media, api, admin, preview, _next} — keep it in
  sync with the future edge-cache worker's excluded path list (backlog custom-entrypoint task).
- Root links rewrite "/" → "/fi" WITHOUT trailing slash — "/fi/" triggers Next's 308
  trailing-slash redirect (observed live). Same for "/?q" → "/fi?q".
- Stage-2 localized slugs make prefix-only href rewriting insufficient (same as the switcher):
  localizeHref must then reverse-resolve the default-locale slug chain to the active locale's.
- `app/sitemap.ts` MUST export `dynamic = "force-dynamic"` — without it `next build` prerenders
  /sitemap.xml at build time and hits D1 (no CF context) → build breaks.
- Never build SEO/absolute URLs from the request `host`: the router proxies custom domains to the
  internal workers.dev origin, so `host` is workers.dev on proxied requests. Use
  `resolveSiteOrigin()` (lib/render/site-origin.ts) — APP_ORIGIN first, host only as dev fallback,
  null when unknown (sitemap then returns [] rather than wrong hosts).
- Stage-2 must also update `hreflang.ts` (`pathForLocale`) + `app/sitemap.ts` — like the switcher
  and localize-links, they are prefix-only rewrites of the SAME slug chain today.
- Next serializes `alternates.languages` in sitemap entries as `xhtml:link` (works on Next 16.2);
  root canonical renders without the trailing slash ("https://x.tld") — equivalent, don't "fix".
- `cacheMaxAge` is OPTIONAL in PageMetaInput: **absent = preserve the stored value**. The SEO form
  and publish toggle PUT full-meta bodies that deliberately omit it — do NOT default it to 0 in
  validatePageMeta or every SEO save silently resets a page's cache opt-in. Allowed values live in
  `CACHE_MAX_AGE_OPTIONS` (page-meta.ts) — single source for the UI select AND validation.
- wrangler's `"cache"` key adds NO Env binding — cf-typegen output is unchanged; `ctx.cache` hangs
  off the execution context (getCloudflareContext().ctx), not env. Don't hunt for a missing binding.
- The AI create_page tool / `upsertPage` (page-store) don't set cacheMaxAge — column default 0
  applies (AI-created pages start uncached). Intentional; revisit only if the user asks.
- `CMS/worker.ts` must NEVER (transitively) import React/next-intl/`next/headers` — that's why
  `resolvePage` (lean, drizzle+slug only) and `loadPlan` (full render stack) live in separate
  modules (resolve-page.ts vs load-plan.ts). Adding a Next-coupled import to resolve-page.ts or
  its deps breaks the custom worker bundle.
- Use `@ts-ignore` (NOT `@ts-expect-error`) on the `./.open-next/worker.js` imports in worker.ts:
  the module resolves after a build (expect-error → "unused directive" tsc failure) but is absent
  on a clean checkout (no directive → cannot-find-module). @ts-ignore covers both states.
- `.open-next/worker.js` DOES export DOQueueHandler/DOShardedTagCache/BucketCachePurge even with
  the all-dummy open-next.config.ts — worker.ts must re-export all three or `wrangler deploy`
  fails resolving the DO class bindings.
- Header STAMPING is verifiable locally via `npx wrangler dev` (it runs the custom entrypoint +
  local D1) — only the real hit/miss/purge behavior (cf-cache-status) needs a deployed site.
- Live sites get worker.ts only via a new `r-*` release + redeploy (the deployer builds from the
  release tag) — merely landing on main changes nothing deployed.
- Purge wiring is DELIBERATELY partial: page CREATE and version RESTORE don't purge (nothing
  cached yet / restore only makes a draft), and page-meta PUT purges only `page:<id>` (a slug
  change is covered — the tag is by id, not URL). `purgeEdgeTags` (lib/render/purge-edge.ts)
  is the ONLY CF-coupled purge call site; the pure best-effort logic is `purgeCacheTags` in
  edge-cache.ts. Don't add a second getCloudflareContext purge path.
- `localizedSlugs` follows the cacheMaxAge contract: ABSENT in the PUT body = preserve the
  stored map; PRESENT-but-{} = clear all overrides. buildLocalizedSlugsBody always sends the
  cleaned map; publish/SEO/cache bodies omit it. Don't "default" it in validatePageMeta.
- Per-locale sibling uniqueness lives ONLY in upsertPageMeta (app-side; SQLite can't index
  JSON keys). The AI create_page path (`upsertPage`) never writes localizedSlugs, but a NEW
  AI page's default slug can still collide with a sibling's override in some locale — the
  backlog has a TODO to wire localizedSlugSiblingConflicts there too.
