# Backlog — seo-robots
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks

### USER-QUEUED (2026-07-07): editable llms.txt + caching for llms.txt and .md variants
- DONE (2026-07-07): Editable llms.txt template with placeholders. Pure `lib/render/llms-template.ts`
  (7 tests): `LLMS_TEMPLATE_VARS` (single source of truth for slots + UI side-panel docs),
  `renderLlmsTemplate` (substitution via the SHARED `SLOT_RE` from plan-tree.ts — same `{{slot}}` /
  `{{ t slot }}` convention as components), `unknownSlots` (names bad tokens for self-correcting
  save-time validation). Slots: `brandName`, `tagline`, `origin`, `defaultLocale`, `locales`,
  `pageTree`. Store: `getLlmsTemplate`/`setLlmsTemplate` (key `llms_template`, stored VERBATIM not
  JSON). Route `/llms.txt` renders the template when set, else auto output; `pageTree` = the exact
  auto "## Pages" list via new exported `buildLlmsPageList` (llms-txt.ts). NOTE: the settings UI
  (next task) owns the on-save `unknownSlots` reject — the route substitutes unknowns to "".
- TODO: llms.txt settings editor UI: admin settings page with the template editor and a SIDE PANEL
  to the RIGHT of the editor listing all available variables (name + one-line description + example
  value; click-to-insert preferred). REST GET/PUT with stable error codes (mirror the robots.txt
  settings pattern). Localized EN/FI/ET.
- TODO: Cache /llms.txt: today force-dynamic + no-store + rejected by the edge-cache dot gate
  (deliberate, after the wildcard cache-tag sitemap bug). Add caching WITH explicit purge coverage:
  own cache tag, purged on page publish/unpublish/delete/rename, brand-identity save, AND llms
  template save. Must NOT reopen the wildcard-page cache-stamping hole — explicit carve-out for
  exactly /llms.txt, never a general loosening of the dot gate. Any worker.ts change is
  release-gated (r-*).
- TODO: Cache .md page variants: /api/md/[...slug] currently sets no Cache-Control (recomputed every
  request; the worker rewrite exits BEFORE the edge-cache gate). Add edge caching keyed on the
  PUBLIC /<path>.md URL or the api route with the page's existing cache tag (pageCacheTag) so
  publish/unpublish/rename purges cover it; noindex flips must purge too. Honor the CAVEATS wildcard
  cache-tag caution. Worker.ts changes, if needed, are release-gated (r-*).

### Operator SEO tooling (admin)
- DONE: SEO audit view in the CMS admin (`/admin/settings/seo-audit`) — orphans, broken internal
  links, missing per-locale meta title/desc, images missing alt. Pure `auditSeo` (seo-audit.ts,
  12 tests), read-only localized EN/FI/ET. SCOPE: analyzes RAW page.blocks props, not resolved
  component trees (see follow-up below).
- TODO: SEO audit — deep component-tree scan: the current audit only scans raw `page.blocks` prop
  values, so links/images/alt authored INSIDE referenced component trees are not checked. Extend
  by resolving each page's plan (or a lighter component-tree walk over `getComponentByName`) to
  collect `<a href>` + `<img src/alt>` from component markup too. Needs the D1 component resolver
  (not a pure input) — decide: build the plan (heavy, next-intl) vs a dep-light component-tree
  href/img extractor fed the resolved component rows. Then feed those into the same auditSeo shape.
- DONE (2026-07-07): AI bulk-meta assistant tools — `audit_meta` (returns auditSeo's missingMeta
  page×locale gaps) + `set_page_meta` (per-locale metaTitle/metaDescription MERGE via upsertPageMeta
  + light purge/IndexNow hook). Pure `lib/chat/meta-tools.ts` (8 tests). Wired into tool-dispatch,
  tool-scopes (pages + page-builder), pages context prompt. SCOPE: writes ONLY title/desc — never
  moves URLs / flips noindex / blanks metaImage, so no rename/noindex pre-capture needed. NOTE: the
  "images missing alt" WRITE half is NOT included (alt lives in block props / component markup, not a
  page-meta field — would need a block-prop edit); filed as the follow-up below.
- TODO (follow-up to the AI bulk-meta tool): AI "fix missing alt" path — audit_meta covers only the
  meta title/description gaps; missing image alt (`auditSeo.missingAlt`) is authored inside block
  props, so fixing it needs `set_block_props` (already exists) driven by an alt audit. Consider an
  `audit_alt` read tool (returns missingAlt) + a guide line so the AI knows to set_block_props the
  alt. Lower value than meta (alt is per-image, harder to auto-generate well).

