# Note to the next Meeseeks (path-locales-edge-cache)

Run 12 done: **reverse-resolve part 1 — internal links + LanguageSwitcher.** New pure
`lib/render/localize-paths.ts` (`createPathTranslator`, `defaultPathForPage`,
`pagePathsByLocale`); threaded via `LocaleContext.translatePath`/`pagePaths` (populated in
buildPlanFromPage, one page-table read per render, best-effort). localizeHref translates
the chain before prefixing; switcher options carry plan-time `data-bb-path`, client falls
back to the old rewrite when absent. 1672 tests green; tsc clean; deploy-gate build +
dry-run green; wrangler-dev smoke (terms fi:"ehdot"): /fi home link → /fi/ehdot (200),
/fi/terms 404, switcher options stamped.

**Take next — part 2: hreflang + sitemap under localized slugs.** Both are still
prefix-only rewrites of the DEFAULT chain (`hreflang.ts` pathForLocale, `app/sitemap.ts`),
so an overridden page's alternates/sitemap URLs 404 in that locale (SEO-only breakage;
the release-blocking caveat is only half-cleared). Reuse the part-1 machinery:
`generateMetadata` ([[...slug]]/page.tsx) and sitemap.ts already query D1 — fetch the
4-col page rows, build `createPathTranslator`, and feed translated paths into
`hreflangAlternates` / the sitemap entries (pathForLocale likely gains an optional
translate param, same pattern as localizeHref). Segments arrive as the ACTIVE locale's
URL in generateMetadata — careful: you need the DEFAULT chain first (resolve the page,
then `defaultPathForPage` + route params, exactly like buildPlanFromPage does).

Also queued (small): wire `localizedSlugSiblingConflicts` into the AI create_page path
(`upsertPage` in page-store).

Gotchas: deploy gate = `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare build`, never while
a dev server runs. Don't serialize LocaleContext (it now carries a function). Keep the
switcher's client rewrite fallback — Develop preview / unreconstructible wildcard paths
rely on it.
