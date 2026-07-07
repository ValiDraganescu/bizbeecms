# Note to the next Meeseeks (seo-robots)

**Search-engine verification tokens are DONE.** Per-site Google/Bing/Yandex
site-verification tokens now emit as `<meta>` verification tags on every
published page. Pure `lib/render/site-verification.ts` (normalize strips
non-token chars → no injection; `buildVerificationMeta` → Next
`Metadata.verification`, bing under `other["msvalidate.01"]`). Store
`getSiteVerification`/`setSiteVerification` (key `site_verification`). Wired
in `generateMetadata` ((site)/[[...slug]]). Admin REST + editor + page + nav
link (Site group) + i18n EN/FI/ET. 7 unit tests, `npm test` 1757/1757, tsc clean.
See CAVEATS for the token-strip + Next-shape gotchas.

**Take next — pick one, in rough priority order:**

1. **JSON-LD component kind — render path first (tracer)** (the big track, still
   untouched): add a `kind` discriminator to custom components (`html` default |
   `jsonld`); a jsonld artifact renders as `<script type="application/ld+json">`
   with JSON-STRING escaping (NOT the HTML escape path — reuse breadcrumb.ts's
   escaper / consider funnelling onto `plan.jsonLd`); builder canvas shows a
   placeholder chip; draft/publish lifecycle unchanged. One end-to-end proof
   component. This is a multi-file track — scope tightly (render path only this run).

2. **Designated branded 404 page** (Page-level SEO controls): site setting picks a
   published page; `(site)` catch-all miss renders it in the active locale with HTTP
   404 + robots noindex; non-200 never edge-cached (worker gate is GET-200-only; assert).

3. **Serve `/llms.txt`** (AI-crawler surface): site name/description from brand
   identity + the published-page tree with links to each page's `.md` variant;
   reuse `publishedPagePaths`; force-dynamic like sitemap/robots; skip when origin
   unknown. (Pairs with the markdown-page-variants task.)

**Patterns just used (copy):** the SETTINGS-FEATURE recipe is now very stable —
pure dep-free `lib/render/*.ts` normalizer + `.test.ts` (node --test); settings-store
`get*/set*` on a `site_settings` key (defensive read → default); force-dynamic REST
`api/settings/<x>` (requireAdmin, PUT writes-through the normalizer); "use client"
editor that adopts the server-normalized result; explicit `(admin)/admin/settings/<x>`
page (beats the catch-all, D1-unbound offline → default); nav link in settings-nav.tsx;
i18n EN/FI/ET (`settingsNav.<x>` + a `<x>` namespace). Verification, robots, redirects
all follow it — copy one wholesale.

**HITL pending (note, don't do):** on a DEPLOYED site, paste a real Google/Bing token
and confirm Search Console / Webmaster Tools verifies. No worker.ts edit → no r-* release
needed for this to ship.
