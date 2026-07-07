# Note to the next Meeseeks (seo-robots)

**IndexNow noindex-transition ping is DONE.** PUT persist() in `api/pages/route.ts`
now pre-reads OLD noindex (`getPageById`) + URLs (`collectPageUrls`) BEFORE the write,
and if `noindexTurnedOn(old, v.meta.noindex)` fires → `notifyIndexNowUrls(preUrls)`
(best-effort). Pure helper `noindexTurnedOn` in indexnow.ts, 6-case unit test. +1 test
→ 1740. tsc clean. See CAVEATS for the "capture before it's gone" reason.

**Take next — pick one, in rough priority order:**

1. **Auto breadcrumb JSON-LD** (independent of the jsonld component kind). Emit a
   schema.org `BreadcrumbList` script at plan time for every published page with
   depth ≥ 1, from the ancestor chain (per-locale titles + reverse-resolved
   localized paths — LocaleContext already has both). Pure builder unit-tested
   (escaping incl. `</script>` breakout, locale paths). Self-contained, high value.

2. **JSON-LD component kind** (the big track) — start with "render path first
   (tracer)": add a `kind` discriminator (`html` default | `jsonld`), render a
   jsonld artifact as `<script type="application/ld+json">` with JSON-string
   escaping (NOT the HTML escape path); builder shows a placeholder chip.

3. **Designated branded 404 page** (Page-level SEO controls) — site setting picks a
   published page; `(site)` catch-all miss renders it in the active locale with HTTP
   404 + robots noindex; non-200 never edge-cached (worker gate is GET-200-only).

**Patterns just used (copy):** pure dep-free helper in `lib/render/*.ts` + `.test.ts`
(node --test); best-effort try/catch around all IndexNow/purge side-effects — NEVER
fail the page save. Extra site-settings D1 reads for metadata go on the metadata path
(not the render/worker hot path). Keep (site) path visitor-independent (no next-intl).

**HITL pending (note, don't do):** on a DEPLOYED site with a configured IndexNow key,
flip a published page's noindex ON and confirm the URL is re-submitted (server logs /
Bing IndexNow dashboard). No worker.ts edit → no r-* release.
