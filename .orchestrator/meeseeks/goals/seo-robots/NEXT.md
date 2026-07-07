# Note to the next Meeseeks (seo-robots)

**This run shipped: the SEO-audit admin report** (`/admin/settings/seo-audit`).
- Pure `lib/render/seo-audit.ts auditSeo(pages, contentLocales)` (12 tests): orphans, broken
  internal links, missing per-locale meta title/desc, images missing alt. Store read
  `listPagesForAudit()`. Read-only localized EN/FI/ET server page + settings-nav item under "Site".
- SCOPE CAVEAT (read it): it scans RAW `page.blocks` props ONLY, not resolved component trees —
  links/images authored inside component markup aren't checked. Deep component-tree scan is a
  filed follow-up TODO. No worker.ts change → ships on next normal CMS build.

**Take next — pick one, rough priority:**

1. **AI bulk-meta assistant tool** (pairs naturally with the audit just shipped) — tool(s) letting
   the AI list pages/locales missing meta title/desc (reuse `listPagesForAudit` + auditSeo's
   `missingMeta`), then WRITE generated values through the existing `upsertPageMeta` validation path
   (per-locale maps, purge/IndexNow semantics intact). MUST run the noindex/rename pre-capture trio
   IF it can flip those — but a pure meta write can't, so the lighter AI-hook path is fine (see the
   AI write-path IndexNow caveat). Self-correcting errors naming exact page+locale.

2. **Responsive-images INVESTIGATION** (design note, not code) — Cloudflare Images API upload-time
   variants vs zone Image Resizing (custom-domain only; workers.dev can't) vs in-Worker (no native
   codecs — likely dead end). Deliverable = chosen path + constraints to JOURNAL/CAVEATS + filed
   impl tasks. Unblocks the BLOCKED srcset/WebP task. Dims already ride URLs as `?w=&h=` — reuse
   that query carrier for width hints.

3. **SEO-audit deep component-tree scan** (follow-up to this run) — extend the audit to also check
   links/images/alt authored inside referenced component trees (needs the D1 component resolver;
   see the new caveat + the filed BACKLOG TODO for the design fork).

4. **Per-URL-locale branded 404** (needs a release) — render the branded 404 in the visitor's URL
   locale via a worker.ts-injected request-path header read in not-found.tsx (`peelActiveLocale`
   already exported). Lower priority — default-locale 404 works.

**jsonld polish (lower):** builder-canvas invisible-element CHIP for jsonld; AI authoring-guide
section for jsonld; per-row/ItemList JSON-LD for List blocks.

**OG-image autogen track** (4 BACKLOG tasks) — starts with a Browser Rendering tracer/decision spike.

**Naughty-robot rate limiting** (2 tasks, needs worker.ts + release) — last untouched GOAL track.

**HITL / release-pending:** live-render the new SEO-audit admin page (needs live D1 + admin
session); live Lighthouse/CWV for the CLS aspect-ratio; live upload dims persist; public
`/<path>.md` fetch (worker rewrite via release); live 404 render; live Google Rich Results
validation of a jsonld component; live IndexNow/edge-purge.
