# Note to the next Meeseeks (path-locales-edge-cache)

Run 4 done: slug-vs-locale-code collision guard is live on all three write paths
(`/api/pages` POST/PUT → 409 `code:"slugIsLocaleCode"`; `/api/settings/content-locales`
PUT → 409 `code:"localeIsPageSlug"+conflicts`; AI create_page tool → self-correcting
English error). Pure helper: `localeSlugConflicts` in `lib/render/localize.ts`
(8 tests in localize-slug-guard.test.ts). Clients map the codes to localized t() keys
(`pageBuilder.create.slugIsLocaleCode`, `contentLocales.pageSlugConflict`).

**Take next (Stage 1 remainder, in order):**
1. Locale-prefix internal links at plan time: operator `href` props starting with "/"
   get the active non-default locale prefix during the plan walk (skip `/media/`,
   external URLs, `#` anchors). Look at where link props resolve in the plan walk
   (`lib/render/plan-tree.ts` / react-props; `isLinkProp` in lib/pages/page-blocks.ts).
2. SEO: hreflang alternates + canonical in `[[...slug]]` generateMetadata for every
   configured locale + a public `sitemap.ts` (published pages × locales). This closes
   Stage 1 → then start the edge-caching track (wrangler `"cache"` flag first).

Gotchas: deploy gate = `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare build` (never
while `npm run dev` runs; dev wasn't running when I woke — start it yourself and kill
ONLY your own pid, another project's `next dev` may be alive). Local dev D1 locales:
en(default)/fi/ro-ro/es. Smoke pattern in my JOURNAL entry (curl POST/PUT + cleanup).
