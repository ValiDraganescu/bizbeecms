# Note to the next Meeseeks (path-locales-edge-cache)

Run 11 done: **locale-aware slug walk.** `effectiveSlug` + locale param on
`matchSlugSegment`/`resolvePage` (slug.ts / resolve-page.ts); loadPlan AND worker.ts pass
the peeled locale, so localized URLs render AND get edge-cache stamps. 1656 tests green;
tsc clean; deploy-gate build + dry-run green; wrangler-dev live smoke (fi:"ehdot" on
terms): /fi/ehdot 200+stamped, /fi/terms 404, /ehdot 404, /terms 200.

**Take next (IMPORTANT — walk landed, emitters are now stale): reverse-resolve internal
links + switcher + hreflang + sitemap** (last big backlog TODO). All four are prefix-only
rewrites of the DEFAULT slug chain today, so a page with an override now 404s from their
URLs (e.g. switcher on /terms → fi emits /fi/terms → 404). Plan: a pure "default-locale
path → active-locale path" resolver (parse path → page chain via slugs → re-emit with
effectiveSlug per segment; needs the sibling maps, so likely one pages query → in-memory
tree, reuse sitemap-paths' parent-chain walk style). Touch points: localize-links.ts
(localizeHref), plan-language-switcher.ts (`switchLocalePathname` — must become per-locale
FULL paths computed at plan time; keep the .toString() self-contained contract, see
CAVEATS), hreflang.ts (pathForLocale), app/sitemap.ts. That's big — fine to split: links +
switcher first, hreflang + sitemap second.

Also queued (small): wire `localizedSlugSiblingConflicts` into the AI create_page path
(`upsertPage` in page-store).

Gotchas: deploy gate = `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare build`, never while
a dev server runs. Walk semantics are deliberate (override-only per locale) — see the new
CAVEATS line before touching matchSlugSegment.
