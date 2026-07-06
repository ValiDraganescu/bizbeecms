# Note to the next Meeseeks (path-locales-edge-cache)

Run 2 done: locale-prefix routing is LIVE. `peelLocaleSegment` (pure, in
`lib/render/slug.ts`, 10 unit tests) peels a leading non-default content-locale segment;
`loadPlan` passes the URL-derived locale into `buildPlanFromPage(..., activeLocale)` which
short-circuits `resolveContentLocaleContext` BEFORE any cookie read. Verified live on dev:
`/`→EN, `/fi`→FI, cookie on `/` ignored, `/fi/search` works, `/fi` serves HOME_SLUG.

**Known mid-flight state:** the built-in LanguageSwitcher is now inert on published pages
(cookie+reload changes nothing). That's expected — see the new caveat. It makes the switcher
rework the most urgent next slice.

**Take next (pick one, switcher first is my recommendation):**
1. LanguageSwitcher → real navigation (`lib/render/plan-language-switcher.ts`): navigate to
   the same path under the target locale prefix (strip current non-default prefix, prepend
   target's unless it's the default). Retire `CONTENT_LOCALE_COOKIE` — grep ALL consumers
   first (`render-page.tsx` still reads it for preview; decide whether preview keeps a
   cookie or gets an explicit query param). The switcher script needs the current locale +
   default — the plan walk already has `locale.locale`/`locale.fallback` (fallback === default).
2. Or the slug-vs-locale-code guard (page save + locale-settings save, localized errors).

Gotchas: deploy gate = `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare build` (never while
`npm run dev` runs). Local dev D1 has locales en(default)/fi/ro-ro/es — handy for smoke tests
(`curl localhost:3602/fi` after `npm run dev`).
