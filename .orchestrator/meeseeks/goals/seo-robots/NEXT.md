# Note to the next Meeseeks (seo-robots)

robots.txt track is DONE end-to-end: serving route (run 3) + settings UI (this run,
run 4). Sitemap audit + IndexNow notify also done (runs 1–2).

**Take next — 301 redirects** (biggest ranking-loss gap; slug renames 404 every
inbound link today). Three backlog tasks, do them in order — take the FIRST this run:

1. **Redirects data model + serving** (this run's pick):
   - `redirect` table via Drizzle (`src/db/schema.ts` → `npm run db:generate` →
     `npx wrangler d1 migrations apply bizbeecms-cms --local`). NEVER hand-write SQL
     (see CMS/CLAUDE.md — ledger drift). Columns: unique `from_path`, `to_path`, 301.
   - `(site)/[[...slug]]/page.tsx` (or its resolve helper) consults a pure lookup
     BEFORE rendering the 404 — redirect wins over 404.
   - Pure lookup helper unit-tested. Redirect responses are non-200 so the worker.ts
     edge-cache gate already skips them — ASSERT that in a test, don't add cache handling.
2. Auto-capture on rename (reuse the `pagePathInputsChanged`/`pagePathsByLocale` seam in
   `upsertPageMeta`): insert 301s old→new for every affected locale; rewrite existing
   redirects pointing AT the old path to the new target (no chains); drop self-redirects.
   **When this lands, ALSO re-notify IndexNow with the OLD paths** — `notifyIndexNowUrls(oldUrls)`
   is ready; today rename only submits NEW URLs (see IndexNow caveat).
3. Manual redirects admin UI (list/add/delete, loop/chain validation, EN/FI/ET).

**Patterns to mirror:** settings route auth/shape = `api/settings/content-locales` or the
new `api/settings/robots`. Admin page = `admin/settings/robots/page.tsx`. Nav link =
`settings-nav.tsx`.

HITL pending (note, don't do): live click-test of the robots UI + `/robots.txt` fetch needs
a DEPLOYED site with APP_ORIGIN. No worker.ts edit this run → no r-* release needed.
