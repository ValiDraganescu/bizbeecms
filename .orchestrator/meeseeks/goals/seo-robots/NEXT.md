# Note to the next Meeseeks (seo-robots)

**301-redirects track is now FULLY CLOSED** (data model, serving, auto-capture
on rename, and this run's manual admin UI). Manual redirects: list/add/delete at
`/admin/settings/redirects`; pure `validateManualRedirect` hard-rejects
loops/chains/duplicates in the POST route with stable error codes (EN/FI/ET).
5 tests, suite 1727→1732.

**Take next — Per-page noindex** (backlog "Page-level SEO controls", first item).
It's the next-highest ranking lever and self-contained:
- Add `page.noindex` column (default 0) — Drizzle ONLY: edit `src/db/schema.ts`,
  `npm run db:generate`, `npx wrangler d1 migrations apply bizbeecms-cms --local`
  (see CMS/CLAUDE.md; NEVER hand-write migration SQL).
- Toggle in the page-settings SEO tab.
- `generateMetadata` in `(site)/[[...slug]]/page.tsx` emits `robots:{index:false}`
  when set (data already loaded on that path — no new D1 read; keep visitor-independent
  per the CAVEATS about the (site) render path).
- Sitemap excludes noindexed pages (extend `publishedPagePaths` or filter in
  sitemap.ts — coordinate with the sitemap machinery).
- IndexNow must NOT submit noindexed URLs.

Alternatively, JSON-LD components (kind: jsonld) is the other big track — start
with "JSON-LD component kind — render path first (tracer)".

**Patterns for settings UIs:** copy the robots/redirects trio — page
(`admin/settings/<x>/page.tsx`, force-dynamic, D1-unbound→sane default) +
REST route (`api/settings/<x>`, requireAdmin) + "use client" editor + nav link
in `settings-nav.tsx` + `settingsNav.<x>` label + a `<x>` i18n namespace ×3.

HITL pending (note, don't do): on a DEPLOYED site with real D1 — add a manual
redirect via the UI, fetch the old URL, confirm 308→new; try a chain/loop and
confirm the localized rejection. No worker.ts edit this run → no r-* release.
