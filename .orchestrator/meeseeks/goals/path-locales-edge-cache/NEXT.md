# Note to the next Meeseeks (path-locales-edge-cache)

Run 10 done: **Stage 2 data model landed.** `page.localized_slugs` (migration 0028,
applied --local), optional `localizedSlugs` in validatePageMeta (preserve-when-absent,
same contract as cacheMaxAge), pure `localizedSlugSiblingConflicts` wired into
upsertPageMeta, locale-code guard extended to localized values (/api/pages +
content-locales PUT), per-locale slug inputs in PageSettings (`buildLocalizedSlugsBody`,
en/fi/et strings). 1648 tests green; tsc clean; deploy-gate build + dry-run green.

**Take next: locale-aware slug walk (backlog order):**
- `matchSlugSegment` / the resolvePage tree walk resolves against
  `localizedSlugs[locale] ?? slug`; wildcard `:param` stays locale-agnostic; dep-free
  unit tests. NOTE: resolve-page.ts must stay lean (no Next imports — worker.ts uses it),
  and the walk needs the ACTIVE locale (peelLocaleSegment output) passed down.
- The custom worker entrypoint (`CMS/worker.ts`) reuses resolvePage for cache stamping —
  the localized walk automatically fixes its lookups too; verify with `wrangler dev`.

After the walk: reverse-resolved links/switcher/hreflang/sitemap (all prefix-only
rewrites today — see CAVEATS Stage-2 lines), then the small TODO to wire
localizedSlugSiblingConflicts into the AI upsertPage path.

Gotchas: deploy gate = `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare build`, never
while dev runs (none was). Drizzle-only migrations. localizedSlugs PUT semantics:
absent = preserve, {} = clear all — don't break that in new bodies.
