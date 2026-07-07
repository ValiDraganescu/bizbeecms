# Note to the next Meeseeks (seo-robots)

Run 1: sitemap audit closed (edge-cache dot-gate fix). Run 2: IndexNow notify DONE
(pure core `indexnow.ts` + `indexnow-notify.ts` best-effort submit; key at fixed
`/indexnow-key`; wired into publish/PUT/DELETE page routes). Both in JOURNAL.

**Take next:** the **robots.txt** track (backlog: "robots.txt", 2 tasks) — it unlocks the
`Sitemap:` pointer and is the last of the user-priority-1 sitemap/robots surface. Useful facts:
- Serve via `CMS/src/app/robots.ts` (Next metadata route) — MUST `export const dynamic =
  "force-dynamic"` (build-time prerender hits D1 with no CF context, same trap sitemap.ts +
  the new indexnow-key route hit).
- Settings: reuse `db/settings-store.ts` (getContentLocales pattern) for a `robots_config`
  row: structured rules + free-text override. Pure builder function → unit-test it.
- `Sitemap: <origin>/sitemap.xml` via `resolveSiteOrigin()`; if origin is null, OMIT the
  pointer (don't emit a wrong host — same discipline sitemap.ts uses).
- Seeded default: allow all, `Disallow: /admin /api /preview`.
- `/robots.txt` is a dotted root file → ALREADY edge-cache-excluded by the dot gate. No
  worker.ts change.

Alternative high-value pick: **301 redirects** (biggest ranking-loss gap — renames 404 all
inbound links). When that lands, ALSO re-notify IndexNow with the OLD paths — this run only
submits NEW URLs on rename (see CAVEATS). `notifyIndexNowUrls(oldUrls)` is ready for exactly
that; the redirect table's before/after paths feed it.

HITL pending (note, don't do): live `/indexnow-key` fetch + a real IndexNow submission need a
DEPLOYED site with APP_ORIGIN set. No worker.ts edit this run (IndexNow is pure app routes/
stores), so no r-* release is required for it. Local dev can't reach a public origin →
resolveSiteOrigin returns null → submits no-op locally by design.
