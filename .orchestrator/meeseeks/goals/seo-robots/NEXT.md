# Note to the next Meeseeks (seo-robots)

**This run CLOSED "OG-image autogen tracer + decision"** (OG-image track, item 1/4). DECISION =
the `browser` Worker binding + `@cloudflare/puppeteer` (CF-native like AI/IMAGES, no per-Site secret)
over the REST API (which would need an account token as a per-Site Worker secret via the deployer).
Shipped `lib/render/og-image.ts`: PURE key scheme `ogImageKey`/`isOgImageKey` (`og/<id>.<locale>.png`,
own namespace ≠ `assets/`), OG dims (1200×630/png), + best-effort `screenshotPageToR2(pageUrl,key)`
(resolves BROWSER binding + puppeteer via a NON-LITERAL dynamic import → skips silently when the
optional dep/binding is absent, never throws). +6 tests, tsc clean. See the three new "OG-image"
CAVEATs. Live screenshot is HITL (paid plan + `npm i @cloudflare/puppeteer` + BROWSER binding in
wrangler.jsonc).

(Also landed earlier 2026-07-07, from parallel runs: SEO-audit deep component-tree scan; edge-cache
/sitemap.xml with its own `sitemap` Cache-Tag — see their CAVEATs.)

**Pick the highest-value GOAL slice (ranked):**
1. **OG-image autogen — CONTINUE the track (3 items left):**
   a. **Serving + metadata precedence** (LOWEST-risk, no paid plan needed — do this next): pure
      precedence helper `og:image = manual per-locale metaImage ?? auto og/<id>.<locale>.png ?? none`
      (absolute via resolveSiteOrigin), a serve route for the `og/` R2 objects (MUST be under /api or
      a fixed path — the catch-all shadows arbitrary page paths; use `isOgImageKey` to guard
      traversal), and extend social-cards.ts twitter:card input to count the auto screenshot. Unit-test
      the precedence helper. Authorable/testable WITHOUT the paid-plan screenshot working.
   b. **Publish wiring** (needs the binding armed to actually fire; plumbing is testable): on publish,
      per configured locale, IF no manual metaImage AND no `og/<id>.<locale>.png` exists →
      `ctx.waitUntil(screenshotPageToR2(absPageUrl, ogImageKey(id,loc)))`; page delete removes its
      `og/` objects. Best-effort, never blocks/fails the publish (purge-edge/IndexNow pattern).
   c. **Regenerate button** — per-locale "Generate from page" SEO-tab action (API route, stable error
      codes) + effective-og:image manual/auto badge, localized EN/FI/ET.
2. **Per-URL-locale branded 404** (Page-level SEO) — release-gated (r-*): inject request path as a
   header in worker.ts, read via next/headers + `peelActiveLocale` (exported from load-plan.ts) in
   not-found.tsx. A 404 is never edge-cached → reading the request header is safe. **Touches worker.ts
   — coordinate (parallel Meeseeks has owned worker.ts in recent cycles).**
3. **Naughty-robot rate limiting** (2 items) — the last untouched GOAL track; needs worker.ts
   (release-gated). Workers rate-limiting binding, 429+Retry-After over the cap on public page paths
   only (reuse isEdgeCacheCandidate gate), per-site threshold off the hot path.
4. **AI "fix missing alt" path** (lower-value) — `audit_alt` read tool + guide line; component-internal
   alt lives in the component `html` column so a fixer needs `update_component`, not set_block_props.

**HITL / release-pending (accumulating — needs a real deployed site + a release cut):**
- OG-image live screenshot (paid plan + BROWSER binding + install @cloudflare/puppeteer).
- /sitemap.xml edge cache — `cf-cache-status: HIT` on a deployed site after a second fetch; a page
  publish then busts it (worker.ts release-gated).
- SEO-audit deep scan live render of `/admin/settings/seo-audit`; ItemList JSON-LD authoring + Google
  Rich Results validation; builder chip; responsive images live `/media/<key>?w=640` + `<img srcset>`;
  `.md` variant caching; /llms.txt cached + purge; live 404 render; live IndexNow/edge-purge; AI
  generate_image live dims round-trip.
- NOTE: `scripts/live-ds-context-chip-check.mjs` is a MANUAL live-Chrome check (needs dev on :3602) —
  exclude it from the pure suite count.
