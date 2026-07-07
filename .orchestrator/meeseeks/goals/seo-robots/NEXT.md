# Note to the next Meeseeks (seo-robots)

**This run shipped: asset pixel-dimension capture at upload** (image-hygiene follow-up).
- Nullable `asset.width`/`height` INTEGER columns (migration 0032, applied --local).
- Client captures dims via `readImageDimensions` (image-thumb.ts) → `width`/`height` form fields →
  hardened by pure `parseAssetDimension` (asset.ts) → `putAsset`. Untrusted client input, clamped.
- Dims are NOT yet used at render — see CAVEATS: threading into `<img>` props is a FILED TODO and
  must NOT add a render-hot-path D1 read.

**Take next — pick one, rough priority:**

1. **Thread stored dims into render `<img>` props** (the direct continuation; BACKLOG under
   Performance). Make applyImageHygiene set aspect-ratio for gallery `<img src="/media/…">` that lack
   author width/height. HARD CONSTRAINT: the render path is edge-cached + 429-sensitive — NO new
   per-request D1 read. Recommended: bake width/height onto the block prop when the image PICKER
   inserts an asset (`page-builder/image-picker.tsx`) — authoring-time resolution, zero render lookup.
   That makes it a clean, well-scoped task and finally closes the CLS gap for gallery images.

2. **SEO-audit admin report** (orphans, broken internal links, missing meta/alt) — pure analyzers
   over page rows + plan trees, read-only localized EN/FI/ET admin page. No auto-fix. BACKLOG.

3. **Responsive-images INVESTIGATION** (design note, not code) — Cloudflare Images API vs zone Image
   Resizing (custom-domain only; workers.dev can't) vs in-Worker (no native codecs — likely dead
   end); deliverable = chosen path + constraints to JOURNAL/CAVEATS + filed impl tasks. Unblocks the
   BLOCKED srcset/WebP task.

4. **Per-URL-locale branded 404** (needs a release) — render the branded 404 in the visitor's URL
   locale via a worker.ts-injected request-path header read in not-found.tsx (`peelActiveLocale`
   already exported). Lower priority — default-locale 404 already works.

**jsonld polish (lower priority):** builder-canvas invisible-element CHIP for a jsonld block; AI
authoring-guide section for jsonld; per-row/ItemList JSON-LD for List blocks.

**OG-image autogen track** (4 BACKLOG tasks) — starts with a Browser Rendering tracer/decision spike.

**HITL / release-pending:** live upload verify that dims persist to R2/D1; live Lighthouse/CWV of the
image hygiene on a deployed Site; public `/<path>.md` fetch (worker rewrite ships via release); live
404 render; live Google Rich Results validation of a jsonld component; live IndexNow/edge-purge.
