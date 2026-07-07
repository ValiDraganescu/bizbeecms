# Backlog — seo-robots
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks

### JSON-LD components (kind: jsonld) — machinery + authoring shipped; polish items remain
- DONE (2026-07-07): Per-row/ItemList JSON-LD for List blocks (user-queued). RENDER machinery
  shipped: per-row Product/Article already worked via composition (jsonld component as List
  template child → per-row scripts); added the AGGREGATE `ItemList` path via
  `listSource.itemList:true` + `buildItemListJsonLd` + planList/emitItemList (4 tests).
- DONE (2026-07-07): ItemList AUTHORING surface. (a) Builder checkbox "Emit ItemList JSON-LD" in
  binding-panels.tsx ListSettings layout section (mirrors autoscroll; `list.itemList`/`itemListHint`
  EN/FI/ET). (b) AI `bind_list` tool gained an `itemList` boolean (schema + BindListArgs + validate
  + handleBindList patch). Closes the whole jsonld-List track (render+storage were already done).
- DONE (2026-07-07): AI authoring-guide section for jsonld — on-demand `get_jsonld_guide` tool
  (jsonld-guide.ts) mirroring get_data_sources_guide: schema.org per-type patterns
  (Product/Article/FAQPage/Recipe), slot-quoting rules (string QUOTED / number+array UNQUOTED),
  automatic-BreadcrumbList warning, the two List modes, and WHEN to author jsonld vs plain content.
  Wired into tool-dispatch + tool-scopes (page-builder/components/pages contexts + prompts); 4 tests.
  Closes the LAST jsonld backlog item.

### Operator SEO tooling (admin) — audit report + AI bulk-meta shipped (see BACKLOG_ARCHIVE)
- DONE (2026-07-07): SEO audit — deep component-tree scan. Took the DEP-LIGHT extractor path (NOT
  the plan builder — that pulls next-intl and breaks node --test). New PURE `extractComponentSeo` +
  `buildComponentSeoIndex` in seo-audit.ts build a `Map<name, {hrefs,images,deps}>` from the
  already-resolved `listComponents()` rows (each carries a JSON `tree` + `kind`). `auditSeo` gained
  an OPTIONAL `componentSeo` index param: a block referencing a component folds in that component's
  transitive (nested-ref, cycle-safe) `<a href>`/`<img src alt>` into the SAME broken-link/missing-alt
  logic. jsonld components + unparseable trees skipped. Admin route wires listComponents() in; AI
  audit_meta unchanged (only uses missingMeta). +10 tests, suite 1914, tsc clean.

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

### OG-image autogen (fallback og:image via Browser Rendering — start with the tracer/decision)
- TODO: OG-image autogen tracer + decision: Cloudflare Browser Rendering screenshots the published page top (1200×630 viewport) as the og:image fallback. Evaluate the `browser` Worker binding (@cloudflare/puppeteer) vs the Browser Rendering REST API (account token via deployer secret injection, like OpenRouter keys) — paid-plan requirement, session/concurrency limits, cold-start cost; deliverable = decision written to JOURNAL/CAVEATS PLUS a working spike: screenshot one published page to R2 (`og/<pageId>.<locale>.png`). Requires a publicly reachable origin (resolveSiteOrigin) — skip silently in local dev.
- TODO: OG-image autogen publish wiring: on page publish, for each configured locale, IF no manual per-locale metaImage AND no auto screenshot exists yet → best-effort background screenshot via `ctx.waitUntil` (never fails/delays the publish — purge-edge pattern); page delete removes its screenshots; auto image is stored SEPARATELY from user uploads and can never overwrite one.
- TODO: OG-image fallback serving + metadata precedence: `generateMetadata` og:image = manual per-locale metaImage ?? auto screenshot ?? none (absolute URL via site origin); serving route for the R2 og/ objects; twitter:card already picks summary_large_image when a meta image exists (social-cards.ts) — extend its input to count the auto screenshot. Pure precedence helper unit-tested.
- TODO: OG-image regenerate button: per-locale "Generate from page" action in the page-settings SEO tab (API route, stable error codes) that (re)screenshots on demand — the explicit path for refreshing after theme/content redesigns; SEO tab shows the currently effective og:image with a manual/auto badge; localized EN/FI/ET.

### Naughty-robot rate limiting (needs worker.ts, ships via release)
- TODO: Worker-level per-IP rate limit on public page paths: Workers rate-limiting binding in CMS/wrangler.jsonc; `CMS/worker.ts` checks it BEFORE the OpenNext handler for public paths only (skip /admin /api /preview /media /_next — reuse/extend the `isEdgeCacheCandidate` path gate), 429 + Retry-After over the cap; fixed sane default (~100 req/min/IP); pure gate logic unit-tested; investigate cheap verified-crawler exemption (cf object fields available on workers.dev) and note findings.
- TODO: Per-site rate-limit threshold: D1 setting + site-settings UI (Off / presets), read by worker.ts WITHOUT a per-request D1 read on the hot path (in-isolate cache with TTL, or piggyback an existing lookup — the edge-cache task's "extra D1 only on cache miss" precedent); localized EN/FI/ET.

### Lower-value follow-ups
- DONE (2026-07-07): Edge-cache /sitemap.xml with its own `sitemap` Cache-Tag, mirroring the
  /llms.txt carve-out. `sitemapXmlCacheHeaders` (fixed `pathname === "/sitemap.xml"`) + worker.ts
  carve-out (release-gated r-*, folded into the SAME dot-file block as llms via `?? `). Purge sites:
  page publish, api/pages PUT (path-changed + normal) + DELETE, AND the AI page-write-hooks path —
  NOT brand save / NOT llms-template save (neither is sitemap content). 4 tests (2 edge-cache carve-out
  + 3 rewritten page-write-hooks). tsc clean (only fresh-worktree CF-ambient noise), suite 1909.
- TODO (follow-up to the AI bulk-meta tool): AI "fix missing alt" path — audit_meta covers only the
  meta title/description gaps; missing image alt (`auditSeo.missingAlt`) is authored inside block
  props, so fixing it needs `set_block_props` (already exists) driven by an alt audit. Consider an
  `audit_alt` read tool (returns missingAlt) + a guide line so the AI knows to set_block_props the
  alt. Lower value than meta (alt is per-image, harder to auto-generate well).
