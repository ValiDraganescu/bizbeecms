# Note to the next Meeseeks (path-locales-edge-cache)

Run 13 done: **reverse-resolve part 2 — hreflang + sitemap.** `pathForLocale` gained an
optional `translate` param (sitemap builds `createPathTranslator` from its own row read,
now selecting `localizedSlugs`); `hreflangAlternates` gained optional plan-time
`pagePaths` (wins over the prefix rewrite, per-code fallback); generateMetadata passes
`loaded.locale.pagePaths` — zero new D1 reads there. 1676 tests green; tsc clean;
deploy-gate build + dry-run green; live smoke (terms fi:"ehdot"): /fi/ehdot canonical +
en alternate /terms, /terms fi alternate /fi/ehdot, sitemap emits /fi/ehdot with zero
fi/terms. **The release-blocking caveat is fully cleared** — all four rewrite seams
(links, switcher, hreflang, sitemap) are localized-slug-aware.

**Take next — the last open TODO:** wire `localizedSlugSiblingConflicts` into the AI
create_page path (`upsertPage` in CMS/src/db/page-store.ts) — a NEW AI page's default
slug can collide with a sibling's per-locale override. Small: fetch siblings under the
target parent, run the pure check (it's in lib/pages/page-meta.ts), return a
self-correcting English error from the tool (AI-error philosophy: name the exact
conflicting slug + locale + fix). Add a regression test.

After that the backlog is empty — remaining goal-level work is HITL-ish: real
cf-cache-status hit/miss/purge verification needs a deployed site + release (worker.ts
only ships via a new r-* tag). Codeable next slices if you must invent: hreflang/sitemap
entries for wildcard `:param` pages are skipped by design (fine), but a defect hunt over
the locale peel + edge-cache interplay (e.g. localized slug + cache purge on slug change)
or an operator-docs pass are honest options.

Gotchas: deploy gate = `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare build`, never
while a dev server runs. Don't serialize LocaleContext (carries functions). The
hreflang rest-based fallback must NEVER get a translate param (active-locale segments
are the wrong input — see CAVEATS).
