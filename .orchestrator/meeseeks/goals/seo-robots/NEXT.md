# Note to the next Meeseeks (seo-robots)

**Landed 2026-07-07 (this run): OG-image PUBLISH WIRING (OG track item 3/4) DONE.**
- Pure `planOgScreenshots` + `ogImageKeysForLocales` (og-image.ts); coupled shell
  `og-image-notify.ts` (`generateOgImagesForPage`/`deleteOgImagesForPage`) wired into publish POST +
  pages DELETE. Best-effort/`ctx.waitUntil`, no-op without the BROWSER binding. See the "OG-image
  PUBLISH WIRING" CAVEAT. +6 tests, suite 1943, tsc clean. Live = HITL.
- Did NOT touch worker.ts/wrangler.jsonc (a parallel Meeseeks owned them for the per-site rate-limit
  threshold this cycle) — re-check they landed cleanly before editing them.

**Pick the highest-value GOAL slice (ranked):**
1. **OG-image REGENERATE button (OG track item 4/4 — CLOSES the OG track):** per-locale
   "Generate from page" action in the page-settings SEO tab. API route (stable error codes) that
   FORCE-screenshots on demand (reuse `screenshotPageToR2` + `ogImageKey`, but SKIP the existing-key
   idempotency probe — this is the explicit "refresh after a redesign" path, unlike the
   publish hook which only fills gaps). SEO tab shows the currently-effective og:image
   (`resolveOgImageUrl`) with a manual/auto badge. Localized EN/FI/ET.
2. **Per-site rate-limit threshold (rate-limit item 2/2):** D1 setting (Off / presets) +
   site-settings UI, read by worker.ts WITHOUT a per-request D1 read on the hot path (in-isolate
   cache w/ TTL, or piggyback an existing lookup). Localized EN/FI/ET. (Check whether the parallel
   Meeseeks already delivered this — it was working worker.ts/wrangler.jsonc this cycle.)
3. **Purge SITEMAP+LLMS cache tags on content-locales save** (scrub-queued): the content-locales PUT
   (`api/settings/content-locales`) purges only PAGES_CACHE_TAG; a locale add/remove leaves
   edge-cached /sitemap.xml + /llms.txt stale up to max-age. One-line purge extension + update the two
   edge-cache CAVEATs' purge-coverage lists.
4. **AI "fix missing alt" path** (lower-value): `audit_alt` read tool + guide line; alt lives in block
   props / component `html`, so a fixer drives `set_block_props` / `update_component`.

**HITL / release-pending (accumulating — needs a deployed Site + a release cut):**
- OG-image LIVE screenshot round-trip: needs a PAID plan + `npm i @cloudflare/puppeteer` +
  `"browser": {"binding":"BROWSER"}` in CMS/wrangler.jsonc (typegen after) + deployed R2. Then verify
  publish auto-generates `og/<id>.<loc>.png` for no-manual-image locales, delete cleans them up, and
  the serve route + precedence + twitter:card upgrade round-trip.
- Naughty-robot rate limit — 429 + `Retry-After:60` over the cap per IP on a deployed Site (paid plan
  for the rate-limit binding); verified-crawler exemption only observable with Bot Management.
- Per-URL-locale branded 404 — `/fi/<missing>` renders the branded 404 in fi on a deployed Site.
- /sitemap.xml + /llms.txt edge cache — `cf-cache-status: HIT` on a 2nd fetch; a page publish busts it.
- SEO-audit deep scan live render; ItemList JSON-LD + Google Rich Results validation; builder chip
  live check; responsive images live `/media/<key>?w=640` + `<img srcset>`; `.md` variant caching;
  live IndexNow/edge-purge; AI generate_image live dims round-trip.
- NOTE: `scripts/live-ds-context-chip-check.mjs` is a MANUAL live-Chrome check — exclude it from the
  pure suite count.
