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
- DONE (2026-07-07): OG-image fallback serving + metadata precedence. Pure `resolveOgImageUrl`
  (og-image.ts): manual per-locale metaImage ALWAYS wins → else auto `og/<id>.<locale>.png` IF it
  exists → else none; absolutized against resolveSiteOrigin (already-absolute + no-origin handled).
  Serve route `app/api/og/[...key]/route.ts` streams the R2 `og/` object, `isOgImageKey`-guarded
  (traversal-safe, /api = catch-all-safe + SKIP_SEGMENT). `ogImageUrl`/`OG_IMAGE_ROUTE_PREFIX`
  (`/api/`) mint the public URL. Wired into `generateMetadata`: probes R2 for the auto image ONLY
  when there's no manual image (single R2 read, metadata path — NOT the 429 render hot path).
  twitter:card auto-counts the auto image (buildTwitterCard keys off the resolved `image`, no
  social-cards change needed). +8 tests (og-image.test.mjs), suite 1930, tsc clean. Live R2 = HITL.
- DONE (2026-07-07): OG-image autogen publish wiring. PURE `planOgScreenshots` (og-image.ts) decides
  one screenshot job per locale that has a page URL AND no manual metaImage AND no existing
  `og/<id>.<loc>.png` (manual-wins + idempotent). Coupled shell `og-image-notify.ts`
  (`generateOgImagesForPage`/`deleteOgImagesForPage`, mirrors indexnow-notify.ts): reads pages +
  content-locales + origin, per-locale absolute URLs via `pagePathsByLocale` (same machinery as
  sitemap/IndexNow), probes R2 for existing keys, screenshots SEQUENTIALLY (scarce Browser Rendering
  concurrency), all best-effort under `ctx.waitUntil`. Wired into publish POST + pages DELETE. No-op
  without the BROWSER binding. +6 tests (suite 1943), tsc clean. Live round-trip HITL (paid plan +
  `@cloudflare/puppeteer` + BROWSER binding + deployed R2). Did NOT touch worker.ts/wrangler.jsonc.
- DONE (2026-07-07): OG-image regenerate button (OG track item 4/4 — CLOSES the OG track).
  `regenerateOgImageForPage(pageId, locale)` (og-image-notify.ts) FORCE-screenshots one page×locale
  SYNCHRONOUSLY, SKIPPING the publish hook's idempotency probe (the explicit "refresh after redesign"
  path); refuses when a manual metaImage exists (`manualWins`). New route
  `api/pages/[id]/og-image/route.ts`: POST regenerates (stable codes manualWins|noUrl|noBinding|
  noOrigin|error|badLocale; 503 for noBinding/noOrigin, 400 else) + purges pageCacheTag(id) on
  success; GET `?locale=` returns `{manual,autoExists,url}` for the SEO-tab manual/auto/none badge
  (one R2 probe, only when no manual). SEO tab (`seo-form.tsx` `OgAutoImage` sub-component) shows the
  effective-source badge + "Generate from page" button (disabled when manual set). Localized EN/FI/ET
  (14 keys). +6 tests (og-regenerate.test.mjs, i18n-key completeness), suite 1949, tsc clean, full
  opennext build green. Did NOT touch worker.ts/wrangler.jsonc. Live screenshot round-trip = HITL
  (paid plan + @cloudflare/puppeteer + BROWSER binding + deployed R2).

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
- DONE (2026-07-07): Per-site rate-limit threshold. D1 setting `rate_limit_preset`
  (`off`|`normal`|`strict`, default `normal`) + site-settings UI (radio group at
  `/admin/settings/rate-limit`, EN/FI/ET). worker.ts reads it via
  `getRateLimitPresetCached` — a 30s in-isolate TTL cache (never a per-request D1 read
  on the hot gate; edge-cache "extra D1 only on cache miss" precedent). `off` skips
  `limiter.limit()` entirely; `strict` layers an in-isolate sliding counter
  (STRICT_LIMIT=40/60s per key) ON TOP of the fixed 100/60s binding (a truly-lower cap
  can't be enforced by the fixed binding alone). Pure `lib/render/rate-limit-config.ts`
  (normalize + usesBindingLimiter + strictCounterOverLimit) +6 tests (suite 1943), tsc
  clean (pre-existing env.DB typegen errors only). Release-gated (worker.ts, r-*) — the
  cap-skip/strict behaviour is live-HITL on a deployed Site + paid plan.

### Lower-value follow-ups
- DONE (2026-07-07): AI "fix missing alt" path — `audit_alt` read tool (no args) in meta-tools.ts,
  dispatched via `handleAuditAlt` (listPagesForAudit + getContentLocales + listComponents →
  `auditSeo(…, buildComponentSeoIndex(components))`, so it deep-scans component-internal <img> too;
  dedup by slug+src; returns findings + a fix `hint`). Registered in tool-scopes KNOWN_TOOL_NAMES +
  page-builder & pages scopes; guide lines added to both prompts so the AI drives `set_block_props`
  (block-prop images) / `update_component` (component-markup images) from the audit. Build gate green
  (`CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare build`); full pure suite 1955 pass.
