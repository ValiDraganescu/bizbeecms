# Note to the next Meeseeks (seo-robots)

**Just landed (2026-07-07, lane-B worktree):** Naughty-robot rate limiting item 1/2 — DONE.
Worker-level per-IP rate limit on public page GETs. `unsafe.bindings` binding `PUBLIC_RATE_LIMITER`
(100 req/60s) in wrangler.jsonc; worker.ts checks it BEFORE OpenNext via pure `isRateLimitCandidate`
(reuses the SKIP_SEGMENTS + dotted-root gate); 429 + Retry-After over the cap; key = CF-Connecting-IP.
Verified-crawler exemption `isVerifiedCrawler(cf)` present but Bot-Management-gated (usually absent
Free/Pro → limiter applies). Best-effort/fails-open. Release-gated (r-*). See the new "Naughty-robot
rate limiting" CAVEAT. +13 tests, suite 1932.

**A PARALLEL run this cycle worked the OG-image serving/precedence task in the MAIN checkout — check
the merged JOURNAL/BACKLOG for its landing before picking OG work (don't redo it).**

**Pick the highest-value GOAL slice (ranked):**
1. **Per-site rate-limit threshold (item 2/2 of this track):** D1 setting (Off / presets) +
   site-settings UI, read by worker.ts WITHOUT a per-request D1 read on the hot path — in-isolate
   cache w/ TTL, or piggyback an existing lookup (the edge-cache "extra D1 only on cache miss"
   precedent). Localized EN/FI/ET. The `simple.limit` in wrangler.jsonc is a FIXED binding value —
   a per-site OVERRIDE would gate the worker check on the D1 setting (skip `limit()` when Off, or
   apply a stricter in-worker counter when a lower preset is set). NOTE the binding period is fixed
   at deploy time — a true per-site *period* would need multiple bindings or a custom counter (KV/DO).
2. **OG-image autogen track** (if the parallel run didn't finish it): publish wiring (best-effort
   ctx.waitUntil screenshot on publish per locale when no manual metaImage + no og/ object) →
   regenerate button (SEO-tab action + manual/auto badge, EN/FI/ET). Serving+precedence may already
   be DONE by the parallel run — verify first.
3. **Purge SITEMAP+LLMS cache tags on content-locales save** (scrub-queued small task): the
   content-locales PUT purges only PAGES_CACHE_TAG; a locale add/remove leaves the edge-cached
   /sitemap.xml + /llms.txt stale up to max-age. One-line purge extension + update the two
   edge-cache CAVEATs' purge-coverage lists.
4. **AI "fix missing alt" path** (lower-value): `audit_alt` read tool + guide line; component-internal
   alt lives in the component `html` column so a fixer needs `update_component`.

**HITL / release-pending (accumulating — needs a deployed Site + a release cut):**
- Naughty-robot rate limit — 429 + `Retry-After:60` over 100 req/60s per IP on a deployed Site
  (needs a paid plan for the rate-limit binding); verified-crawler exemption only observable on a
  Bot-Management Site.
- OG-image live screenshot (paid plan + BROWSER binding + `npm i @cloudflare/puppeteer`).
- Per-URL-locale branded 404 (`/fi/<missing>` → fi, `/missing` → default).
- /sitemap.xml + /llms.txt edge cache HIT + publish-busts; `.md` variant caching; responsive images
  live `/media/<key>?w=640` + `<img srcset>`; live IndexNow/edge-purge; AI generate_image dims.
- NOTE: `scripts/live-ds-context-chip-check.mjs` is a MANUAL live-Chrome check — exclude from the
  pure suite count.
