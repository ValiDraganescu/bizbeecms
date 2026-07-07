# Note to the next Meeseeks (seo-robots)

**This run CLOSED "SEO audit — deep component-tree scan"** (Operator SEO tooling track). The audit
now sees `<a href>`/`<img src alt>` authored INSIDE referenced component trees, not just raw
`page.blocks` props. PURE `extractComponentSeo` + `buildComponentSeoIndex` in `seo-audit.ts` walk the
already-resolved `listComponents()` rows (JSON `tree` + `kind`); `auditSeo` gained an optional 3rd
`componentSeo` param (transitive, cycle-safe, jsonld skipped). Admin route wires it in. +10 tests,
suite 1914, tsc clean. See the new "SEO audit DEEP component-tree scan" CAVEAT.

**Pick the highest-value GOAL slice (ranked):**
1. **Per-URL-locale branded 404** (backlog, Page-level SEO) — release-gated (r-*): inject request
   path as a header in `worker.ts`, read via `next/headers` + `peelActiveLocale` (exported from
   load-plan.ts) in not-found.tsx. A 404 is never edge-cached → reading the request header is safe.
2. **OG-image autogen track** (4 backlog items) — start with the tracer/decision spike: Browser
   Rendering `browser` binding vs REST API; screenshot one published page to R2
   `og/<pageId>.<locale>.png`; skip silently in local dev (needs a public origin). Paid-plan gate.
3. **Naughty-robot rate limiting** (2 backlog items) — the last untouched GOAL track; needs
   worker.ts (release-gated r-*): Workers rate-limiting binding, 429+Retry-After over the cap on
   public page paths only (reuse the isEdgeCacheCandidate gate), per-site threshold off the hot path.
4. **Edge-cache /sitemap.xml with its own tag** — mirror the /llms.txt carve-out (own `sitemap`
   Cache-Tag, fixed-path worker match, release-gated r-*). NOTE: a parallel Meeseeks was taking THIS
   in a separate worktree this run — check the JOURNAL/git before starting it to avoid a redo.
5. **AI "fix missing alt" path** (lower-value follow-up) — `audit_alt` read tool + guide line so the
   AI drives `set_block_props` from the alt audit. Now that the deep scan finds component-internal
   missingAlt too, an AI fixer has more surface — but component-internal alt lives in the component's
   `html` column, not block props, so a fixer would need `update_component`, not just set_block_props.

**HITL / release-pending (accumulating — needs a real deployed site + a release cut):**
- SEO-audit deep scan: live render of `/admin/settings/seo-audit` on a site with components that
  carry internal links/images (only unit-verified this run).
- ItemList JSON-LD authoring + builder chip live checks; responsive-images live resize + srcset;
  `.md` variant caching; /llms.txt cached + purge; live 404 render; live IndexNow/edge-purge;
  AI generate_image live dims round-trip.
- NOTE: `scripts/live-ds-context-chip-check.mjs` is a MANUAL live-Chrome check (needs dev on :3602) —
  exclude it from the pure suite count. Effective pure suite this run = 1914 pass / 0 fail.
