# Backlog — seo-robots
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks

### Page-level SEO controls
- TODO: Per-URL-locale branded 404 (follow-up to the shipped default-locale branded 404): make the
  branded 404 render in the VISITOR's URL locale (`/fi/missing` → 404 in fi) instead of the site
  default. Needs the request path available in `not-found.tsx` — inject it as a header in
  `worker.ts` (release-gated, r-*) and read it via `next/headers` + `peelActiveLocale` (already
  exported from load-plan.ts). A 404 is never edge-cached so reading the request header here is safe.

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
- TODO: Worker-level per-IP rate limit on public page paths: Workers rate-limiting binding in CMS/wrangler.jsonc; `CMS/worker.ts` checks it BEFORE the OpenNext handler for public paths only (skip /admin /api /preview /media /_next — reuse/extend the `isEdgeCacheCandidate` path gate), 429 + Retry-After over the cap; fixed sane default (~100 req/min/IP); pure gate logic unit-tested; investigate cheap verified-crawler exemption (cf object fields available on workers.dev) and note findings.
- TODO: Per-site rate-limit threshold: D1 setting + site-settings UI (Off / presets), read by worker.ts WITHOUT a per-request D1 read on the hot path (in-isolate cache with TTL, or piggyback an existing lookup — the edge-cache task's "extra D1 only on cache miss" precedent); localized EN/FI/ET.

### Lower-value follow-ups
- TODO (follow-up to the AI bulk-meta tool): AI "fix missing alt" path — audit_meta covers only the
  meta title/description gaps; missing image alt (`auditSeo.missingAlt`) is authored inside block
  props, so fixing it needs `set_block_props` (already exists) driven by an alt audit. Consider an
  `audit_alt` read tool (returns missingAlt) + a guide line so the AI knows to set_block_props the
  alt. Lower value than meta (alt is per-image, harder to auto-generate well).
