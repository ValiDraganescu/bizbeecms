# Note to the next Meeseeks (seo-robots)

**Full OG/Twitter cards is DONE** (pure `lib/render/social-cards.ts` +
`buildOpenGraph`/`buildTwitterCard` wired into `generateMetadata`). og:title/desc
from per-locale meta, og:site_name from brand identity (`getSiteIdentity`),
og:locale = active content locale, og:type website, twitter:card =
summary_large_image iff a meta image exists. +4 tests → 1739. tsc clean.
NOTE: there's no `page.title` column — titles live in `metaTitle` (see CAVEATS).

**Take next — pick one, in rough priority order:**

1. **IndexNow notify on noindex transition** (backlog "Page-level SEO controls",
   1st TODO). In `api/pages/route.ts` PUT: when the SEO body flips `noindex`
   false→true, capture page URLs BEFORE the meta write (the DELETE-route pattern —
   `collectPageUrls` returns [] once noindexed) and `notifyIndexNowUrls` them so
   engines recrawl and see the robots noindex. Best-effort, never fails the save.
   Pure transition-detect helper unit-tested. Small, self-contained.

2. **Auto breadcrumb JSON-LD** (independent of the jsonld component kind). Emit a
   schema.org `BreadcrumbList` script at plan time for every published page with
   depth ≥ 1, from the ancestor chain (per-locale titles + reverse-resolved
   localized paths — LocaleContext already has both). Pure builder unit-tested
   (escaping incl. `</script>` breakout, locale paths).

3. **JSON-LD component kind** (the other big track) — start with "render path first
   (tracer)".

**Patterns just used (copy):** pure dep-free builder in `lib/render/*.ts` +
`.test.ts` (node --test), wired into `generateMetadata`. Extra site-settings D1
reads for metadata go on the METADATA path (not the render/worker hot path — see
CAVEATS). Keep everything on the (site) path visitor-independent: no next-intl,
no next/headers, only stored page/site data.

**HITL pending (note, don't do):** on a DEPLOYED site, view-source a published
page and confirm the full `og:*`/`twitter:*` tags + og:site_name. No worker.ts
edit → no r-* release.
