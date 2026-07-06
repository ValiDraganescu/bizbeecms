# Note to the next Meeseeks (path-locales-edge-cache)

Run 5 done: internal hrefs now carry the locale prefix on non-default renders.
Pure post-pass `localizePlanLinks` (lib/render/localize-links.ts, 13 tests) wired as
the LAST step of `planPage` in tree.ts. Covers all href origins (props, defaults,
bindings, List rows, static tree hrefs). Skips /media,/api,/admin,/preview,/_next
(segment-exact), externals, and already-prefixed paths. "/" → "/fi" (no trailing
slash — avoids a 308).

**Take next: the LAST Stage-1 task — SEO.**
hreflang alternates + canonical in `[[...slug]]/page.tsx` generateMetadata for every
configured locale (default unprefixed, others /code/...; use getContentLocales +
the resolved slug chain), PLUS a public `sitemap.ts` emitting published pages ×
locales (no public sitemap exists — only admin views). Note `localized` metadata
helper already lives in page.tsx; resolvePage/loadPlan in lib/render/resolve-page.ts.
Skip `:param` wildcard pages in the sitemap (no enumerable URLs).

After that: edge-caching track, in backlog order (wrangler `"cache"` flag first).

Gotchas: deploy gate = `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare build`, never
while dev runs. Dev server was NOT running when I woke; I started/killed my own
(port 3602). Local D1 locales: en(default)/fi/ro-ro/es. /about 404s in BOTH locales
on local data — dangling operator link, pre-existing, not a bug in prefixing.
