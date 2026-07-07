# Note to the next Meeseeks (seo-robots)

**This run SHIPPED the last lower-value follow-up: edge-cache /sitemap.xml with its OWN `sitemap`
Cache-Tag** (mirrors the /llms.txt carve-out). `sitemapXmlCacheHeaders` in edge-cache.ts (fixed
`/sitemap.xml` match) + worker.ts folds it into the SAME dot-file block as llms via `?? `. Purged by
the page-CONTENT sites only (publish, api/pages PUT both branches + DELETE, AI page-write-hooks) —
NOT brand/llms-template saves (not sitemap content). 4 tests; full suite 1909 pass, tsc clean (only
fresh-worktree CF-ambient noise, gone after `npx wrangler types` + real build env). See the new
"/sitemap.xml edge caching" CAVEAT for the purge-site subset rule. Release-gated (worker.ts, r-*) —
HITL to verify `cf-cache-status` on a deployed site.

**Pick the highest-value GOAL slice (ranked):**
1. **SEO-audit deep component-tree scan** (Operator SEO tooling) — NOTE a parallel Meeseeks was
   assigned this on 2026-07-07; CHECK the JOURNAL/BACKLOG before taking it (may already be DONE).
   The audit only scans raw `page.blocks`; links/images/alt authored INSIDE referenced component
   trees are missed. Build a dep-light component-tree href/img extractor over `getComponentByName`
   (NOT the full plan — pulls next-intl, breaks dep-free `node --test`), feed into `auditSeo`.
2. **Per-URL-locale branded 404** — release-gated (r-*): inject request path as a header in
   `worker.ts`, read via `next/headers` + `peelActiveLocale` (exported from load-plan.ts) in
   not-found.tsx. A 404 is never edge-cached → reading the request header there is safe.
3. **OG-image autogen track** (4 backlog items) — start with the tracer/decision spike: Browser
   Rendering `browser` binding vs REST API; screenshot one published page to R2
   `og/<pageId>.<locale>.png`; skip silently in local dev (needs a public origin). Paid-plan gate.
4. **Naughty-robot rate limiting** (2 backlog items) — the last untouched GOAL track; needs
   worker.ts (release-gated r-*): Workers rate-limiting binding, 429+Retry-After over the cap on
   public page paths only (reuse the isEdgeCacheCandidate gate), per-site threshold off the hot path.
5. **AI "fix missing alt" path** (lower-value follow-up) — audit_alt read tool + guide line so the AI
   knows to set_block_props the alt.

**HITL / release-pending (accumulating — needs a real deployed site + a release cut):**
- NEW: /sitemap.xml edge cache — `cf-cache-status: HIT` on a deployed site after a second fetch; a
  page publish then busts it (worker.ts release-gated).
- ItemList JSON-LD authoring (builder checkbox); Google Rich Results validation on a real published
  category page. Builder chip live check. AI generate_image live dims round-trip. Responsive images
  live `/media/<key>?w=640` + `<img srcset>`. `.md` variant caching; /llms.txt cached + purge; live
  404 render; live IndexNow/edge-purge.
- NOTE: `scripts/live-ds-context-chip-check.mjs` is a MANUAL live-Chrome check, not in the suite.
