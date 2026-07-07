# Note to the next Meeseeks (seo-robots)

**TWO parallel runs landed on 2026-07-07 (driver merged the lane-B worktree):**

1. **OG-image serving + metadata precedence (DONE, OG track item 2/4).** Pure `resolveOgImageUrl`
   (og-image.ts) = manual metaImage ?? auto `og/<id>.<locale>.png` (if exists) ?? none, absolutized
   via resolveSiteOrigin. Serve route `app/api/og/[...key]/route.ts` (isOgImageKey-guarded, /api =
   catch-all-safe + SKIP_SEGMENT, max-age=3600 non-immutable). `generateMetadata` probes R2 for the
   auto image ONLY when no manual image (metadata path, not the render hot path). twitter:card
   auto-counts it. See the "OG-image PRECEDENCE + serving" CAVEAT. Live R2 = HITL.
2. **Naughty-robot rate limiting item 1/2 (DONE).** `unsafe.bindings` `PUBLIC_RATE_LIMITER`
   (100 req/60s) in wrangler.jsonc; worker.ts checks it BEFORE OpenNext via pure
   `isRateLimitCandidate` (reuses SKIP_SEGMENTS + dotted-root gate); 429 + Retry-After over the cap;
   key = CF-Connecting-IP; `isVerifiedCrawler(cf)` exemption (Bot-Management-gated, usually absent
   Free/Pro). Best-effort/fails-open. Release-gated (r-*). See the "Naughty-robot rate limiting"
   CAVEAT.

**Pick the highest-value GOAL slice (ranked):**
1. **Per-site rate-limit threshold (rate-limit item 2/2):** D1 setting (Off / presets) +
   site-settings UI, read by worker.ts WITHOUT a per-request D1 read on the hot path — in-isolate
   cache w/ TTL, or piggyback an existing lookup. Localized EN/FI/ET. The `simple.limit` in
   wrangler.jsonc is FIXED at deploy time — a per-site OVERRIDE gates the worker check on the D1
   setting (skip `limit()` when Off, or stricter in-worker counter for a lower preset); a true
   per-site *period* would need multiple bindings or a custom counter (KV/DO).
2. **OG-image publish wiring (OG track item 3/4):** on publish, per configured locale, IF no manual
   metaImage AND no `og/<id>.<locale>.png` exists → `ctx.waitUntil(screenshotPageToR2(absPageUrl,
   ogImageKey(id,loc)))`; page delete removes its `og/` objects. Best-effort, never blocks the
   publish. Then **item 4/4: regenerate button** (SEO-tab per-locale action + manual/auto badge,
   EN/FI/ET).
3. **Purge SITEMAP+LLMS cache tags on content-locales save** (scrub-queued small task): the
   content-locales PUT purges only PAGES_CACHE_TAG; a locale add/remove leaves the edge-cached
   /sitemap.xml + /llms.txt stale up to max-age. One-line purge extension + update the two
   edge-cache CAVEATs' purge-coverage lists.
4. **AI "fix missing alt" path** (lower-value): `audit_alt` read tool + guide line; component-
   internal alt lives in the component `html` column so a fixer needs `update_component`.

**HITL / release-pending (accumulating — needs a deployed Site + a release cut):**
- Naughty-robot rate limit — 429 + `Retry-After:60` over 100 req/60s per IP on a deployed Site
  (needs a paid plan for the rate-limit binding); verified-crawler exemption only observable with
  Bot Management.
- OG-image live screenshot (paid plan + BROWSER binding + `npm i @cloudflare/puppeteer`) + live R2
  serve/precedence round-trip.
- Per-URL-locale branded 404 — `/fi/<missing>` renders the branded 404 in fi on a deployed Site.
- /sitemap.xml edge cache — `cf-cache-status: HIT` on a second fetch; a page publish busts it.
- SEO-audit deep scan live render; ItemList JSON-LD + Google Rich Results validation; builder chip
  live check; responsive images live `/media/<key>?w=640` + `<img srcset>`; `.md` variant caching;
  /llms.txt cached + purge; live IndexNow/edge-purge; AI generate_image live dims round-trip.
- NOTE: `scripts/live-ds-context-chip-check.mjs` is a MANUAL live-Chrome check (dev on :3602) —
  exclude it from the pure suite count.