### Performance — Core Web Vitals
- TODO: INVESTIGATION (design note, not code): responsive image variants for `/media/[...key]` R2 assets on per-site Workers — evaluate Cloudflare Images API upload-time variants vs zone Image Resizing (custom-domain sites only; workers.dev sites can't) vs in-Worker resizing (no native codecs on Workers — likely dead end); deliverable = chosen path + cost/constraints written to this goal's JOURNAL + CAVEATS, and implementation tasks filed accordingly. NOTE: dims now ride asset URLs as `?w=&h=` — a responsive path could reuse that query carrier for width hints.
- BLOCKED (on the investigation above): implement responsive images — srcset/sizes + modern format (WebP/AVIF) for asset images in published pages per the chosen design.
- TODO: Stamp `?w=&h=` dims on asset URLs the AI inserts (list_assets / generate_image tool responses carry dims-stamped URLs via the existing `withAssetDims`), so AI-authored pages get the CLS aspect-ratio box too — today only the ImagePicker stamps dims (see the asset-dims caveat). Authoring-time only, zero render cost. — queued by scrub: AI page authoring is a first-class path; its images currently get no CLS box.

### Page-level SEO controls
- TODO: Per-URL-locale branded 404 (follow-up to the shipped default-locale branded 404): make the
  branded 404 render in the VISITOR's URL locale (`/fi/missing` → 404 in fi) instead of the site
  default. Needs the request path available in `not-found.tsx` — inject it as a header in
  `worker.ts` (release-gated, r-*) and read it via `next/headers` + `peelActiveLocale` (already
  exported from load-plan.ts). A 404 is never edge-cached so reading the request header here is safe.

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

### OG-image autogen (fallback og:image via Browser Rendering — start with the tracer/decision)
- TODO: OG-image autogen tracer + decision: Cloudflare Browser Rendering screenshots the published page top (1200×630 viewport) as the og:image fallback. Evaluate the `browser` Worker binding (@cloudflare/puppeteer) vs the Browser Rendering REST API (account token via deployer secret injection, like OpenRouter keys) — paid-plan requirement, session/concurrency limits, cold-start cost; deliverable = decision written to JOURNAL/CAVEATS PLUS a working spike: screenshot one published page to R2 (`og/<pageId>.<locale>.png`). Requires a publicly reachable origin (resolveSiteOrigin) — skip silently in local dev.
- TODO: OG-image autogen publish wiring: on page publish, for each configured locale, IF no manual per-locale metaImage AND no auto screenshot exists yet → best-effort background screenshot via `ctx.waitUntil` (never fails/delays the publish — purge-edge pattern); page delete removes its screenshots; auto image is stored SEPARATELY from user uploads and can never overwrite one.
- TODO: OG-image fallback serving + metadata precedence: `generateMetadata` og:image = manual per-locale metaImage ?? auto screenshot ?? none (absolute URL via site origin); serving route for the R2 og/ objects; twitter:card already picks summary_large_image when a meta image exists (social-cards.ts) — extend its input to count the auto screenshot. Pure precedence helper unit-tested.
- TODO: OG-image regenerate button: per-locale "Generate from page" action in the page-settings SEO tab (API route, stable error codes) that (re)screenshots on demand — the explicit path for refreshing after theme/content redesigns; SEO tab shows the currently effective og:image with a manual/auto badge; localized EN/FI/ET.

### Naughty-robot rate limiting (needs worker.ts, ships via release)
- TODO: Worker-level per-IP rate limit on public page paths: Workers rate-limiting binding in CMS/wrangler.jsonc; `CMS/worker.ts` checks it BEFORE the OpenNext handler for public paths only (skip /admin /api /preview /media /_next — reuse/extend the `isEdgeCacheCandidate` path gate), 429 + Retry-After over the cap; fixed sane default (~100 req/min/IP); pure gate logic unit-tested; investigate cheap verified-crawler exemption (cf object fields available on workers.dev) and note findings.
- TODO: Per-site rate-limit threshold: D1 setting + site-settings UI (Off / presets), read by worker.ts WITHOUT a per-request D1 read on the hot path (in-isolate cache with TTL, or piggyback an existing lookup — the edge-cache task's "extra D1 only on cache miss" precedent); localized EN/FI/ET.
