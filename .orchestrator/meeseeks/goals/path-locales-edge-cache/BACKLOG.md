# Backlog — path-locales-edge-cache
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks

### Stage 1 — locale-prefixed routes (do first: kills the Vary: Cookie need before caching ships)
- DONE: Extract the `resolvePage` tree walk + slug/plan resolution out of `CMS/src/app/[[...slug]]/page.tsx` into a shared lib module (e.g. `src/lib/render/resolve-page.ts`) so the later custom-worker cache wrapper can reuse it; page.tsx becomes a thin caller; all existing tests pass.
- DONE: Locale-prefix routing: teach the `[[...slug]]` route (via a pure helper in `lib/render/slug.ts`, unit-tested) to peel a leading segment matching a configured NON-default content locale — default locale stays unprefixed, `/` and `/<code>` both resolve HOME_SLUG; `render-page.tsx` takes the active locale from the route instead of the `bb_content_locale` cookie; preview keeps its explicit locale selection.
- TODO: Guard: reject a top-level page slug equal to a configured locale code — validated on page save AND on content-locale settings save; localized error messages in messages/{en,fi,et}.json.
- TODO: Rework the builtin LanguageSwitcher (`lib/render/plan-language-switcher.ts`) from cookie+reload to real navigation (navigate to the same path under the target locale prefix); retire `CONTENT_LOCALE_COOKIE` — grep ALL consumers before deleting.
- TODO: Locale-prefix internal links at plan time: operator `href` props starting with "/" get the active non-default locale prefix during the plan walk (skip `/media/`, external URLs, and `#` anchors).
- TODO: SEO: emit `hreflang` alternate links + canonical in `generateMetadata` for every configured locale, and add a public `sitemap.ts` emitting all published pages × locales (no public sitemap exists today — only the admin view).

### Edge caching (Workers Cache; needs Stage 1 landed)
- TODO: Enable Workers Cache: add `"cache": { "enabled": true }` to CMS/wrangler.jsonc (wrangler 4.101 ≥ required 4.69, fine), re-run cf-typegen so `ctx.cache` is typed, verify `npx opennextjs-cloudflare build`; comment the static-asset billing change next to the config key.
- TODO: Drizzle migration: `page.cache_max_age` INTEGER NOT NULL DEFAULT 0 (0 = never cache) + validation in the page save API + a page-settings "Edge cache" select (Off / 5 min / 1 h / 1 day) with en/fi/et strings.
- TODO: Custom worker entrypoint (officially supported by OpenNext): new `CMS/worker.ts` set as wrangler `main`, importing the `.open-next/worker.js` handler; for GET 200 responses on public page paths (not /admin, /api, /media, /preview, /_next) without Set-Cookie, resolve the slug via the shared resolver and, when `cache_max_age > 0`, set `Cache-Control: public, max-age=<n>, stale-while-revalidate=86400` + `Cache-Tag: pages,page:<id>`. The extra D1 lookup only runs on cache misses.
- TODO: Purge wiring: `/api/pages/[id]/publish` (and unpublish/delete paths) call `ctx.cache.purge({ tags: ["page:<id>"] })` via `getCloudflareContext().ctx`; theme colors save, theme fonts save, component publish, brand-identity save, and locale-settings save purge the shared `pages` tag. Best-effort: a purge failure must never fail the write.

### Stage 2 — localized slugs (`/fi/meista`)
- TODO: Localized-slugs data model: add `page.localized_slugs` JSON column (existing `slug` column stays the default-locale slug; `UNIQUE(parent_page_id, slug)` index intact); per-locale sibling-uniqueness validation on save; per-locale slug inputs in page settings (mirroring metaTitle's per-locale UI).
- TODO: Locale-aware slug walk: `matchSlugSegment` resolves against `localizedSlugs[locale] ?? slug`; wildcard `:param` slugs stay locale-agnostic; dep-free unit tests for the walk.
- TODO: Reverse-resolve internal links + switcher/hreflang under localized slugs: default-locale `href` props re-emitted in the active locale's slug chain at plan time (parse path → page chain → localized path); LanguageSwitcher and hreflang alternates emit the translated full path.
