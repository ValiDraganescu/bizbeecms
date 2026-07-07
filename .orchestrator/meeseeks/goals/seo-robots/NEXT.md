# Note to the next Meeseeks (seo-robots)

**This run (2026-07-07): AI "fix missing alt" path DONE** — `audit_alt` no-arg read tool
(meta-tools.ts `AUDIT_ALT_TOOL` + tool-dispatch `handleAuditAlt`, deep-scan via
`buildComponentSeoIndex(listComponents())`, dedup slug+src, fix `hint`), registered in tool-scopes
(KNOWN_TOOL_NAMES + page-builder & pages scopes) with guide lines in both prompts so the AI drives
`set_block_props` (block-prop images) / `update_component` (component-markup images). Build gate
green, full suite 1955 pass. See the two new CAVEATs (impeccable `<img>`-in-prose false positive;
audit_alt fix-path split).

**Also in flight this same day:** a PARALLEL Meeseeks in the MAIN checkout was taking the
**content-locales cache-purge** task (item 1 of the previous NEXT — `api/settings/content-locales`
also purging SITEMAP + LLMS cache tags). Assume it's DONE after the driver merges; VERIFY against
JOURNAL/BACKLOG before touching it — don't redo it.

**Pick the highest-value GOAL slice (ranked):**
1. If the content-locales cache-purge did NOT land (check JOURNAL) → take it: the content-locales PUT
   purges only PAGES_CACHE_TAG; a locale add/remove leaves edge-cached /sitemap.xml + /llms.txt stale
   up to max-age. One-line purge extension + update the two edge-cache CAVEATs' purge-coverage lists.
2. Otherwise invent the next valuable slice toward GOAL.md (verify against the JOURNAL first). Nearly
   every named track is closed or HITL-pending — look for correctness seams (sitemap staleness,
   IndexNow coverage on more write paths) or an AI/operator UX gap in the SEO surface.
3. Check BACKLOG.md for anything the curator queued since.

**HITL / release-pending (accumulating — needs a deployed Site + a release cut):**
- OG-image LIVE screenshot round-trip: PAID plan + `npm i @cloudflare/puppeteer` +
  `"browser": {"binding":"BROWSER"}` in CMS/wrangler.jsonc (typegen after) + deployed R2. Then
  publish auto-gen / delete cleanup / serve+precedence / twitter:card upgrade / regenerate 503→ok.
- Naughty-robot rate limit — 429 + `Retry-After:60` over cap per IP (paid plan for the binding);
  off/strict preset + 30s cache propagation on a deployed Site.
- Per-URL-locale branded 404 — `/fi/<missing>` renders the branded 404 in fi on a deployed Site.
- /sitemap.xml + /llms.txt edge cache — `cf-cache-status: HIT` on 2nd fetch; publish busts it.
- SEO-audit deep scan live render; ItemList JSON-LD + Google Rich Results validation; builder chip
  live check; responsive images live `/media/<key>?w=640` + `<img srcset>`; `.md` variant caching;
  live IndexNow/edge-purge; AI generate_image live dims round-trip.
- NOTE: `scripts/live-ds-context-chip-check.mjs` is a MANUAL live-Chrome check — exclude from the
  pure suite count.

**Build/test reminders:** deploy gate = `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare build`
(guard OFF — env override, per CAVEAT); never while `npm run dev` runs. Pure suite = `npm test`
(1955 as of this run). The 4 `CloudflareEnv.DB` tsc errors are PRE-EXISTING typegen drift — ignore.
