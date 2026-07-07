# Backlog — seo-robots
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks

### Performance — Core Web Vitals (investigation DONE — see BACKLOG_ARCHIVE; impl tasks below)
- TODO (impl 1/2, unblocked by investigation): `/media/[...key]` `?w=` width variants — add a
  `deliveryWidth(param, allowlist)` PURE helper (asset.ts) that floors/clamps the requested width to
  a fixed ALLOWLIST (e.g. 320/640/960/1280/1920), null = original. Route calls
  `.transform({ width })` when non-null; fold `w` into `cacheKeyFor` (alongside `fmt`) so each width
  edge-caches distinctly. Original R2 bytes untouched; transform failure falls back to original (same
  as WebP path). Pure helper unit-tested; no D1 read, no hot-path cost.
- TODO (impl 2/2): render srcset/sizes — `applyImageHygiene` (or a sibling pure pass) emits
  `srcset` = the allowlist widths as `/media/<key>?w=<n> <n>w` for `/media/` `<img>` srcs that carry
  `?w=&h=` dims (skip widths above the intrinsic width from `readAssetDims`), plus a sane default
  `sizes` (e.g. `100vw`, author `sizes` prop wins). Author-set `srcset` always wins. Keep it pure /
  edge-cache-safe (reads only the built plan) — mirror the existing image-hygiene seam. GOTCHA: the
  dims query (`?w=&h=`) and the delivery-width query (`?w=`) BOTH use `w` — the srcset URL must carry
  the DELIVERY width param, distinct from the intrinsic-dims carrier; reconcile in one place (a
  `mediaVariantUrl(key, width)` helper) so they don't collide.
- TODO: dims for `generate_image` assets — AI-generated images store NULL width/height (no
  server-side decode on Workers) so they never get the CLS box or (future) srcset. Add a client-side
  `createImageBitmap` re-decode after generation (mirror the media-uploader capture path) or stamp
  dims at insert time; never a render-time D1 read. — queued by scrub: journal 14:27 said
  "filed as its own concern" but no task was ever filed.

### Operator SEO tooling (admin) — audit report + AI bulk-meta shipped (see BACKLOG_ARCHIVE)
- TODO: SEO audit — deep component-tree scan: the current audit only scans raw `page.blocks` prop
  values, so links/images/alt authored INSIDE referenced component trees are not checked. Extend
  by resolving each page's plan (or a lighter component-tree walk over `getComponentByName`) to
  collect `<a href>` + `<img src/alt>` from component markup too. Needs the D1 component resolver
  (not a pure input) — decide: build the plan (heavy, next-intl) vs a dep-light component-tree
  href/img extractor fed the resolved component rows. Then feed those into the same auditSeo shape.
- TODO (follow-up to the AI bulk-meta tool): AI "fix missing alt" path — audit_meta covers only the
  meta title/description gaps; missing image alt (`auditSeo.missingAlt`) is authored inside block
  props, so fixing it needs `set_block_props` (already exists) driven by an alt audit. Consider an
  `audit_alt` read tool (returns missingAlt) + a guide line so the AI knows to set_block_props the
  alt. Lower value than meta (alt is per-image, harder to auto-generate well).

### JSON-LD components (kind: jsonld) — machinery + authoring shipped; polish items remain
- TODO: Per-row/ItemList JSON-LD for List blocks (user-queued 2026-07-07): the one binding case the
  jsonld component kind can't ride today — a List block's rows should be able to emit a schema.org
  ItemList (or per-row items, e.g. Product/Article per row) into plan.jsonLd. See CAVEATS note from
  the jsonld-bindings run for the seam analysis.
- TODO: Builder canvas invisible-element CHIP for a jsonld block (renders no visible HTML — the
  `data-block-wrap` placeholder is empty; show a selectable/deletable chip so operators can manage it).
- TODO: AI authoring-guide section for jsonld (tool `kind` param + validation are DONE): schema.org
  patterns per page type — Product/Article/FAQPage/Recipe — the slot-quoting rules (`"n":{{count}}`
  unquoted vs `"n":"{{name}}"` quoted), and WHEN to author a jsonld component vs plain content.

### Page-level SEO controls
- TODO: Per-URL-locale branded 404 (follow-up to the shipped default-locale branded 404): make the
  branded 404 render in the VISITOR's URL locale (`/fi/missing` → 404 in fi) instead of the site
  default. Needs the request path available in `not-found.tsx` — inject it as a header in
  `worker.ts` (release-gated, r-*) and read it via `next/headers` + `peelActiveLocale` (already
  exported from load-plan.ts). A 404 is never edge-cached so reading the request header here is safe.

### OG-image autogen (fallback og:image via Browser Rendering — start with the tracer/decision)
- TODO: OG-image autogen tracer + decision: Cloudflare Browser Rendering screenshots the published page top (1200×630 viewport) as the og:image fallback. Evaluate the `browser` Worker binding (@cloudflare/puppeteer) vs the Browser Rendering REST API (account token via deployer secret injection, like OpenRouter keys) — paid-plan requirement, session/concurrency limits, cold-start cost; deliverable = decision written to JOURNAL/CAVEATS PLUS a working spike: screenshot one published page to R2 (`og/<pageId>.<locale>.png`). Requires a publicly reachable origin (resolveSiteOrigin) — skip silently in local dev.
- TODO: OG-image autogen publish wiring: on page publish, for each configured locale, IF no manual per-locale metaImage AND no auto screenshot exists yet → best-effort background screenshot via `ctx.waitUntil` (never fails/delays the publish — purge-edge pattern); page delete removes its screenshots; auto image is stored SEPARATELY from user uploads and can never overwrite one.
- TODO: OG-image fallback serving + metadata precedence: `generateMetadata` og:image = manual per-locale metaImage ?? auto screenshot ?? none (absolute URL via site origin); serving route for the R2 og/ objects; twitter:card already picks summary_large_image when a meta image exists (social-cards.ts) — extend its input to count the auto screenshot. Pure precedence helper unit-tested.
- TODO: OG-image regenerate button: per-locale "Generate from page" action in the page-settings SEO tab (API route, stable error codes) that (re)screenshots on demand — the explicit path for refreshing after theme/content redesigns; SEO tab shows the currently effective og:image with a manual/auto badge; localized EN/FI/ET.

### Naughty-robot rate limiting (needs worker.ts, ships via release)
- TODO: Worker-level per-IP rate limit on public page paths: Workers rate-limiting binding in CMS/wrangler.jsonc; `CMS/worker.ts` checks it BEFORE the OpenNext handler for public paths only (skip /admin /api /preview /media /_next — reuse/extend the `isEdgeCacheCandidate` path gate), 429 + Retry-After over the cap; fixed sane default (~100 req/min/IP); pure gate logic unit-tested; investigate cheap verified-crawler exemption (cf object fields available on workers.dev) and note findings.
- TODO: Per-site rate-limit threshold: D1 setting + site-settings UI (Off / presets), read by worker.ts WITHOUT a per-request D1 read on the hot path (in-isolate cache with TTL, or piggyback an existing lookup — the edge-cache task's "extra D1 only on cache miss" precedent); localized EN/FI/ET.
