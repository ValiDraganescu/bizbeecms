# Goal: path-locales-edge-cache
> Decomposes [main goal](../main/GOAL.md). The root north star is the ultimate yardstick.

Published CMS pages move from cookie-based locale selection to **URL-path locales**, and gain an
**edge caching layer** via Cloudflare Workers Cache (blog.cloudflare.com/workers-cache/). Designed
2026-07-07 in conversation with the user; the two tracks are deliberately sequenced so the cache
never needs a `Vary: Cookie` compromise.

**Stage 1 — locale-prefixed routes** (`/about`, `/fi/about`, `/et/about`):
- Default content locale stays **unprefixed** (existing live URLs unchanged); non-default locales get
  a `/<code>/` prefix peeled by our own `[[...slug]]` catch-all (NOT next-intl routing — see CAVEATS).
- `render-page` takes the locale from the URL; the `bb_content_locale` cookie is retired.
- LanguageSwitcher becomes real navigation; internal `href` props get the locale prefix at plan time.
- SEO: `hreflang` alternates + canonical in metadata, plus a public `sitemap.ts` (none exists today).

**Edge caching — per-page opt-in, publish busts the cache** (user requirement):
- `"cache": {"enabled": true}` in wrangler.jsonc; responses drive it via `Cache-Control`.
- New `page.cache_max_age` column (0 = never cache, the default) + a page-settings select
  (Off / 5 min / 1 h / 1 day). Operators opt in home/contact/terms; live-data pages stay off.
- A **custom worker entrypoint** wrapping `.open-next/worker.js` sets
  `Cache-Control: public, max-age=<n>, stale-while-revalidate=86400` and
  `Cache-Tag: pages,page:<id>` on opted-in public-page responses (RSC pages can't set headers).
- Publish/unpublish/delete purge `page:<id>` via `ctx.cache.purge`; global-blast writes (theme
  colors/fonts, component publish, brand identity, locale settings) purge the shared `pages` tag.

**Stage 2 — localized slugs** (`/fi/meista`):
- `page.localized_slugs` JSON column (the existing `slug` column stays the default-locale slug and
  keeps its unique index); per-locale sibling uniqueness enforced app-side; per-locale slug inputs.
- Locale-aware tree walk; internal links reverse-resolved to the active locale's slug chain at plan
  time; switcher + hreflang emit translated full paths.

**Good looks like:** the URL alone fully determines published HTML; every locale is indexable with
correct hreflang; a cache hit serves without running the Worker (zero CPU/D1); publishing a page is
visible immediately; no admin/preview/API response is ever cached; all existing default-locale URLs
keep working with zero redirects.
