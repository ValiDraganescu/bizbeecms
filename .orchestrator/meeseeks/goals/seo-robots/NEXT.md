# Note to the next Meeseeks (seo-robots)

**TWO parallel runs landed on 2026-07-07 (driver merged the lane-B worktree):**

1. **SEO audit — deep component-tree scan (DONE).** The audit now sees `<a href>`/`<img src alt>`
   authored INSIDE referenced component trees, not just raw `page.blocks` props. PURE
   `extractComponentSeo` + `buildComponentSeoIndex` in `seo-audit.ts` walk the already-resolved
   `listComponents()` rows; `auditSeo` gained an optional 3rd `componentSeo` param (transitive,
   cycle-safe, jsonld skipped). Admin route wires it in. +10 tests, tsc clean. See the new
   "SEO audit DEEP component-tree scan" CAVEAT.
2. **Edge-cache /sitemap.xml with its OWN `sitemap` Cache-Tag (DONE — mirrors the /llms.txt
   carve-out).** `sitemapXmlCacheHeaders` in edge-cache.ts (fixed `/sitemap.xml` match); worker.ts
   folds it into the SAME dot-file block as llms via `??`. Purged by page-CONTENT sites only
   (publish, api/pages PUT both branches + DELETE, AI page-write-hooks) — NOT brand/llms-template
   saves. See the "/sitemap.xml edge caching" CAVEAT for the purge-site subset rule. Release-gated
   (worker.ts, r-*).

**Pick the highest-value GOAL slice (ranked):**
1. **OG-image autogen track** (4 backlog items, start with the tracer/decision spike) — NOTE: a
   parallel Meeseeks (lane A) was assigned the tracer on 2026-07-07; CHECK JOURNAL/BACKLOG/git
   before taking it. Browser Rendering `browser` binding vs REST API; screenshot one published page
   to R2 `og/<pageId>.<locale>.png`; skip silently in local dev (needs a public origin). Paid-plan gate.
2. **Per-URL-locale branded 404** — release-gated (r-*): inject request path as a header in
   `worker.ts`, read via `next/headers` + `peelActiveLocale` (exported from load-plan.ts) in
   not-found.tsx. A 404 is never edge-cached → reading the request header there is safe.
3. **Naughty-robot rate limiting** (2 backlog items) — the last untouched GOAL track; needs
   worker.ts (release-gated r-*): Workers rate-limiting binding, 429+Retry-After over the cap on
   public page paths only (reuse the isEdgeCacheCandidate gate), per-site threshold off the hot path.
4. **AI "fix missing alt" path** (lower-value follow-up) — `audit_alt` read tool + guide line so the
   AI drives `set_block_props` from the alt audit. Component-internal alt lives in the component's
   `html` column, not block props — a fixer needs `update_component`, not just set_block_props.

**HITL / release-pending (accumulating — needs a real deployed site + a release cut):**
- NEW: /sitemap.xml edge cache — `cf-cache-status: HIT` on a deployed site after a second fetch; a
  page publish then busts it (worker.ts release-gated).
- SEO-audit deep scan: live render of `/admin/settings/seo-audit` on a site with components that
  carry internal links/images (only unit-verified).
- ItemList JSON-LD authoring + Google Rich Results validation; builder chip live check; responsive
  images live `/media/<key>?w=640` + `<img srcset>`; `.md` variant caching; /llms.txt cached +
  purge; live 404 render; live IndexNow/edge-purge; AI generate_image live dims round-trip.
- NOTE: `scripts/live-ds-context-chip-check.mjs` is a MANUAL live-Chrome check (needs dev on
  :3602) — exclude it from the pure suite count.
