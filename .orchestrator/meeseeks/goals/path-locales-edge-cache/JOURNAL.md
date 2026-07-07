# Journal — path-locales-edge-cache
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-07-07 01:03 — Extract resolvePage/loadPlan into shared lib module
- **Status:** DONE
- **What I did:** Moved `resolvePage` (published-page tree walk with wildcard params) and
  `loadPlan` (slug → published version blocks → render plan) from
  `CMS/src/app/[[...slug]]/page.tsx` into new `CMS/src/lib/render/resolve-page.ts`
  (also exports the `RouteParams` type). page.tsx is now a thin caller keeping only
  route-specific bits (`localized` metadata helper, `flattenSearchParams`, generateMetadata,
  PublicPage). Pure code move — zero behavior change. The future custom worker cache
  entrypoint imports `resolvePage` from here to look up page id/cache settings.
- **Verified:** `npm test` in CMS — all pass, fail 0. `npx opennextjs-cloudflare build`
  succeeds (with `CMS_DEV_SUPERADMIN=0` override — see new caveat).
- **Files:** CMS/src/lib/render/resolve-page.ts (new), CMS/src/app/[[...slug]]/page.tsx

## 2026-07-07 01:10 — Locale-prefix routing: URL determines the content locale
- **Status:** DONE
- **What I did:** Added pure `peelLocaleSegment(segments, locales, defaultLocale)` to
  `lib/render/slug.ts` — peels a leading path segment matching a configured NON-default
  content locale (case-insensitive, URL-decoded; default locale stays unprefixed and is
  NOT peeled). Wired into `loadPlan` (resolve-page.ts): reads `getContentLocales(db)`,
  peels the locale, walks the remaining path (`/fi` → HOME_SLUG like `/`). New optional
  `activeLocale` param on `buildPlanFromPage` → `resolveContentLocaleContext(explicitLocale)`
  short-circuits BEFORE the cookie path. Public renders are now cookie-independent;
  preview/Develop (no explicit locale) keep the legacy cookie path unchanged.
- **Verified:** 10 new dep-free `node --test` cases in slug.test.ts; full `npm test`
  1579 pass / 0 fail; `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare build` green.
  Live smoke on local dev D1 (en default; fi/ro-ro/es): `/`→EN h1, `/fi`→FI h1,
  `/ro-ro` 200, `/fi/search` 200, `/fi/nope-xyz` + `/nope-xyz` 404, and
  `Cookie: bb_content_locale=fi` on `/` still renders EN (URL alone determines HTML).
- **Files:** CMS/src/lib/render/slug.ts, CMS/src/lib/render/slug.test.ts (new),
  CMS/src/lib/render/resolve-page.ts, CMS/src/lib/render/render-page.tsx

## 2026-07-07 01:17 — LanguageSwitcher: cookie+reload → real locale-prefix navigation
- **Status:** DONE
- **What I did:** Rewrote the built-in LanguageSwitcher client script
  (`lib/render/plan-language-switcher.ts`). New pure `switchLocalePathname(pathname,
  target, defaultLocale, codes)` — the client-side mirror of `peelLocaleSegment`
  (strip a leading NON-default locale segment, case-insensitive + URL-decoded;
  prepend the target's encoded prefix unless it's the default) — shipped verbatim
  into LANGUAGE_SWITCHER_SCRIPT via `.toString()`. On change the script
  `location.assign`s the rewritten path (search + hash preserved). The `<select>`
  now carries `data-bb-default-locale` (from `LocaleContext.fallback`).
  DECISION (was open in NEXT.md): CONTENT_LOCALE_COOKIE is NOT deleted — the admin
  preview iframe (`/preview/...`) has no locale-prefixed routes, so the script
  falls back to legacy cookie+reload there, and render-page.tsx's
  no-explicit-locale path still reads it. Published pages never write the cookie.
  Updated stale jsdoc in plan-types.ts (LANGUAGE_SWITCHER_COMPONENT).
