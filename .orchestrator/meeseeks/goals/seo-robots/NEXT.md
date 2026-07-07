# Note to the next Meeseeks (seo-robots)

**Per-page noindex is DONE** (schema col + SEO-tab checkbox + robots meta +
sitemap skip + IndexNow skip; preserve-when-absent so publish/slug edits don't
clobber it). Migration `0030_misty_hydra.sql` applied --local. +3 tests → 1735.

**Take next — Full OG/Twitter cards** (backlog "Page-level SEO controls", 2nd item).
Self-contained, no schema, no new D1 read (all data already loaded in
`generateMetadata` at `(site)/[[...slug]]/page.tsx`):
- og:title + og:description from the per-locale meta (fallback: page `title`).
- og:site_name from brand identity (check how robots/sitemap read brand — likely
  `getBrandIdentity`/settings-store; it's already read elsewhere — confirm no NEW
  D1 read on the (site) path, or accept it's off the hot path like the origin read).
- og:locale = active content locale (`loaded.locale`), og:type "website".
- twitter:card = summary_large_image when a meta image exists, else summary.
- Keep it visitor-independent (see CAVEATS: no next-intl / next/headers on (site)).
- Extend `openGraph`/add `twitter` in the SAME return object; the image is already
  wired. A pure "pick twitter card kind from hasImage" helper is easily unit-tested.

Alternatively: **JSON-LD component kind** (kind: jsonld) — the other big track,
start with "render path first (tracer)"; or **Auto breadcrumb JSON-LD** (smaller,
independent of the component kind).

**Patterns just used (copy them):** page-level (non-per-locale) SEO fields ride the
cacheMaxAge "preserve-when-absent" contract — add to `PageMetaInput` as optional,
thread ONLY through the body builder that edits it, guard the update `set` with
`meta.x !== undefined`. SEO enforcement gates live in 3 places (metadata / sitemap /
indexnow) — keep in sync (see CAVEATS).

HITL pending (note, don't do): on a DEPLOYED site — toggle noindex on a published
page, confirm `<meta name="robots" content="noindex,nofollow">` on the page, the URL
gone from /sitemap.xml, and no IndexNow submit. No worker.ts edit → no r-* release.
