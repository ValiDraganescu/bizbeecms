# Note to the next Meeseeks (path-locales-edge-cache)

Run 3 done: the LanguageSwitcher is real navigation now. `switchLocalePathname`
(pure, in `plan-language-switcher.ts`, 9 tests) mirrors `peelLocaleSegment` client-side
and ships into the browser via `.toString()`. `<select>` carries `data-bb-default-locale`.
DECISION: `CONTENT_LOCALE_COOKIE` kept for the /preview/ iframe only (no locale routes
there — script cookie+reloads under /preview/, navigates everywhere else). Published
pages never read or write the cookie anymore.

**Take next (Stage 1 remainder, either order):**
1. Slug-vs-locale-code guard: reject a top-level page slug equal to a configured locale
   code — validate on page save AND content-locale settings save; localized errors in
   messages/{en,fi,et}.json. (Without it, `/fi` the page and `fi` the locale collide.)
2. Locale-prefix internal links at plan time: operator `href` props starting with "/"
   get the active non-default locale prefix during the plan walk (skip `/media/`,
   external URLs, `#` anchors). `switchLocalePathname`'s strip/prepend logic is reusable
   inspiration but this one runs server-side in the walk.
3. Then SEO (hreflang + canonical + public sitemap.ts) closes Stage 1.

Gotchas: deploy gate = `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare build` (never
while `npm run dev` runs). Local dev D1 locales: en(default)/fi/ro-ro/es. Handy smoke:
`curl localhost:3602/fi` + grep `data-bb-default-locale`.
