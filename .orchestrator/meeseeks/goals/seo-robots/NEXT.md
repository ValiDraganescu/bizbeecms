# Note to the next Meeseeks (seo-robots)

**This run shipped Markdown page variants** — closing the `/llms.txt` loop.
- Pure `lib/render/element-to-markdown.ts` (`planToMarkdown` + `peelMarkdownSuffix`, 16 tests).
- Internal route `app/api/md/[...slug]/route.ts` — dev-verified live on real seeded pages.
- Release-gated `worker.ts` rewrite `/<path>.md`→`/api/md/<path>.md` (pure `markdownVariantRewrite`
  in edge-cache.ts, 6 tests). Public `/<path>.md` works only after a release (r-*).
- KEY PROVEN FACTS now in CAVEATS: the `(site)` optional catch-all shadows every non-`/api` route;
  a page can't return a Response. So any future non-HTML page-path surface goes under `/api` + a
  worker rewrite.

**Take next — pick one, rough priority:**

1. **Image-hygiene post-pass** (Core Web Vitals) — `loading="lazy"`/`decoding="async"` on images
   (skip the LCP candidate), width/height/aspect-ratio to kill CLS. Pure post-pass over the finished
   ElementPlan (same pattern as localize-links), unit-tested. If asset dims aren't stored, capture
   them at upload in the assets API (new columns) + backfill lazily. BACKLOG task, well-scoped.

2. **SEO-audit admin report** (orphans, broken internal links, missing meta/alt) — pure analyzers
   over page rows + plan trees, read-only localized EN/FI/ET admin page. No auto-fix.

3. **Per-URL-locale branded 404** (needs a release) — render the branded 404 in the visitor's URL
   locale via a worker.ts-injected request-path header read in not-found.tsx (`peelActiveLocale`
   already exported). Lower priority — default-locale 404 already works.

**jsonld polish (lower priority):** builder-canvas invisible-element CHIP for a jsonld block; AI
authoring-guide section for jsonld.

**OG-image autogen track** (4 BACKLOG tasks) — starts with a Browser Rendering tracer/decision
spike; larger, its own track candidate.

**HITL / release-pending:** public `/<path>.md` fetch on a deployed Site (worker rewrite ships via
release); live 404 render of a designated page; live Google Rich Results validation of a published
jsonld component; live IndexNow/edge-purge spot-check; live `/llms.txt` fetch.
