# Note to the next Meeseeks (seo-robots)

**THIS RUN (2026-07-07): OG-image serving + metadata precedence (DONE, track item 2/4).**
Pure `resolveOgImageUrl` (og-image.ts) = manual metaImage ?? auto `og/<id>.<locale>.png` (if exists)
?? none, absolutized via resolveSiteOrigin. Serve route `app/api/og/[...key]/route.ts` (isOgImageKey-
guarded, /api = catch-all-safe + SKIP_SEGMENT, max-age=3600 non-immutable). Wired into
`generateMetadata`: probes R2 for the auto image ONLY when no manual image (one R2 read on the
METADATA path, not the render hot path). twitter:card auto-counts it (no social-cards change).
+8 tests, suite 1930, tsc clean. See the new "OG-image PRECEDENCE + serving" CAVEAT. Live R2 = HITL.

**Pick the highest-value GOAL slice (ranked):**
1. **OG-image autogen — CONTINUE the track (2 items left, do 1b NEXT):**
   b. **Publish wiring** (do this next): on publish, per configured locale, IF no manual metaImage AND no
      `og/<id>.<locale>.png` exists → `ctx.waitUntil(screenshotPageToR2(absPageUrl, ogImageKey(id,loc)))`;
      page delete removes its `og/` objects. Best-effort, never blocks the publish.
   c. **Regenerate button** — per-locale "Generate from page" SEO-tab action (API route, stable
      error codes) + effective-og:image manual/auto badge, localized EN/FI/ET.
2. **Naughty-robot rate limiting** (2 items) — the last untouched GOAL track; needs worker.ts
   (release-gated r-*): Workers rate-limiting binding, 429+Retry-After over the cap on public page
   paths only (reuse the isEdgeCacheCandidate gate), per-site threshold OFF the hot path (in-isolate
   cache w/ TTL, no per-request D1). Note: worker.ts now already injects REQUEST_PATH_HEADER on
   GETs — the rate-limit gate slots in near there.
3. **Purge SITEMAP+LLMS cache tags on content-locales save** (scrub-queued small task) — the
   content-locales PUT purges only PAGES_CACHE_TAG today; a locale add/remove leaves the
   edge-cached /sitemap.xml + /llms.txt stale up to max-age.
4. **AI "fix missing alt" path** (lower-value) — `audit_alt` read tool + guide line; component-
   internal alt lives in the component `html` column so a fixer needs `update_component`.

**HITL / release-pending (accumulating — needs a real deployed site + a release cut):**
- OG-image live screenshot (paid plan + BROWSER binding + install @cloudflare/puppeteer).
- Per-URL-locale branded 404 — on a deployed Site with a designated 404 page + a non-default
  content locale: `/fi/<missing>` renders the branded 404 in fi, `/missing` in the default locale.
- /sitemap.xml edge cache — `cf-cache-status: HIT` on a second fetch; a page publish busts it.
- SEO-audit deep scan live render; ItemList JSON-LD + Google Rich Results validation; builder chip
  live check; responsive images live `/media/<key>?w=640` + `<img srcset>`; `.md` variant caching;
  /llms.txt cached + purge; live IndexNow/edge-purge; AI generate_image live dims round-trip.
- NOTE: `scripts/live-ds-context-chip-check.mjs` is a MANUAL live-Chrome check (dev on :3602) —
  exclude it from the pure suite count.
