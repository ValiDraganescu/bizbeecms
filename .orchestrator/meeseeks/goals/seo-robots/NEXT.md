# Note to the next Meeseeks (seo-robots)

**This run CLOSED the LAST jsonld backlog item: the AI authoring-guide for JSON-LD.** New on-demand
`get_jsonld_guide` tool (`CMS/src/lib/chat/jsonld-guide.ts`) mirroring `get_data_sources_guide`:
schema.org per-type patterns (Product/Article/FAQPage/Recipe), slot-quoting rules (string QUOTED /
number+array UNQUOTED), automatic-BreadcrumbList warning, the two List modes, WHEN to author jsonld.
Wired into tool-dispatch + tool-scopes (page-builder/components/pages contexts + prompts). 4 tests,
tsc clean. See the new "on-demand AI guides follow ONE seam" CAVEAT for the 4-place wiring + the
test's tool-name-drift gotcha. **The entire JSON-LD components track is now DONE.**

**Pick the highest-value GOAL slice (ranked):**
1. **SEO-audit deep component-tree scan** (backlog, Operator SEO tooling) — audit only scans raw
   `page.blocks`; links/images/alt authored INSIDE referenced component trees are missed. Build a
   dep-light component-tree href/img extractor over `getComponentByName` (NOT the full plan — that
   pulls next-intl and breaks the dep-free `node --test`) and feed into the existing `auditSeo` shape.
2. **Per-URL-locale branded 404** — release-gated (r-*): inject request path as a header in
   `worker.ts`, read via `next/headers` + `peelActiveLocale` (exported from load-plan.ts) in
   not-found.tsx. A 404 is never edge-cached → reading the request header there is safe.
3. **OG-image autogen track** (4 backlog items) — start with the tracer/decision spike: Browser
   Rendering `browser` binding vs REST API; screenshot one published page to R2
   `og/<pageId>.<locale>.png`; skip silently in local dev (needs a public origin). Paid-plan gate.
4. **Naughty-robot rate limiting** (2 backlog items) — the last untouched GOAL track; needs
   worker.ts (release-gated r-*): Workers rate-limiting binding, 429+Retry-After over the cap on
   public page paths only (reuse the isEdgeCacheCandidate gate), per-site threshold off the hot path.
5. **Edge-cache /sitemap.xml with its own tag** (lower-value follow-up) — mirror the /llms.txt
   carve-out (own `sitemap` Cache-Tag, fixed-path worker match, release-gated r-*).

**HITL / release-pending (accumulating — needs a real deployed site + a release cut):**
- ItemList JSON-LD authoring: builder checkbox on the canvas; Google Rich Results validation on a
  real published category page carrying an itemList List. Per-row jsonld & single-item binding too.
- Builder chip: live visual check of a jsonld block's `◇ <name>` chip.
- AI generate_image live dims round-trip. Responsive images: live `/media/<key>?w=640` resized bytes
  + `<img srcset>`. `.md` variant caching; /llms.txt cached + purge; live 404 render; live
  IndexNow/edge-purge.
- NOTE: `scripts/live-ds-context-chip-check.mjs` fails in the pure `node --test scripts/*.mjs` sweep
  — it's a MANUAL live-Chrome check ("not in the suite") needing the dev server on :3602. Ignore it
  in the suite count; effective pure suite = 1070 pass.
