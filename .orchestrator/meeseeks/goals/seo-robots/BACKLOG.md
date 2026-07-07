# Backlog — seo-robots
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks

### Page-level SEO controls
- DONE (2026-07-07): Per-URL-locale branded 404. worker.ts injects the incoming pathname as request
  header `REQUEST_PATH_HEADER` (`x-bizbee-path`, GET only, overwrite-not-append so it can't be
  spoofed) BEFORE the OpenNext handler; `not-found.tsx` reads it via `next/headers` and peels the
  content locale with new `peelActiveLocaleFromPath(pathname)` (load-plan.ts, sibling to
  peelActiveLocale but from a raw path string) → renders the designated 404 page in the visitor's URL
  locale (`/fi/missing` → fi). Absent header (pre-release worker / non-worker path) degrades to the
  site default locale = the old behavior. Safe despite the (site) cache-poison guard because a 404 is
  NEVER edge-cached (worker gate GET-200-only). +5 tests (edge-cache.test.ts branded-404 locale
  composition), suite 1919, tsc clean. Release-gated (worker.ts, r-*) — live HITL pending.

### OG-image autogen (fallback og:image via Browser Rendering — tracer/decision DONE, 3 impl items in order)
- TODO: OG-image fallback serving + metadata precedence (do FIRST — lowest-risk, needs no paid
  plan/binding, per NEXT): pure precedence helper `og:image = manual per-locale metaImage ?? auto
  `og/<id>.<locale>.png` ?? none` (absolute URL via resolveSiteOrigin); serving route for the R2
  `og/` objects (MUST live under /api or a fixed path — the catch-all shadows arbitrary paths; guard
  traversal with `isOgImageKey`); extend social-cards.ts twitter:card input to count the auto
  screenshot. Precedence helper unit-tested.
- TODO: OG-image autogen publish wiring: on page publish, for each configured locale, IF no manual per-locale metaImage AND no auto screenshot exists yet → best-effort background screenshot via `ctx.waitUntil` (never fails/delays the publish — purge-edge pattern); page delete removes its screenshots; auto image is stored SEPARATELY from user uploads and can never overwrite one.
- TODO: OG-image regenerate button: per-locale "Generate from page" action in the page-settings SEO tab (API route, stable error codes) that (re)screenshots on demand — the explicit path for refreshing after theme/content redesigns; SEO tab shows the currently effective og:image with a manual/auto badge; localized EN/FI/ET.

### Edge-cache purge coverage
- TODO: Purge `SITEMAP_CACHE_TAG` + `LLMS_CACHE_TAG` on content-locales settings save
  (`api/settings/content-locales` PUT currently purges only `PAGES_CACHE_TAG`): a locale add/remove
  changes /sitemap.xml (per-locale URLs + hreflang alternates) and /llms.txt (`{{locales}}` slot),
  both now edge-cached with their own tags → stale up to max-age after the write. One-line purge
  extension + update the purge-coverage lists in the two edge-cache CAVEATs. — queued by scrub:
  verified in repo that content-locales/route.ts:74 misses both tags while brand/llms PUTs purge theirs.

### Naughty-robot rate limiting (needs worker.ts, ships via release)
- DONE (2026-07-07): Worker-level per-IP rate limit on public page paths. `unsafe.bindings`
  rate-limit binding `PUBLIC_RATE_LIMITER` (100 req/60s per key) in CMS/wrangler.jsonc; worker.ts
  checks it BEFORE the OpenNext handler for public paths only via pure `isRateLimitCandidate`
  (reuses the SAME SKIP_SEGMENTS + dotted-root gate as isEdgeCacheCandidate), 429 + `Retry-After:60`
  + `no-store` over the cap; key = CF-Connecting-IP (→ "shared" fallback). Verified-crawler exemption
  `isVerifiedCrawler(cf)` — cf.verifiedBotCategory/botManagement.verifiedBot are Bot-Management-gated
  (usually absent Free/Pro → limiter still applies); no free cf flag today, reverse-DNS too heavy for
  the hot gate, so generous cap + free cf-exemption is the shipped default. Best-effort (fails OPEN).
  +13 tests (suite 1932), tsc clean. Release-gated (worker.ts/wrangler.jsonc, r-*) — live HITL pending.
- TODO: Per-site rate-limit threshold: D1 setting + site-settings UI (Off / presets), read by worker.ts WITHOUT a per-request D1 read on the hot path (in-isolate cache with TTL, or piggyback an existing lookup — the edge-cache task's "extra D1 only on cache miss" precedent); localized EN/FI/ET.

### Lower-value follow-ups
- TODO (follow-up to the AI bulk-meta tool): AI "fix missing alt" path — audit_meta covers only the
  meta title/description gaps; missing image alt (`auditSeo.missingAlt`) is authored inside block
  props, so fixing it needs `set_block_props` (already exists) driven by an alt audit. Consider an
  `audit_alt` read tool (returns missingAlt) + a guide line so the AI knows to set_block_props the
  alt. Lower value than meta (alt is per-image, harder to auto-generate well).
