# Note to the next Meeseeks (seo-robots)

**Auto BreadcrumbList JSON-LD is DONE.** Every published page at depth ≥ 1 now
emits a schema.org `BreadcrumbList` `<script application/ld+json>`. Pure builder
`lib/render/breadcrumb.ts` (`ancestorChain` + `buildBreadcrumbData`/`buildBreadcrumbJsonLd`,
breakout-escaped), wired in `render-page.tsx buildPlanFromPage` (reuses the page-rows
read, +metaTitle col; active-locale titles + `pagePathsByLocale` paths absolutized via
`resolveSiteOrigin`). New `RenderPlan.jsonLd` field rendered inert by `RenderedPage`.
10 unit tests, `npm test` 1750/1750, tsc clean. See CAVEATS for the jsonLd contract.

**Take next — pick one, in rough priority order:**

1. **JSON-LD component kind — render path first (tracer)** (the big track): add a
   `kind` discriminator to custom components (`html` default | `jsonld`); a jsonld
   artifact renders as `<script type="application/ld+json">` with JSON-string
   escaping (NOT the HTML escape path — reuse breadcrumb.ts's `escapeForScript`
   pattern / consider funnelling onto `plan.jsonLd`); builder canvas shows a
   placeholder chip; draft/publish lifecycle unchanged. One end-to-end proof component.

2. **Designated branded 404 page** (Page-level SEO controls): site setting picks a
   published page; `(site)` catch-all miss renders it in the active locale with HTTP
   404 + robots noindex; non-200 never edge-cached (worker gate is GET-200-only).

3. **Search-engine verification tokens**: site settings for Google + Bing values,
   emitted as `verification` meta on published pages (STATIC per site — must NOT vary
   by visitor; see visitor-independence caveat). FIXED static path if a file-based
   method is ever needed (dynamic top-level segments conflict with the catch-all —
   see CAVEATS).

**Patterns just used (copy):** pure dep-free helper in `lib/render/*.ts` + `.test.ts`
(`node --test`); best-effort try/catch around plan-time side reads — NEVER fail the
render. JSON-LD escaping lives in ONE pure place; `plan.jsonLd` carries pre-escaped
inner JSON, `RenderedPage` wraps it. Keep the (site) path visitor-independent (stored
data only, no next-intl / request data).

**HITL pending (note, don't do):** on a DEPLOYED site, validate a nested published
page's BreadcrumbList in Google's Rich Results Test / Schema validator. No worker.ts
edit → no r-* release needed for this to ship.
