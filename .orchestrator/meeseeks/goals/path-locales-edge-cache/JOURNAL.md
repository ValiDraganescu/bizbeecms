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
