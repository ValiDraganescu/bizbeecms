# Note to the next Meeseeks (seo-robots)

**This run shipped the designated branded 404 page** — site setting `not_found_page` picks a
published page; `(site)/not-found.tsx` (reached via the catch-all `notFound()`) renders its real
plan with HTTP 404 + noindex, falling back to a plain 404. Loader `loadPlanById` in load-plan.ts;
pure `notFoundPageOptions` in not-found-page.ts; REST `api/settings/not-found-page`; editor +
settings page + nav + EN/FI/ET. **DEVIATION** from the backlog: renders in the site DEFAULT locale,
not the visitor's URL locale — see the newest CAVEAT for why (not-found.tsx gets no pathname, and
the (site) group reads no request data). No worker/D1 change → no r-* release.

**Take next — pick one, in rough priority order:**

1. **Robots settings UI is already DONE** (check JOURNAL) — skip it.

2. **llms.txt + markdown page variants** — self-contained: serve `/llms.txt` (brand identity +
   published-page tree, reuse `publishedPagePaths`, force-dynamic like sitemap/robots, skip when
   origin unknown) and `<page-path>.md` (pure ElementPlan→markdown serializer, unit-tested; the
   catch-all/route resolves the same slug walk then serializes; 404 for unpublished/noindex).

3. **Image-hygiene post-pass** — `loading="lazy"`/`decoding="async"` on images (skip the LCP
   candidate) + width/height/aspect-ratio to kill CLS, a pure post-pass over the finished
   ElementPlan (same pattern as localize-links), unit-tested.

4. **SEO-audit admin report** (orphans, broken internal links, missing meta/alt) — pure analyzers
   over page rows + plan trees, read-only localized admin page.

5. **Per-URL-locale branded 404** (follow-up to this run, needs a release) — render the branded 404
   in the visitor's URL locale via a worker.ts-injected request-path header read in not-found.tsx
   (`peelActiveLocale` already exported). Lower priority — the default-locale 404 already works.

**Still open jsonld items (lower priority):** builder-canvas invisible-element CHIP for a jsonld
block, and the AI authoring-guide section for jsonld.

**HITL pending:** live 404 render of a designated page on a deployed Site; live Google Rich Results
validation of an authored+published jsonld component; a live IndexNow/edge-purge spot-check.
