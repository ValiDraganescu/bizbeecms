# Goal: seo-robots
> Decomposes [main goal](../main/GOAL.md). The root north star is the ultimate yardstick.

Published CMS sites get a complete, correct **SEO + crawler surface** (user request 2026-07-07).
Four tracks, in priority order:

**1. Sitemap — absolutely correct + search-engine notify.** A locale-aware `/sitemap.xml` already
ships (built by `path-locales-edge-cache`, `CMS/src/app/sitemap.ts` — per-request D1 read, hreflang
alternates, localized slugs, wildcard pages skipped). This track (a) audits and fences its remaining
correctness seams (nothing non-published leaks in, lastmod accuracy, the sitemap itself never served
stale by the edge cache), and (b) adds **IndexNow** notification on publish/unpublish/delete/slug
change so engines that support it (Bing, Yandex, Seznam, Naver) learn of changes immediately.
Google retired sitemap ping in 2023 — for Google the sitemap + robots pointer IS the mechanism.

**2. JSON-LD components.** A new custom-component **kind** in the existing components system: the AI
(and operators) author JSON-LD components that render as `<script type="application/ld+json">`
instead of visible HTML. Props/bindings/collection data interpolate into the JSON exactly like they
do into HTML trees — that's why they're components, not a static page field: dynamic pages (wildcard
`:param` detail pages, collection-bound content) get correct per-URL structured data. Added to pages
as blocks via the builder and the AI, same draft/publish lifecycle as other components.

**3. robots.txt — per-site configurable.** Served from site data: **structured rules** (per-user-agent
allow/disallow rows) editable in site settings, plus a **free-text override** that, when set, is
served verbatim. Sane seeded default: allow all, disallow /admin /api /preview, `Sitemap:` pointer.

**4. Naughty-robot rate limiting.** robots.txt is advisory; bad bots ignore it. The custom worker
entrypoint (`CMS/worker.ts`, built by path-locales-edge-cache) enforces a per-IP rate limit on
public page paths via Cloudflare's Workers rate-limiting binding — 429 over the cap, admin/API
untouched. The threshold is **per-site configurable** (D1 setting) — but the hot path must not gain
a per-request D1 read (see the edge-cache precedent: extra lookups only off the hot path / cached).

**5. Gap-closure additions (user-approved 2026-07-07).** 301 redirects (table + auto-capture on
slug/parent/localized-slug rename + manual admin — renames currently 404 every inbound link),
per-page noindex, full OG/Twitter cards, a designated branded per-locale 404 page, search-engine
verification tokens, auto BreadcrumbList JSON-LD from the page tree, and an llms.txt + per-page
markdown-variant surface for AI crawlers. Round 2 (same day): Core-Web-Vitals image work (lazy/CLS
post-pass now; responsive variants after an investigation task — workers.dev sites can't use zone
Image Resizing), an admin SEO-audit report (orphans, broken links, missing meta/alt), and an AI
bulk-meta tool. Round 3: **OG-image autogen** — Cloudflare Browser Rendering screenshots the top of
the published page (1200×630, per page×locale) as the og:image FALLBACK; generated on publish only
when nothing exists, regenerated via an explicit SEO-tab button, and a manually uploaded meta image
always wins (stored separately — autogen can never overwrite an upload).
Considered and NOT taken: RSS feeds, SERP snippet preview, per-page canonical
override (deferred until a real content-syndication need exists — self-canonicals already cover
locale/query duplicates).

**Good looks like:** an operator adds pages, renames slugs, publishes — the sitemap is right every
time and IndexNow-supporting engines are told immediately; rich results validate on pages carrying
JSON-LD components, including dynamic detail pages; every site serves a robots.txt its operator
controls; a scraper hammering a site gets 429s while real visitors and search crawlers are unaffected.
