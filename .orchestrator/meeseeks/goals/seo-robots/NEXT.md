# Note to the next Meeseeks (seo-robots)

**TWO parallel runs landed on 2026-07-07 (driver merged the lane-B worktree) — TWO TRACKS CLOSED:**

1. **OG-image track CLOSED (items 3/4 + 4/4 DONE).** Publish wiring: pure `planOgScreenshots` +
   `ogImageKeysForLocales` (og-image.ts) + coupled shell `og-image-notify.ts`
   (`generateOgImagesForPage`/`deleteOgImagesForPage`) wired into publish POST + pages DELETE,
   best-effort `ctx.waitUntil`, no-op without the BROWSER binding. Regenerate button:
   `regenerateOgImageForPage` (force-shoot, manualWins guard, stable codes) + `api/pages/[id]/og-image`
   (POST regenerate+purge, GET badge status) + SEO-tab `OgAutoImage` (manual/auto/none badge +
   button), EN/FI/ET. Full opennext build green (`CMS_DEV_SUPERADMIN=0` per the CAVEAT). See the
   "OG-image PUBLISH WIRING" + "OG REGENERATE button" CAVEATs. Live screenshot round-trip = HITL.
2. **Naughty-robot rate-limit track CLOSED (item 2/2 DONE).** D1 setting `rate_limit_preset`
   (off/normal/strict, default normal) + settings UI at /admin/settings/rate-limit (EN/FI/ET);
   worker.ts gates the limiter via a 30s in-isolate TTL cache (no per-request D1 on the hot gate);
   `off` skips `limit()`, `strict` layers an in-isolate 40/60s counter on the fixed 100/60s binding.
   See the two "Per-site rate-limit THRESHOLD" CAVEATs. Release-gated (worker.ts, r-*).

**Pick the highest-value GOAL slice (ranked):**
1. **Purge SITEMAP+LLMS cache tags on content-locales save** (scrub-queued, small): the
   content-locales PUT (`api/settings/content-locales`) purges only PAGES_CACHE_TAG; a locale
   add/remove leaves edge-cached /sitemap.xml + /llms.txt stale up to max-age. One-line purge
   extension + update the two edge-cache CAVEATs' purge-coverage lists.
2. **AI "fix missing alt" path** (lower-value): `audit_alt` read tool + guide line; alt lives in
   block props / component `html`, so a fixer drives `set_block_props` / `update_component`.
3. If the backlog is empty beyond these, check BACKLOG.md for anything the curator queued since —
   otherwise invent the next valuable slice toward GOAL.md (verify against the journal first).

**HITL / release-pending (accumulating — needs a deployed Site + a release cut):**
- OG-image LIVE screenshot round-trip: PAID plan + `npm i @cloudflare/puppeteer` +
  `"browser": {"binding":"BROWSER"}` in CMS/wrangler.jsonc (typegen after) + deployed R2. Then:
  publish auto-generates `og/<id>.<loc>.png`, delete cleans up, serve route + precedence +
  twitter:card upgrade round-trip, regenerate button 503→success transition.
- Naughty-robot rate limit — 429 + `Retry-After:60` over the cap per IP on a deployed Site (paid
  plan for the binding); off/strict preset behavior + 30s cache propagation.
- Per-URL-locale branded 404 — `/fi/<missing>` renders the branded 404 in fi on a deployed Site.
- /sitemap.xml + /llms.txt edge cache — `cf-cache-status: HIT` on a 2nd fetch; page publish busts it.
- SEO-audit deep scan live render; ItemList JSON-LD + Google Rich Results validation; builder chip
  live check; responsive images live `/media/<key>?w=640` + `<img srcset>`; `.md` variant caching;
  live IndexNow/edge-purge; AI generate_image live dims round-trip.
- NOTE: `scripts/live-ds-context-chip-check.mjs` is a MANUAL live-Chrome check — exclude it from
  the pure suite count.
