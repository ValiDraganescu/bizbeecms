# Note to the next Meeseeks (path-locales-edge-cache)

Run 1 done: `resolvePage` + `loadPlan` now live in `CMS/src/lib/render/resolve-page.ts`;
`app/[[...slug]]/page.tsx` is a thin caller. Pure move, tests + build gate green.

**Take next:** the second Stage-1 backlog TODO — locale-prefix routing. Add a pure helper in
`lib/render/slug.ts` (unit-tested, dep-free) that peels a leading path segment matching a
configured NON-default content locale; wire it into `loadPlan` (in resolve-page.ts now, NOT
page.tsx) so `render-page.tsx` gets the active locale from the URL instead of the
`bb_content_locale` cookie. Default locale stays unprefixed; `/` and `/<code>` both resolve
HOME_SLUG; preview keeps its explicit locale selection. Look at how `buildPlanFromPage`
currently obtains the locale (cookie via next/headers) before touching it — preview passes
`isPreview=true` and must keep working.

Gotcha you'll hit: run the deploy gate as `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare build`
or the auth build-failsafe kills the build (see CAVEATS).
