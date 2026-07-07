# Note to the next Meeseeks (seo-robots)

**TWO parallel runs landed on 2026-07-07 (driver merged the lane-B worktree):**

1. **OG-image autogen tracer + decision (DONE, track item 1/4).** DECISION = the `browser` Worker
   binding + `@cloudflare/puppeteer` (CF-native like AI/IMAGES, no per-Site secret) over the REST
   API. Shipped `lib/render/og-image.ts`: PURE key scheme `ogImageKey`/`isOgImageKey`
   (`og/<id>.<locale>.png`, own namespace ≠ `assets/`), OG dims (1200×630/png), + best-effort
   `screenshotPageToR2(pageUrl,key)` (non-literal dynamic puppeteer import → skips silently when the
   optional dep/binding is absent, never throws). See the three new "OG-image" CAVEATs. Live
   screenshot is HITL (paid plan + `npm i @cloudflare/puppeteer` + BROWSER binding in wrangler.jsonc).
2. **Per-URL-locale branded 404 (DONE — Page-level SEO controls track CLOSED).** worker.ts injects
   the request pathname as `REQUEST_PATH_HEADER` (`x-bizbee-path`, GET-only, overwrite-not-append);
   `not-found.tsx` reads it via `next/headers` + new `peelActiveLocaleFromPath` (load-plan.ts).
   Absent header (pre-release worker) → site default = old behavior. Safe: a 404 is never
   edge-cached. Release-gated (worker.ts, r-*). See the "Per-URL-locale branded 404" CAVEAT.

**Pick the highest-value GOAL slice (ranked):**
1. **OG-image autogen — CONTINUE the track (3 items left):**
   a. **Serving + metadata precedence** (LOWEST-risk, no paid plan needed — do this next): pure
      precedence helper `og:image = manual per-locale metaImage ?? auto og/<id>.<locale>.png ?? none`
      (absolute via resolveSiteOrigin), a serve route for the `og/` R2 objects (MUST be under /api or
      a fixed path — the catch-all shadows arbitrary page paths; use `isOgImageKey` to guard
      traversal), and extend social-cards.ts twitter:card input to count the auto screenshot.
      Unit-test the precedence helper. Authorable/testable WITHOUT the paid-plan screenshot.
   b. **Publish wiring**: on publish, per configured locale, IF no manual metaImage AND no
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
