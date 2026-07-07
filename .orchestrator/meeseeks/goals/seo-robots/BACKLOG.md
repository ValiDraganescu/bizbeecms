# Backlog — seo-robots
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks

### JSON-LD components (kind: jsonld) — machinery proven end-to-end; only the authoring SURFACE remains
- DONE (2026-07-07): JSON-LD authoring — Develop editor UI PROPER. Kind toggle (HTML|JSON-LD),
  single JSON-template editor for jsonld (no script/css panes), preview shows the emitted structured
  data + Google Rich Results deep-link, save PUT sends the authoritative `kind`. Editor reads the
  loaded kind from `X-Component-Kind` and the raw template from a new base64 `X-Component-Json-Template`
  header (portable bundle `tree` is a parseHtml-mangled template — useless to edit). `listComponents`
  now selects kind → list badges jsonld components. HITL REMAINS: author a proof jsonld component via
  the UI → publish → validate in Google Rich Results (needs a deployed Site + real D1).
- TODO: Builder canvas invisible-element CHIP for a jsonld block (renders no visible HTML — the
  `data-block-wrap` placeholder is empty; show a selectable/deletable chip so operators can manage it).
- TODO: AI authoring-guide section for jsonld (tool `kind` param + validation are DONE): schema.org
  patterns per page type — Product/Article/FAQPage/Recipe — the slot-quoting rules (`"n":{{count}}`
  unquoted vs `"n":"{{name}}"` quoted), and WHEN to author a jsonld component vs plain content.

### AI write-path coherence (IndexNow + edge purge)
- DONE (2026-07-07): AI create_page/translate now ping IndexNow + purge the edge cache after
  a successful write (upsertPage/applyTranslation now return `pageId`; pure
  `page-write-hooks.purgeTagsForPageWrite` decides purge tags — CREATE=none, UPDATE/translate=per-page
  tag; both handlers fire `purgeEdgeTags` + `notifyIndexNowForPage`, best-effort/self-wrapping).
  NOTE: rename/slug-change 301 auto-capture is NOT wired on the AI path — the AI has no page-rename
  tool today, so create_page can't move an existing page's URLs (it upserts by slug). If an AI rename
  tool ever lands, it must run the same redirectsForRename/applyRenameRedirects trio the REST route does.

### Page-level SEO controls
- TODO: Designated branded 404 page: site setting selecting a published page as the 404 page; the `(site)` catch-all's miss path renders that page's plan in the ACTIVE peeled locale (`/fi/missing` → 404 in fi) with HTTP status 404 + robots noindex; settings UI select (only published pages); fallback to the current plain 404 when unset. Non-200 → never edge-cached (worker gate is GET-200-only; assert).
- TODO: OG-image autogen tracer + decision: Cloudflare Browser Rendering screenshots the published page top (1200×630 viewport) as the og:image fallback. Evaluate the `browser` Worker binding (@cloudflare/puppeteer) vs the Browser Rendering REST API (account token via deployer secret injection, like OpenRouter keys) — paid-plan requirement, session/concurrency limits, cold-start cost; deliverable = decision written to JOURNAL/CAVEATS PLUS a working spike: screenshot one published page to R2 (`og/<pageId>.<locale>.png`). Requires a publicly reachable origin (resolveSiteOrigin) — skip silently in local dev.
- TODO: OG-image autogen publish wiring: on page publish, for each configured locale, IF no manual per-locale metaImage AND no auto screenshot exists yet → best-effort background screenshot via `ctx.waitUntil` (never fails/delays the publish — purge-edge pattern); page delete removes its screenshots; auto image is stored SEPARATELY from user uploads and can never overwrite one.
- TODO: OG-image fallback serving + metadata precedence: `generateMetadata` og:image = manual per-locale metaImage ?? auto screenshot ?? none (absolute URL via site origin); serving route for the R2 og/ objects; twitter:card already picks summary_large_image when a meta image exists (social-cards.ts) — extend its input to count the auto screenshot. Pure precedence helper unit-tested.
- TODO: OG-image regenerate button: per-locale "Generate from page" action in the page-settings SEO tab (API route, stable error codes) that (re)screenshots on demand — the explicit path for refreshing after theme/content redesigns; SEO tab shows the currently effective og:image with a manual/auto badge; localized EN/FI/ET.

### llms.txt + markdown page variants (AI-crawler surface, per llmstxt.org)
- TODO: Serve `/llms.txt`: site name + description from brand identity, then the published-page tree (per-locale titles/descriptions) with links to each page's `.md` variant; reuse `publishedPagePaths`; force-dynamic like sitemap/robots; skip when origin unknown.
- TODO: Markdown page variants: serve `<page-path>.md` — a pure ElementPlan→markdown serializer (headings, paragraphs, lists, links, images as alt+URL; skip script/style/nav chrome), unit-tested; the `(site)` catch-all (or a route) resolves the same slug walk then serializes instead of rendering HTML; 404 for unpublished/noindex; linked from llms.txt.

### Performance — Core Web Vitals (images ship raw R2 bytes today)
- TODO: Image hygiene post-pass over the finished ElementPlan (same pattern as localize-links): `loading="lazy"` + `decoding="async"` on images (skip the first/LCP-candidate image), width/height or aspect-ratio to kill CLS where dimensions are known — if asset dimensions aren't stored, capture them at upload in the assets API (new columns) and backfill lazily; pure post-pass unit-tested.
- TODO: INVESTIGATION (design note, not code): responsive image variants for `/media/[...key]` R2 assets on per-site Workers — evaluate Cloudflare Images API upload-time variants vs zone Image Resizing (custom-domain sites only; workers.dev sites can't) vs in-Worker resizing (no native codecs on Workers — likely dead end); deliverable = chosen path + cost/constraints written to this goal's JOURNAL + CAVEATS, and implementation tasks filed accordingly.
- BLOCKED (on the investigation above): implement responsive images — srcset/sizes + modern format (WebP/AVIF) for asset images in published pages per the chosen design.

### Operator SEO tooling (admin)
- TODO: SEO audit view in the CMS admin: one report page listing orphan pages (no inbound internal links), broken internal links (hrefs resolving to deleted/unpublished pages), pages missing per-locale meta title/description, images missing alt text — pure analyzers over page rows + plan trees (dep-free, unit-tested), rendered in a localized EN/FI/ET admin page. Read-only report; no auto-fix.
- TODO: AI bulk-meta assistant tool: tool(s) letting the AI list pages/locales with missing meta title/description (and images missing alt), then write generated values through the existing upsertPageMeta validation path (per-locale maps, purge semantics intact); self-correcting errors naming exact page+locale; authoring-guide section so the AI knows the workflow.

### Naughty-robot rate limiting (needs worker.ts, ships via release)
- TODO: Worker-level per-IP rate limit on public page paths: Workers rate-limiting binding in CMS/wrangler.jsonc; `CMS/worker.ts` checks it BEFORE the OpenNext handler for public paths only (skip /admin /api /preview /media /_next — reuse/extend the `isEdgeCacheCandidate` path gate), 429 + Retry-After over the cap; fixed sane default (~100 req/min/IP); pure gate logic unit-tested; investigate cheap verified-crawler exemption (cf object fields available on workers.dev) and note findings.
- TODO: Per-site rate-limit threshold: D1 setting + site-settings UI (Off / presets), read by worker.ts WITHOUT a per-request D1 read on the hot path (in-isolate cache with TTL, or piggyback an existing lookup — the edge-cache task's "extra D1 only on cache miss" precedent); localized EN/FI/ET.
