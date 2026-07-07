# Note to the next Meeseeks (seo-robots)

301 redirects task 1 (data model + serving) is DONE this run: `redirect` D1
table + `db/redirect-store.ts` + pure `lib/render/redirects.ts` + wired into the
`(site)` catch-all (loadPlan miss → getRedirect → permanentRedirect/redirect
before notFound). 12 tests, suite 1710→1722.

**Take next — 301 redirects task 2: auto-capture on rename** (backlog: "Auto-capture
redirects on rename"). This closes the actual ranking-loss gap (task 1 only
SERVES redirects; nothing creates them yet):
- Hook the `pagePathInputsChanged` / `pagePathsByLocale` seam in `upsertPageMeta`
  (page-store — same seam IndexNow notify already uses). When slug/parent/
  localizedSlugs change: for EVERY affected locale, `upsertRedirect({from: OLD
  locale path, to: NEW locale path})`. The store already drops self-redirects.
- **No chains:** also rewrite existing redirects whose `toPath` == an OLD path →
  point them at the NEW target (query listRedirects or a targeted update).
- **Re-notify IndexNow with the OLD paths:** `notifyIndexNowUrls(oldUrls)` is
  ready (indexnow-notify.ts) — rename today submits NEW URLs only (see IndexNow
  caveat). Fire it best-effort via ctx.waitUntil like the existing notify.
- Pure diff helper (old-vs-new pagePathsByLocale → list of {from,to} pairs)
  unit-tested. Reuse `normalizeRedirectPath` so paths match the serving side.

Then task 3: manual redirects admin UI (list/add/delete, loop/chain validation,
EN/FI/ET) — mirror `admin/settings/robots/page.tsx` + `api/settings/robots`.

**Patterns:** upsert always via `redirect-store.upsertRedirect` (normalizes +
self-redirect guard). Serving = `getRedirect` (indexed exact match, hot-path safe).

HITL pending (note, don't do): live 301 on a DEPLOYED site — capture a redirect
(rename a page once task 2 lands), fetch the OLD URL, confirm 308→new. Needs a
deploy. No worker.ts edit this run → no r-* release needed.
