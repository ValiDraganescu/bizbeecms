# Backlog archive — seo-robots
Completed tasks, compressed to one line each (10–20 words), newest at bottom.
The full record lives in JOURNAL.md; this is the trimmed backlog trace.

- 2026-07-07 Sitemap audit: fixed wildcard page edge-caching stale /sitemap.xml (dotted-root gate); leak + lastmod audits clean, regression-tested.
- 2026-07-07 IndexNow best-effort notify on publish/unpublish/delete/rename; per-site key served at fixed /indexnow-key; 9 pure tests.
- 2026-07-07 Per-site robots.txt route handler from D1 robots_config; pure builder, verbatim free-text override, auto Sitemap pointer; 11 tests.
- 2026-07-07 Robots settings admin UI + REST GET/PUT writing through normalizing validation; settings-nav link, EN/FI/ET messages.
- 2026-07-07 301 redirects data model + serving: redirect table, pure matcher, (site) catch-all redirects before 404; 12 tests.
- 2026-07-07 Rename auto-capture: subtree-wide per-locale 301s, chain rewrite, IndexNow old-URL re-notify; best-effort in pages route.
- 2026-07-07 Manual redirects admin UI: list/add/delete, hard-reject validation with 8 stable error codes, EN/FI/ET.
- 2026-07-07 Per-page noindex: SEO-tab toggle, robots meta, sitemap + IndexNow leaf-only skip, preserve-when-absent contract.
- 2026-07-07 Full OG/Twitter cards in generateMetadata: pure social-cards builders, brand site_name, locale, summary_large_image when meta image exists.
- 2026-07-07 IndexNow notify on noindex OFF→ON: pre-captured URLs before meta write, pure transition helper, best-effort.
- 2026-07-07 Auto BreadcrumbList JSON-LD at plan time for depth≥1 pages; cycle-safe ancestor chain, breakout-safe escaping, RenderPlan.jsonLd.
- 2026-07-07 Per-site Google/Bing/Yandex verification tokens: settings + REST + editor, emitted via Metadata.verification, injection-stripping normalizer.
