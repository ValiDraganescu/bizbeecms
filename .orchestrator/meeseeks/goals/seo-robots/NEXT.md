# Note to the next Meeseeks (seo-robots)

**Landed 2026-07-07 (this run): OG-image REGENERATE button (OG track item 4/4) DONE — OG TRACK CLOSED.**
- `regenerateOgImageForPage(id,locale)` (og-image-notify.ts, SYNCHRONOUS, force-shoots, skips the
  idempotency probe, refuses `manualWins`). Route `api/pages/[id]/og-image` (POST regenerate + purge
  pageCacheTag; GET status for the badge). SEO tab `OgAutoImage` sub-component: manual/auto/none badge +
  "Generate from page" button (disabled when manual set). Localized EN/FI/ET (14 keys). +6 tests
  (og-regenerate.test.mjs), suite 1949, tsc clean, FULL opennext build GREEN. See the "OG REGENERATE
  button" CAVEAT. Did NOT touch worker.ts/wrangler.jsonc (parallel Meeseeks owned them this cycle).

**Pick the highest-value GOAL slice (ranked):**
1. **Per-site rate-limit threshold (rate-limit item 2/2):** D1 setting (Off / presets) +
   site-settings UI, read by worker.ts WITHOUT a per-request D1 read on the hot path (in-isolate
   cache w/ TTL, or piggyback an existing lookup). Localized EN/FI/ET. FIRST re-check whether the
   parallel Meeseeks already delivered this — it was working worker.ts/wrangler.jsonc this cycle for
   exactly this task; if it's DONE in BACKLOG, skip to item 2.
2. **Purge SITEMAP+LLMS cache tags on content-locales save** (scrub-queued): the content-locales PUT
   (`api/settings/content-locales`) purges only PAGES_CACHE_TAG; a locale add/remove leaves
   edge-cached /sitemap.xml + /llms.txt stale up to max-age. One-line purge extension + update the two
   edge-cache CAVEATs' purge-coverage lists.
3. **AI "fix missing alt" path** (lower-value): `audit_alt` read tool + guide line; alt lives in block
   props / component `html`, so a fixer drives `set_block_props` / `update_component`.

**HITL / release-pending (accumulating — needs a deployed Site + a release cut):**
- OG-image LIVE screenshot round-trip: needs a PAID plan + `npm i @cloudflare/puppeteer` +
  `"browser": {"binding":"BROWSER"}` in CMS/wrangler.jsonc (typegen after) + deployed R2. Then verify
  publish auto-generates `og/<id>.<loc>.png` for no-manual-image locales, the SEO-tab "Generate from
  page" button reshoots on demand (skips idempotency), delete cleans them up, and the serve route +
  precedence + twitter:card upgrade round-trip. (Locally the button 503s `ogErrNoBinding` — expected.)
- Naughty-robot rate limit — 429 + `Retry-After:60` over the cap per IP on a deployed Site (paid plan
  for the rate-limit binding); verified-crawler exemption only observable with Bot Management.
- Per-URL-locale branded 404 — `/fi/<missing>` renders the branded 404 in fi on a deployed Site.
- /sitemap.xml + /llms.txt edge cache — `cf-cache-status: HIT` on a 2nd fetch; a page publish busts it.
- SEO-audit deep scan live render; ItemList JSON-LD + Google Rich Results validation; builder chip
  live check; responsive images live `/media/<key>?w=640` + `<img srcset>`; `.md` variant caching;
  live IndexNow/edge-purge; AI generate_image live dims round-trip.
- NOTE: `scripts/live-ds-context-chip-check.mjs` is a MANUAL live-Chrome check — exclude it from the
  pure suite count.
