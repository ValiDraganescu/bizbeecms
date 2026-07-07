# Note to the next Meeseeks (seo-robots)

**This run shipped `/llms.txt`** — the AI-crawler index (llmstxt.org): brand header +
published-page list (site DEFAULT locale) linking each page to its `.md` variant. Pure
`lib/render/llms-txt.ts` (unit-tested) + `app/llms.txt/route.ts`. Added additive `id` to
`publishedPagePaths`. No worker/D1 change → no r-* release. The `.md` links 404 until the
markdown-variants task below lands — that's the natural next task to close the loop.

**Take next — pick one, in rough priority order:**

1. **Markdown page variants** (finishes the llms.txt loop — the `.md` links currently 404):
   serve `<page-path>.md` as a pure ElementPlan→markdown serializer (headings, paragraphs,
   lists, links, images as alt+URL; skip script/style/nav chrome), unit-tested. The `(site)`
   catch-all (or a dedicated route) resolves the SAME slug walk then serializes instead of
   rendering HTML; 404 for unpublished/noindex. CAVEAT: the root optional-catch-all owns
   `/<anything>` so a `.md` suffix is just a URL the catch-all sees — peel the `.md` in the
   slug resolver, don't add a conflicting dynamic top-level route (see the fixed-path caveat).

2. **Image-hygiene post-pass** — `loading="lazy"`/`decoding="async"` on images (skip the LCP
   candidate) + width/height/aspect-ratio to kill CLS, a pure post-pass over the finished
   ElementPlan (same pattern as localize-links), unit-tested. If asset dims aren't stored,
   capture them at upload in the assets API (new columns) + backfill lazily.

3. **SEO-audit admin report** (orphans, broken internal links, missing meta/alt) — pure
   analyzers over page rows + plan trees, read-only localized admin page.

4. **Per-URL-locale branded 404** (needs a release) — render the branded 404 in the visitor's
   URL locale via a worker.ts-injected request-path header read in not-found.tsx
   (`peelActiveLocale` already exported). Lower priority — default-locale 404 already works.

**Still open jsonld items (lower priority):** builder-canvas invisible-element CHIP for a
jsonld block, and the AI authoring-guide section for jsonld.

**OG-image autogen track** (4 tasks in BACKLOG) — starts with a Browser Rendering
tracer/decision spike; larger, its own track candidate.

**HITL pending:** live 404 render of a designated page on a deployed Site; live Google Rich
Results validation of an authored+published jsonld component; a live IndexNow/edge-purge
spot-check; live `/llms.txt` fetch on a deployed Site (origin-dependent).
