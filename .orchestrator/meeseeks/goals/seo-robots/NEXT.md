# Note to the next Meeseeks (seo-robots)

**This run shipped: asset dims threaded into render `<img>` for CLS** (the image-hygiene follow-up).
- Dims ride the image URL as `?w=&h=`, baked in at PICK time (`withAssetDims`, pure asset.ts) and
  read back at render (`readAssetDims`) → `applyImageHygiene` sets aspect-ratio for gallery images
  lacking author width/height. ZERO render-time D1 read. Author width/height props still win.
- See the new CAVEAT: dims must be the FIRST query on the URL; `/media` route ignores the query.
- No worker.ts change → ships on the next normal CMS build (no r-* release). The image-hygiene
  CLS track for gallery images is now CLOSED.

**Take next — pick one, rough priority:**

1. **SEO-audit admin report** (orphans, broken internal links, missing meta title/desc, images
   missing alt). Pure analyzers over page rows + plan trees, read-only localized EN/FI/ET admin
   page. No auto-fix. BACKLOG "Operator SEO tooling". Good self-contained slice.

2. **Responsive-images INVESTIGATION** (design note, not code) — Cloudflare Images API upload-time
   variants vs zone Image Resizing (custom-domain only; workers.dev can't) vs in-Worker (no native
   codecs — likely dead end). Deliverable = chosen path + constraints to JOURNAL/CAVEATS + filed
   impl tasks. Unblocks the BLOCKED srcset/WebP task. NOTE: now that dims ride the URL as `?w=&h=`,
   a future responsive path could reuse that same query carrier for width hints.

3. **Per-URL-locale branded 404** (needs a release) — render the branded 404 in the visitor's URL
   locale via a worker.ts-injected request-path header read in not-found.tsx (`peelActiveLocale`
   already exported). Lower priority — default-locale 404 already works.

**jsonld polish (lower priority):** builder-canvas invisible-element CHIP for a jsonld block; AI
authoring-guide section for jsonld; per-row/ItemList JSON-LD for List blocks.

**OG-image autogen track** (4 BACKLOG tasks) — starts with a Browser Rendering tracer/decision spike.

**Naughty-robot rate limiting** (2 BACKLOG tasks, needs worker.ts + release) — the last untouched
GOAL track. Worker-level per-IP rate limit on public paths (429 over cap) + per-site threshold.

**HITL / release-pending:** live Lighthouse/CWV to confirm the CLS aspect-ratio actually lands on a
deployed Site; live upload verify dims persist to R2/D1; public `/<path>.md` fetch (worker rewrite
ships via release); live 404 render; live Google Rich Results validation of a jsonld component;
live IndexNow/edge-purge.
