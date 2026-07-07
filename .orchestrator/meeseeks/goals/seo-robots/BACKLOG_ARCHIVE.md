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
- 2026-07-07 JSON-LD component kind render tracer: kind/draft_kind columns, string-level slot binder, planPage funnels payload onto plan.jsonLd.
- 2026-07-07 JSON-LD authoring write path: template probe validation, upsert/publish/discard kind handling, PUT + AI tool kind param.
- 2026-07-07 JSON-LD read path: getComponentByName effective kind, X-Component-Kind header for the editor; portable bundle stays kind-free.
- 2026-07-07 JSON-LD × bindings verified seamless: hydrated block.props feeds jsonld templates; regression tests incl. escaping, route params.
- 2026-07-07 JSON-LD Develop editor: kind toggle, single JSON-template pane, emitted-data preview + Rich Results link, base64 template header.
- 2026-07-07 AI create_page/translate now purge edge cache + ping IndexNow; pure page-write-hooks purge decision, best-effort.
- 2026-07-07 Designated branded 404: not_found_page setting, not-found.tsx renders published page plan (default locale), admin editor, EN/FI/ET.
- 2026-07-07 /llms.txt AI-crawler index: brand header + published-page list linking .md variants, pure buildLlmsTxt, default locale.
- 2026-07-07 Markdown page variants: planToMarkdown serializer, /api/md route, release-gated worker rewrite of /<path>.md; 404s noindex.
- 2026-07-07 Image hygiene post-pass: lazy/decoding on non-LCP imgs, aspect-ratio CLS box from author dims, author props win.
- 2026-07-07 Asset pixel dims captured at upload: nullable width/height columns, client createImageBitmap read, trust-boundary clamp parse.
- 2026-07-07 Asset dims threaded to render imgs via ?w=&h= URL params stamped at pick time; zero render-time D1.
- 2026-07-07 Editable llms.txt template: renderLlmsTemplate via shared SLOT_RE, LLMS_TEMPLATE_VARS allowlist, verbatim store, auto fallback.
- 2026-07-07 llms.txt settings editor UI: api/settings/llms GET/PUT with hard unknown-slot reject, click-to-insert variables panel, EN/FI/ET.
- 2026-07-07 SEO audit admin report: pure auditSeo finds orphans, broken links, missing meta, missing alt; read-only localized page.
- 2026-07-07 AI bulk-meta tools: audit_meta lists per-locale meta gaps; set_page_meta merge-writes title/desc preserving metaImage, light purge/IndexNow.
- 2026-07-07 /llms.txt edge-cached: own llms tag, fixed-path worker carve-out (release-gated), purges on page/brand/template writes.
- 2026-07-07 .md variants edge-cached in-route under the page's own tag; existing per-page purges cover it, no worker change.
- 2026-07-07 Responsive-images investigation: IMAGES binding resizes on workers.dev; chose ?w= allowlist on-delivery transform, filed 2 impl tasks.
- 2026-07-07 AI list_assets URLs now stamp ?w=&h= intrinsic dims so AI-inserted gallery images get the CLS box.