- **Verified:** 9 new node --test cases (rewrite matrix incl. case/URL-decode,
  default-code-as-slug, encoding; script-content asserts); full `npm test` 1588/0;
  `new Function(script)` syntax check; DOM-stub eval of the shipped script
  (en→fi assigns /fi/about?x=1#h, fi→en assigns /about, /preview/ cookies+reloads);
  live dev smoke: / and /fi ship the attr + transpiled rewrite fn;
  `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare build` green.
- **Files:** CMS/src/lib/render/plan-language-switcher.ts,
  CMS/src/lib/render/plan-language-switcher.test.ts, CMS/src/lib/render/plan-types.ts

## 2026-07-07 01:26 — Slug-vs-locale-code collision guard (both write paths)
- **Status:** DONE
- **What I did:** New pure `localeSlugConflicts(locales, topLevelSlugs)` in
  `lib/render/localize.ts` (case-insensitive, trimmed; `:param` wildcards never
  collide; DEFAULT locale deliberately included — flipping the default later
  would silently shadow the page). Wired into THREE write paths:
  (1) `/api/pages` POST/PUT — top-level slug equal to a configured locale code →
  409 `{code:"slugIsLocaleCode"}`; (2) `/api/settings/content-locales` PUT —
  adding a locale equal to an existing top-level page slug → 409
  `{code:"localeIsPageSlug", conflicts}`; (3) AI `create_page` tool
  (tool-dispatch handleCreatePage) — same guard, English self-correcting error
  naming the exact code + fix. Clients map the codes to localized messages:
  page-picker → `pageBuilder.create.slugIsLocaleCode`, content-locales-editor →
  `contentLocales.pageSlugConflict` ({slugs} param), in messages/{en,fi,et}.json.
  Child pages may still use locale-code slugs (only top level collides).
- **Verified:** 8 new dep-free node --test cases (localize-slug-guard.test.ts);
  full `npm test` 1596/0. Live dev smoke (local D1, en/fi/ro-ro/es): POST slug
  "fi" top-level → 409 w/ code; same slug under a parent → 201; PUT locales
  +"sv" while top-level page "sv" exists → 409 conflicts:["sv"]; unchanged
  locales PUT → 200; normal create → 201 (all fixtures cleaned up).
  `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare build` green.
- **Files:** CMS/src/lib/render/localize.ts, CMS/src/lib/render/localize-slug-guard.test.ts (new),
  CMS/src/app/api/pages/route.ts, CMS/src/app/api/settings/content-locales/route.ts,
  CMS/src/lib/chat/tool-dispatch.ts, CMS/src/components/page-builder/page-picker.tsx,
  CMS/src/components/settings/content-locales-editor.tsx, CMS/messages/{en,fi,et}.json

## 2026-07-07 01:33 — Locale-prefix internal links at plan time
- **Status:** DONE
- **What I did:** New pure `lib/render/localize-links.ts`: `localizeHref(href,
  active, default, codes)` + `localizePlanLinks(plans, localeCtx)` — a post-pass
  over the FINISHED ElementPlan (so it covers operator link props, schema
  defaults, binding-hydrated values, List row stamps, and static hrefs authored
  in component trees alike). Rules: only absolute internal paths ("/..."), never
  "//" protocol-relative/external/mailto/#/relative/empty; segment-exact skip set
  {media, api, admin, preview, _next}; never double-prefixes a path whose first
  segment (decoded, case-insensitive) is ANY configured locale code; default
  locale = identity no-op (same array back). Root "/" → "/fi" (not "/fi/") to
  avoid Next's 308 trailing-slash hop; "/?q"/"/#h" likewise. Wired as the final
  step of `planPage` (tree.ts) — one seam, both public + preview renders.
- **Verified:** 13 dep-free node --test cases; full `npm test` 1609/0; live dev
  smoke (local D1 en/fi/ro-ro/es): `/fi` render rewrites every internal href
  (incl. `/fi/book?restaurant=...` query links), `/` render untouched, `/_next`
  untouched, zero `/fi/fi` double-prefixes, root link `/fi` → 200 (no 308);
  `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare build` green.
- **Files:** CMS/src/lib/render/localize-links.ts (new),
  CMS/src/lib/render/localize-links.test.ts (new), CMS/src/lib/render/tree.ts

## 2026-07-07 01:41 — SEO: hreflang alternates + canonical + public sitemap.xml
- **Status:** DONE (closes Stage 1)
- **What I did:** New pure `lib/render/hreflang.ts` (`pathForLocale` +
  `hreflangAlternates`: canonical = the request's own locale variant,
  languages = every configured code + x-default → default unprefixed path;
  empty when only one locale; reuses `peelLocaleSegment`; segments normalized
  decode→re-encode; root → "/" / "/fi" no trailing slash). New pure
  `lib/render/sitemap-paths.ts` (`publishedPagePaths`: parent-chain walk,
  leaf-only publish gate matching resolvePage, skips `:param` chains /
  dangling parents / cycles, top-level HOME_SLUG → root). New
  `lib/render/site-origin.ts` (`resolveSiteOrigin`: APP_ORIGIN first — request
  host is workers.dev under the router proxy — fallback to headers in dev,
  null when unknown). Wired `generateMetadata` in `[[...slug]]/page.tsx`
  (metadataBase + alternates.canonical/languages) and added
  `app/sitemap.ts` (`dynamic = "force-dynamic"`, published pages × locales
  with per-entry xhtml:link alternates, sorted; empty when origin unknown).
- **Verified:** 18 new dep-free node --test cases; full `npm test` 1627/0;
  `npx tsc --noEmit` clean; live dev smoke (local D1 en/fi/ro-ro/es):
  `/` + `/fi` + `/fi/contact` emit correct canonical + 5 hreflang links
  (x-default = unprefixed), sitemap.xml = 36 urls (9 pages × 4 locales) with
  xhtml:link alternates, zero `:param` URLs; `CMS_DEV_SUPERADMIN=0 npx
  opennextjs-cloudflare build` green (started/killed my own dev server).
- **Files:** CMS/src/lib/render/hreflang.ts (new), hreflang.test.ts (new),
  sitemap-paths.ts (new), sitemap-paths.test.ts (new), site-origin.ts (new),
  CMS/src/app/sitemap.ts (new), CMS/src/app/[[...slug]]/page.tsx

## 2026-07-07 01:51 — Workers Cache enabled + page.cache_max_age opt-in (column, API, UI)
- **Status:** DONE
- **What I did:** (1) `"cache": {"enabled": true}` in CMS/wrangler.jsonc with the
  static-asset billing comment; cf-typegen re-run — NO Env change (cache is on the
  execution context `ctx.cache`, not an env binding). (2) Drizzle migration 0027
  (`npm run db:generate`, applied `--local`): `page.cache_max_age` INTEGER NOT NULL
  DEFAULT 0. (3) `validatePageMeta` gains OPTIONAL `cacheMaxAge` validated against
  exported `CACHE_MAX_AGE_OPTIONS = [0,300,3600,86400]`; **absent = preserve the
  stored value** (SEO/publish PUT bodies deliberately omit it so their saves can't
  reset the opt-in). `upsertPageMeta` writes it only when defined (create default 0);
  `PageSummary` carries it. (4) Page tab: "Edge cache" select (Off/5 min/1 h/1 day)
  PUTting via new pure `buildCacheMaxAgeBody` (publish state preserved, NOT toggled);
  strings in messages/{en,fi,et}.json.
- **Verified:** 5 new node --test cases (option set, absent=undefined, rejects
  42/-1/300.5/"300"/true, body builder, publish/SEO bodies omit the field); full
  `npm test` 1632/0; `npx tsc --noEmit` clean; live dev smoke (own dev server,
  port 3602, killed after): GET /api/pages exposes cacheMaxAge; PUT 3600 → D1 3600;
  PUT without the field → still 3600; PUT 42 → 400 naming the allowed set; reset 0.
  `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare build` + `wrangler deploy
  --dry-run` green (validates the new "cache" config key).
- **Files:** CMS/wrangler.jsonc, CMS/src/db/schema.ts,
  CMS/migrations/0027_familiar_micromax.sql (new), CMS/migrations/meta/*,
  CMS/src/lib/pages/page-meta.ts, page-meta.test.ts, page-picker.test.ts,
  CMS/src/db/page-store.ts, CMS/src/components/page-builder/page-settings.tsx,
  CMS/messages/{en,fi,et}.json

## 2026-07-07 02:03 — Custom worker entrypoint stamps Cache-Control + Cache-Tag
- **Status:** DONE
- **What I did:** (1) New `CMS/worker.ts` set as wrangler `main` (OpenNext
  documented pattern): wraps `.open-next/worker.js`'s default handler and
  re-exports its DO classes (DOQueueHandler/DOShardedTagCache/BucketCachePurge —
  the build emits them even with dummy caches). After the handler returns, a
  pure gate (`isEdgeCacheCandidate`) rejects non-GET/non-200/Set-Cookie/system
  paths for free; survivors get ONE extra D1 lookup (getContentLocales →
  peelLocaleSegment → resolvePage — the same walk the route uses) and, when
  `cache_max_age > 0`, the response is re-wrapped with `Cache-Control: public,
  max-age=<n>, stale-while-revalidate=86400` + `Cache-Tag: pages,page:<id>`.
  All best-effort (try/catch → untouched response). (2) New pure
  `lib/render/edge-cache.ts` (pathnameSegments / isEdgeCacheCandidate /
  edgeCacheHeaders / pageCacheTag / PAGES_CACHE_TAG); SKIP_SEGMENTS now
  EXPORTED from localize-links.ts — one shared skip list, no drift.
  (3) Split `resolve-page.ts`: `loadPlan` moved to new `lib/render/load-plan.ts`
  (React/next-intl/next-headers side); resolve-page.ts is now lean
  (drizzle + slug only, takes `Db`) so the worker bundle never imports Next
  internals. page.tsx imports loadPlan from load-plan.
- **Verified:** 8 new dep-free node --test cases; full `npm test` 1640/0;
  `npx tsc --noEmit` clean; `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare
  build` green; `wrangler deploy --dry-run` bundles worker.ts (tsconfig `@/`
  paths resolve; DO exports + SWR string present in the bundle). LIVE smoke via
  `wrangler dev` (local D1, home page set cache_max_age=3600): `/` and `/fi` →
  stamped public,max-age=3600,SWR + `Cache-Tag: pages,page:<home-id>`;
  opted-out page + 404 + /admin keep Next's no-store. Fixture reset to 0;
  wrangler dev killed. Real hit/miss (cf-cache-status) remains HITL post-deploy.
- **Files:** CMS/worker.ts (new), CMS/wrangler.jsonc,
  CMS/src/lib/render/edge-cache.ts (new), edge-cache.test.ts (new),
  load-plan.ts (new), resolve-page.ts, localize-links.ts,
  CMS/src/app/[[...slug]]/page.tsx

## 2026-07-07 02:09 — Purge wiring: writes bust the edge cache (last Edge-caching TODO)
- **Status:** DONE
- **What I did:** Added pure `purgeCacheTags(cache, tags)` + `TagPurger` type to
  `lib/render/edge-cache.ts` (best-effort: missing cache / missing purge / throwing purge /
  empty tags all → false, never throws) and a CF-coupled wrapper `lib/render/purge-edge.ts`
  (`purgeEdgeTags(...tags)` → `getCloudflareContext().ctx.cache`, swallows missing-context).
  Wired 7 routes: per-page tag (`pageCacheTag(id)`) on POST /api/pages/[id]/publish, PUT
  /api/pages (meta updates incl. the unpublish toggle; creates skipped), DELETE /api/pages;
  shared `PAGES_CACHE_TAG` on theme colors PUT, theme fonts PUT, brand PUT, content-locales
  PUT, and component publish (only when `res.published`). Restore route deliberately NOT
  wired (it only creates a draft). All purges run AFTER the successful write, before the
  response.
- **Verified:** 2 new node --test cases for purgeCacheTags; full suite 1642/1642 green;
  `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare build` green; `wrangler deploy --dry-run`
  green. Real tag-purge behavior (cf-cache-status flips MISS after publish) is HITL on a
  deployed site per CAVEATS.
- **Files:** CMS/src/lib/render/edge-cache.ts, CMS/src/lib/render/purge-edge.ts (new),
  CMS/src/lib/render/edge-cache.test.ts, CMS/src/app/api/pages/route.ts,
  CMS/src/app/api/pages/[id]/publish/route.ts, CMS/src/app/api/components/[name]/route.ts,
  CMS/src/app/api/settings/{theme,theme/fonts,brand,content-locales}/route.ts

## 2026-07-07 02:20 — Stage 2 data model: page.localized_slugs + per-locale uniqueness + slug inputs
- **Status:** DONE
- **What I did:** (1) Drizzle-only migration 0028 (`page.localized_slugs` TEXT
  NOT NULL DEFAULT '{}'; `slug` stays the default-locale slug, unique index
  untouched); applied --local. (2) `validatePageMeta` gains optional
  `localizedSlugs` (SAME preserve-when-absent contract as cacheMaxAge; empty
  values drop the key = clear override; wildcard ":param" values rejected —
  wildcards are locale-agnostic; locale keys lowercased). (3) New pure
  `localizedSlugSiblingConflicts` (page-meta.ts): effective slug in locale L =
  `localizedSlugs[L] ?? slug`, unique among siblings per locale over the UNION
  of keyed locales (default locale covered by UNIQUE(parent,slug)); wired into
  `upsertPageMeta` (checks what WILL persist: body map ?? stored map).
  (4) PageSummary/toSummary expose `localizedSlugs`. (5) /api/pages top-level
  locale-code guard now also covers localized values; content-locales PUT
  checks localized top-level slugs too (CAVEATS Stage-2 line honored).
  (6) PageSettings gets a "Localized slugs" section: one input per NON-default
  locale (placeholder = default slug, empty = fallback), pure
  `buildLocalizedSlugsBody`, client pre-validation, slugIsLocaleCode code
  mapped to the existing t() key; en/fi/et strings added.
- **Verified:** page-meta tests 17/17; full `npm test` 1648/1648;
  `npx tsc --noEmit` clean; `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare
  build` + `wrangler deploy --dry-run` green; migration applied to local D1.
  UI save flow not browser-tested (dev server was down) — exercised via the
  pure body builder + route validation tests.
- **Files:** CMS/src/db/schema.ts, CMS/migrations/0028_shocking_sir_ram.sql (new),
  CMS/migrations/meta/*, CMS/src/lib/pages/page-meta.ts, page-meta.test.ts,
  page-picker.test.ts, CMS/src/db/page-store.ts, CMS/src/app/api/pages/route.ts,
  CMS/src/app/api/settings/content-locales/route.ts,
  CMS/src/components/page-builder/page-settings.tsx, page-builder-shell.tsx,
  CMS/messages/{en,fi,et}.json

## 2026-07-07 02:27 — Locale-aware slug walk (localizedSlugs[locale] ?? slug)
- **Status:** DONE
- **What I did:** (1) New pure `effectiveSlug(candidate, locale)` in
  `lib/render/slug.ts`: the slug a page answers to in a locale —
  `localizedSlugs[locale] ?? slug`; takes the RAW stored JSON text (SlugCandidate
  gains optional `localizedSlugs?: string | null`), locale lowercased for the
  lookup (keys stored lowercase), wildcard ":param" pages locale-agnostic
  (overrides ignored), malformed JSON / non-string / empty values fall back to
  the default slug. (2) `matchSlugSegment` gains optional `locale` — the EXACT
  match runs against the effective slug; where an override exists the DEFAULT
  slug 404s in that locale (one canonical URL per locale) and the override
  doesn't leak into other locales. Wildcard fallback unchanged. (3) `resolvePage`
  gains optional `locale`, passed per level. (4) Both callers pass the peel's
  active locale: `loadPlan` (route) and `CMS/worker.ts` (edge-cache stamping) —
  localized URLs get the same Cache-Control/Cache-Tag stamps for free.
- **Verified:** 9 new dep-free node --test cases (18 total in slug.test.ts);
  full `npm test` 1656/1656; `npx tsc --noEmit` clean; `CMS_DEV_SUPERADMIN=0
  npx opennextjs-cloudflare build` + `wrangler deploy --dry-run` green. LIVE
  smoke via `wrangler dev` (local D1 en/fi/ro-ro/es; terms page given
  fi:"ehdot" + cache_max_age 3600): `/fi/ehdot` → 200 with
  `Cache-Control: public,max-age=3600,SWR` + `Cache-Tag: pages,page:<terms-id>`;
  `/fi/terms` → 404; `/ehdot` → 404; `/terms` → 200 + stamped; `/fi/search`
  (no override) → 200. Fixture reset, dev killed.
- **Files:** CMS/src/lib/render/slug.ts, slug.test.ts, resolve-page.ts,
  load-plan.ts, CMS/worker.ts

## 2026-07-07 02:37 — Reverse-resolve internal links + LanguageSwitcher under localized slugs (part 1)
- **Status:** DONE
- **What I did:** (1) New pure `lib/render/localize-paths.ts`:
  `createPathTranslator(rows, defaultLocale)` — default-locale path →
  locale's slug chain (children-index walk; match by DEFAULT slug, re-emit
  `effectiveSlug`; wildcard values pass through; unmatched tail passes
  through; ?/# suffix untouched; identity when unchanged);
  `defaultPathForPage` (parent-chain walk, wildcards filled from route
  params, HOME → "/", null on cycle/dangling/missing-param);
  `pagePathsByLocale` (the rendered page's full pathname per locale, prefix
  included, undefined when unreconstructible). (2) `LocaleContext` gains
  `translatePath?` + `pagePaths?`. (3) `localizeHref` takes optional
  `translate` (applied AFTER skip checks, before prefixing);
  `localizePlanLinks` reads `locale.translatePath`. (4) Switcher: options
  stamp `data-bb-path` from `locale.pagePaths`; client script prefers the
  stamped path, falls back to the prefix-only rewrite (preview cookie branch
  unchanged). (5) `buildPlanFromPage` populates both (one small full-table
  page read per render, try/catch best-effort).
- **Verified:** 12 new localize-paths tests + 2 localize-links + 3 switcher
  cases; full `npm test` 1672/1672; `npx tsc --noEmit` clean;
  `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare build` + `wrangler deploy
  --dry-run` green. LIVE smoke via wrangler dev (local D1 en/fi/ro-ro/es;
  terms fi:"ehdot"): `/fi` home rewrites the terms link to `/fi/ehdot`
  (default render untouched); switcher options carry data-bb-path per
  locale; `/fi/ehdot` 200, `/fi/terms` 404, `/ehdot` 404, `/terms` 200.
  Fixture reset, dev killed.
- **Files:** CMS/src/lib/render/localize-paths.ts (new),
  localize-paths.test.ts (new), plan-types.ts, localize-links.ts,
  localize-links.test.ts, plan-language-switcher.ts,
  plan-language-switcher.test.ts, render-page.tsx

## 2026-07-07 02:44 — Reverse-resolve hreflang + sitemap under localized slugs (part 2)
- **Status:** DONE (clears the release-blocking caveat — all four rewrite seams
  are now localized-slug-aware: links, switcher, hreflang, sitemap)
- **What I did:** (1) `pathForLocale` (hreflang.ts) gains optional
  `translate?: (path, locale) => string` — applied to the DEFAULT-locale path
  before prefixing (never runs for the default locale; root translate stays
  `/code`). (2) `hreflangAlternates` gains optional
  `pagePaths?: Record<string,string>` — plan-time LocaleContext.pagePaths
  entries (already translated + prefixed) win over the prefix-only rewrite,
  per-code fallback when absent. Needed because generateMetadata's request
  segments are the ACTIVE locale's chain (a prefix rewrite of `/fi/ehdot`
  would emit `/ehdot` for en). (3) generateMetadata ([[...slug]]/page.tsx)
  passes `loaded.locale.pagePaths` — zero new D1 reads (part 1 already builds
  it in buildPlanFromPage). (4) app/sitemap.ts selects `localizedSlugs`,
  builds `createPathTranslator(rows, default)` once, passes it to both
  pathForLocale call sites (url + per-entry xhtml:link alternates).
- **Verified:** 4 new dep-free node --test cases (toy translator + pagePaths
  precedence + fallback); full `npm test` 1676/1676; `npx tsc --noEmit` clean;
  live dev smoke (local D1 en/fi/ro-ro/es; terms fi:"ehdot"): `/fi/ehdot` →
  canonical `/fi/ehdot` + en alternate `/terms` (not `/ehdot`); `/terms` → fi
  alternate `/fi/ehdot` (not `/fi/terms`); sitemap emits `/fi/ehdot`, zero
  `fi/terms` occurrences; statuses /fi/ehdot 200, /fi/terms 404, /ehdot 404,
  /terms 200. Fixture reset, dev killed. `CMS_DEV_SUPERADMIN=0 npx
  opennextjs-cloudflare build` + `wrangler deploy --dry-run` green.
- **Files:** CMS/src/lib/render/hreflang.ts, hreflang.test.ts,
  CMS/src/app/[[...slug]]/page.tsx, CMS/src/app/sitemap.ts

## 2026-07-07 02:49 — AI create_page guarded against sibling localized-slug collisions (last open TODO)
- **Status:** DONE (empties the backlog)
- **What I did:** New pure `newPageSiblingSlugConflicts(slug, siblings)` in
  `lib/pages/page-meta.ts` — create-path variant of `localizedSlugSiblingConflicts`
  for a NEW page (no overrides of its own): parses the RAW stored `localized_slugs`
  TEXT (malformed / non-object / empty / non-string values → no overrides, matching
  `effectiveSlug`'s fallback) and delegates to the existing pure check. Wired into
  `upsertPage` (page-store.ts) on the CREATE branch only (updates match by
  (parent, slug) — the slug isn't changing, and override writes are guarded in
  `upsertPageMeta`): one sibling select under `parentMatch`, and on conflict a
  self-correcting English AI-facing error naming the exact slug + locale + fix
  ("choose a different slug, or change that sibling's <locale> slug override").
  Flows to the model via `handleCreatePage`'s existing `res.errors` path — no
  tool-dispatch change needed.
- **Verified:** 4-scenario regression test in page-meta.test.ts (collision via
  override, collision with sibling default in a keyed locale, no collision,
  malformed-JSON tolerance) — fails without the helper, passes with it; full
  `npm test` 1677/1677; `npx tsc --noEmit` clean; `CMS_DEV_SUPERADMIN=0 npx
  opennextjs-cloudflare build` + `wrangler deploy --dry-run` green. Could NOT
  live-exercise the AI tool end-to-end (needs an AI chat session); the wiring is
  a typed one-select + pure-call path.
- **Files:** CMS/src/lib/pages/page-meta.ts, page-meta.test.ts,
  CMS/src/db/page-store.ts

## 2026-07-07 09:02 — Defect fix: path change now blasts the shared `pages` tag (stale inbound links)
- **Status:** DONE
- **What I did:** Defect hunt (NEXT.md option 1) found a real gap: page A's
  cached HTML embeds reverse-resolved links to page B (localize-paths reads the
  FULL page table, no publish filter), but a PUT changing B's slug / parent /
  localized_slugs purged only `page:<B>` — every other cached page kept serving
  now-404 hrefs for up to max-age + SWR (≤2 days). Fix: (1) pure
  `pagePathInputsChanged(before, after)` in `lib/pages/page-meta.ts` (slug,
  parentPageId, localizedSlugs compare; absent map = preserve contract → not a
  change). (2) `upsertPageMeta`'s update branch extends its existing-row select
  to slug+parentPageId and returns optional `pathChanged`. (3) /api/pages PUT
  purges `[PAGES_CACHE_TAG, page:<id>]` when pathChanged, else `page:<id>` as
  before. Publish/unpublish/delete/create deliberately unchanged: the
  translator ignores publish status, and before-create/after-delete the inbound
  href 404s either way — no correctness delta.
- **Verified:** 2 new regression tests (change detection incl. override
  add/remove; identical + absent-map non-changes); full `npm test` 1679/1679;
  `npx tsc --noEmit` clean; `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare
  build` + `wrangler deploy --dry-run` green. Real purge behavior remains a
  deployed-site HITL check (per CAVEATS).
- **Files:** CMS/src/lib/pages/page-meta.ts, page-meta.test.ts,
  CMS/src/db/page-store.ts, CMS/src/app/api/pages/route.ts

## 2026-07-07 09:05 — Operator docs: URL locales + edge cache
- **Status:** DONE
- **What I did:** Wrote the first user-facing doc for this goal's Stage 1/2
  (NEXT.md's highest-value remaining slice; backlog was empty of code work, no
  open bugs). New `CMS/docs/url-locales-and-edge-cache.md` — operator guide
  covering: URL-path locales (default unprefixed, `/fi/...` for extras), the
  navigating LanguageSwitcher, auto-translated internal links, the reserved
  top-level-slug-vs-locale rule, localized slugs (`/fi/meista`, per-locale slug
  fields, empty=fallback, sibling uniqueness, one canonical URL per locale),
  SEO (canonical/hreflang/sitemap), and the per-page edge cache (Off/5m/1h/1d
  opt-in, what's never cached, and the full publish/path-change/site-wide purge
  matrix). Every factual claim cross-checked against code: CACHE_MAX_AGE_OPTIONS
  + `page.cacheOption*` strings, and all 8 `purgeEdgeTags` call sites (pages,
  publish, theme, theme/fonts, brand, content-locales, components). Linked it
  from `CMS/README.md` under a new "Docs" section.
- **Verified:** Docs-only change — no code/tests/build touched. Facts verified by
  grepping the source (page-meta.ts, page-settings.tsx, messages/en.json, the
  purge call sites). No build needed.
- **Files:** CMS/docs/url-locales-and-edge-cache.md (new), CMS/README.md

## 2026-07-07 09:09 — Defect hunt + regression lock: deeply-nested localized-slug sitemap seam
- **Status:** DONE
- **What I did:** Chased NEXT.md's flagged untested angle — sitemap/hreflang
  under DEEPLY NESTED (parent-chain) localized slugs. Probed the real pipeline
  (publishedPagePaths → createPathTranslator → pathForLocale) with 3-level chains
  and mixed overrides via a throwaway tsx script: NO defect — every-segment
  override, mid-chain-gap override, and wildcard-ancestor-with-deeper-override
  all resolve correctly (`/about/team/lead` → `/fi/meista/tiimi/johtaja`, etc.).
  The logic was sound; the GAP was coverage — the per-helper unit tests only
  went 2 levels and never exercised the sitemap integration seam. Locked it in:
  3 new regression tests in localize-paths.test.ts driving the actual
  publishedPagePaths+translator+pathForLocale chain (imported both real modules,
  no toy translator). Ponytail: no fix invented where no bug exists — the value
  is the regression fence around a subtle multi-segment walk.
- **Verified:** `node --test localize-paths.test.ts` 15/15; full `npm test`
  1682/1682 (+3); `npx tsc --noEmit` clean. Test-only change (no source, no
  docs) → no deploy-gate build needed.
- **Files:** CMS/src/lib/render/localize-paths.test.ts

## 2026-07-07 09:12 — Regression fence: edge-cache gate × query strings
- **Status:** DONE
- **What I did:** Locked in NEXT.md's flagged invented slice — cache × query-param
  page interplay. Confirmed (no defect) the gate is query-agnostic by design:
  worker.ts feeds `isEdgeCacheCandidate` `new URL(request.url).pathname` (query
  already stripped), and Workers Cache keys by the FULL URL incl. query (CAVEATS),
  so a `?utm=` variant caches SEPARATELY and can never cross-serve another page's
  HTML while stamping identical Cache-Control/Cache-Tag. The gap was coverage:
  no test proved the query never leaks into pathname/segments nor flips the skip
  decision. Added 2 tests in edge-cache.test.ts — one asserts URL.pathname strips
  the query + pathnameSegments never spawns a fake segment from a raw `?`, one
  asserts the candidate verdict is identical with/without a query (page path AND
  system path). Ponytail: no code touched — the seam is already correct; value
  is the fence. Real hit/miss caching remains HITL on a deployed site.
- **Verified:** `node --test edge-cache.test.ts` 12/12 (+2); full render suite
  `node --test src/lib/render/*.test.ts` 189/189; `npx tsc --noEmit` clean.
  Test-only change (no source) → no deploy-gate build needed.
- **Files:** CMS/src/lib/render/edge-cache.test.ts

## 2026-07-07 09:15 — icon-set save was missing its pages-tag purge (real gap)
- **Status:** DONE
- **What I did:** Audited every global-blast admin write against the GOAL's
  "global-blast writes … purge the shared `pages` tag" spec. Found a genuine
  gap: `PATCH /api/settings/icon-set` (the site-wide Iconify prefix) did NOT
  purge. The icon set resolves every `{{icon "x"}}` slot in published-page HTML
  (`render-page.tsx` → `getIconSet()` → `resolveIcons`), so changing it alters
  every cached page's rendered icons — exactly a global-blast write like
  theme/fonts/brand. Added `await purgeEdgeTags(PAGES_CACHE_TAG)` after
  `setIconSet`, mirroring the brand route (best-effort; a purge failure never
  fails the save). All other GOAL-listed global-blast writes were already
  wired (theme colors/fonts, brand, component publish, content-locales) and
  the deliberately-partial page CREATE/DELETE/restore paths are correct per
  CAVEATS — no other gap.
- **Verified:** `npx tsc --noEmit` clean; `node --test edge-cache.test.ts`
  12/12; full render suite `node --test src/lib/render/*.test.ts` 189/189.
  Purge MECHANISM already fenced in edge-cache.test.ts (purgeCacheTags
  best-effort, tag passing); the added call is a trivial unconditional
  one-liner (no branch) mirroring 5 sibling routes → no new test warranted
  (route-mock would prove nothing the mechanism fence doesn't). Real
  hit/miss/purge behavior stays HITL on a deployed site.
- **Files:** CMS/src/app/api/settings/icon-set/route.ts

## 2026-07-07 09:24 — Defect fix: published `<html lang>` now the URL content locale (was Accept-Language cache poison)
- **Status:** DONE
- **What I did:** Self-found defect: the root layout stamps `<html lang={await
  getLocale()}>` — the ADMIN-UI locale resolver (NEXT_LOCALE cookie →
  Accept-Language → default). On published pages that (a) mislabels content
  for SEO (`/fi/meista` said lang="en" for an English browser) and (b) lets
  the FIRST visitor's browser language get baked into edge-cached HTML —
  violating the GOAL's "URL alone fully determines published HTML". An RSC
  layout can't see the pathname, so the fix lives in the worker seam where
  cached HTML is minted: `CMS/worker.ts` now, for RESOLVED published pages
  with an HTML content type, rewrites `html[lang]` to the peeled content
  locale via HTMLRewriter (streaming, headers carry over) — after the
  cache-header stamp so cached copies store the corrected lang. New pure
  `isHtmlContentType` gate in edge-cache.ts (RSC flight `text/x-component`,
  JSON, absent → untouched). Non-page/skipped/404 responses pass through.
- **Verified:** 2 new node --test cases (isHtmlContentType matrix); render
  suite 191/191; full `npm test` 1686/1686; `npx tsc --noEmit` clean
  (HTMLRewriter handler needs `void el.setAttribute(...)` — returns Element);
  `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare build` + `wrangler deploy
  --dry-run` green. LIVE smoke via wrangler dev (local D1 en/fi/ro-ro/es):
  `/` with `Accept-Language: fi` → lang="en" (poison repro fixed), `/fi` →
  lang="fi", `/ro-ro` → lang="ro-ro"; fail-before evidence: `/admin` (skipped
  path, same layout) still varies → lang="fi" under that header; opted-in
  home (cache_max_age=3600) gets Cache-Control + Cache-Tag AND corrected lang
  together (HTMLRewriter preserves the stamps). Fixture reset, dev killed.
  Real cached-copy behavior stays HITL on a deployed site.
- **Files:** CMS/worker.ts, CMS/src/lib/render/edge-cache.ts,
  CMS/src/lib/render/edge-cache.test.ts
