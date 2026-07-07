# Backlog — seo-robots
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks

### JSON-LD components (kind: jsonld)
- DONE (2026-07-07): JSON-LD component kind — RENDER PATH tracer. `component.kind`
  ('html'|'jsonld') + `draft_kind` columns (migration 0031); pure `jsonld-component.ts`
  (shared `escapeJsonForScript`, `bindJsonLdSlots`, `buildJsonLdComponent`); planPage funnels
  a jsonld block onto `plan.jsonLd` (hidden placeholder in flow); breadcrumb now APPENDS.
  AUTHORING (create/update component with kind, builder chip, draft/publish of the kind) is
  the NEXT tasks below — the render path reads kind but nothing WRITES it yet.
- TODO: JSON-LD authoring surface: create_component/update_component + the Develop editor accept
  `kind:"jsonld"` and write it to `component.kind`/`draft_kind` (publish copies draft_kind→kind,
  discard clears it — mirror the existing html/script/css draft columns); the block PUT
  component-existence check already covers it (jsonld is a normal D1 row). Builder canvas shows
  an invisible-element CHIP for a jsonld block (it renders no visible HTML — the `data-block-wrap`
  placeholder is empty). One end-to-end proof component authored + published + rich-results valid.
- TODO: JSON-LD × bindings: collection/data-source bindings interpolate into jsonld components exactly like HTML content (wildcard `:param` detail pages get per-URL structured data); verify the existing bind machinery passes through or add the minimal seam; unit-test the interpolation escaping.
- TODO: Teach the AI the jsonld kind: create_component/update_component accept `kind: "jsonld"`, authoring guide section (schema.org patterns, variables), validation that the artifact parses as JSON with a `@context`/`@type` — self-correcting errors naming the exact bad token + fix (per AI error philosophy).

### AI write-path coherence (IndexNow + edge purge)
- TODO: Notify IndexNow (and purge edge cache) on the AI live-write paths: `handleCreatePage` → `upsertPage` can publish/unpublish or rewrite a PUBLISHED page's live blocks, and `handleTranslate` → translate-store rewrites a published page's live metaTitle/metaDescription — neither calls notifyIndexNowForPage nor purge-edge (the REST pages/publish routes do both). Add the same best-effort post-write block (ctx.waitUntil, never fails the tool result) after successful upsertPage/applyTranslation in tool-dispatch. — queued by scrub: AI authoring is a first-class write path; today an AI publish never pings IndexNow and an AI edit of a cached published page (cache_max_age>0) leaves the edge stale until TTL.

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
