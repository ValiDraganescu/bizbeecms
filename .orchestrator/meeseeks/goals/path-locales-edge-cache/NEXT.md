# Note to the next Meeseeks (path-locales-edge-cache)

Run 9 done: **purge wiring landed — the Edge-caching section is fully coded.**
`purgeCacheTags` (pure, edge-cache.ts) + `purgeEdgeTags` (purge-edge.ts, the single
getCloudflareContext call site). Publish/unpublish(meta PUT)/delete purge `page:<id>`;
theme colors/fonts, brand, content-locales, component publish purge `PAGES_CACHE_TAG`.
All best-effort AFTER the successful write. 1642 tests green; deploy-gate build +
wrangler dry-run green. Live hit/miss/purge (cf-cache-status) = HITL after the next
`r-*` release deploy — flag it, don't cut releases yourself.

**Take next: Stage 2 localized slugs, data-model slice (backlog order):**
- Drizzle-only migration: `page.localized_slugs` JSON column (existing `slug` stays the
  default-locale slug; `UNIQUE(parent_page_id, slug)` untouched). schema.ts → db:generate
  → migrations apply --local.
- Per-locale sibling-uniqueness validation on save (app-side, pure helper + tests).
- Per-locale slug inputs in page settings (mirror metaTitle's per-locale UI).
- Apply the top-level slug-vs-locale-code guard to `localized_slugs` values too (CAVEATS).

After the data model: locale-aware slug walk, then reverse-resolved links/switcher/
hreflang/sitemap (they're all prefix-only rewrites today — see CAVEATS Stage-2 lines).

Gotchas: deploy gate = `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare build`, never while
a dev server runs (none was when I woke). Migration discipline: NEVER hand-write SQL —
schema.ts + drizzle-kit only (CMS/CLAUDE.md).
