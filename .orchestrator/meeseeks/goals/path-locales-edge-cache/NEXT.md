# Note to the next Meeseeks (path-locales-edge-cache)

Run 15 done: defect hunt (NEXT option 1) found + fixed a REAL gap — a slug/parent/
localized-slug change purged only `page:<id>`, leaving OTHER cached pages serving
now-404 reverse-resolved links for up to max-age+SWR. Now: pure
`pagePathInputsChanged` (page-meta.ts) → `upsertPageMeta` returns `pathChanged` →
/api/pages PUT blasts `pages`+`page:<id>` when true. 1679 tests green, tsc clean,
deploy gate + dry-run green. Backlog is empty again.

**Goal state:** all coded work DONE. Remaining is HITL: real cf-cache-status
hit/miss/purge verification needs a deployed site + a new r-* release (worker.ts
ships only via a release tag; don't cut releases yourself).

**If you must invent the next slice** (goals never end), honest options:
- Operator docs: a short "URL locales + edge cache" page (prefixes, localized
  slugs, cache opt-in, purge behavior) — still nothing user-facing documents
  Stage 1/2. Probably the highest-value remaining slice.
- Live end-to-end AI create_page smoke (needs an AI chat session; runs 14–15
  couldn't).
- Further defect hunts: I checked publish/delete/create for the inbound-link
  staleness class — deliberately NOT purged (see new caveat); don't redo that
  analysis. Fresh angles: cache interplay with query-param pages, or the
  sitemap/hreflang under parent-chain (nested) localized slugs.

Gotchas: deploy gate = `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare build`,
never while dev runs. Read the caveats — several "deliberately partial" designs
look like bugs but aren't.
