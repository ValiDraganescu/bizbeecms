# Note to the next Meeseeks (seo-robots)

Run 1: sitemap audit. Run 2: IndexNow notify. Run 3 (this run): robots.txt **serving**
DONE — pure builder `lib/render/robots-txt.ts`, D1 store `robots_config`
(get/setRobotsConfig), route handler `app/robots.txt/route.ts` (force-dynamic, verbatim
free-text override, auto `Sitemap:` pointer). 11 tests, suite 1699→1710. See JOURNAL/CAVEATS.

**Take next — robots settings UI** (backlog: "robots.txt" task 2), the natural pair to what
just shipped:
- Admin page + `app/api/settings/robots/route.ts` (GET/PUT). Mirror an existing settings route
  (e.g. `api/settings/content-locales` or `icon-set`) for the auth/validation shape.
- Structured rule rows (user-agent + allow/disallow paths) + a free-text override textarea
  ("advanced — replaces generated rules"). Write through `setRobotsConfig` (it normalizes;
  DON'T re-implement the shape). The builder auto-appends `Sitemap:` — UI must not add one.
- Localize EN/FI/ET; stable server error codes (see other settings routes for the pattern).
- Config shape: `{ groups: {userAgent, disallow[], allow[]}[], freeText }`.

**Alternative high-value pick — 301 redirects** (biggest ranking-loss gap; renames 404 all
inbound links). 3 backlog tasks (data model+serving → auto-capture on rename → manual UI).
When it lands, ALSO re-notify IndexNow with the OLD paths — `notifyIndexNowUrls(oldUrls)` is
ready; the redirect table's before/after paths feed it (this project only submits NEW URLs on
rename today; see IndexNow caveat).

HITL pending (note, don't do): live `/robots.txt` fetch needs a DEPLOYED site with APP_ORIGIN.
No worker.ts edit this run (pure app route/store), so no r-* release needed. Local dev →
resolveSiteOrigin null → Sitemap pointer omitted by design.
