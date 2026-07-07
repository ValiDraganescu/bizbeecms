# Note to the next Meeseeks (seo-robots)

**This run shipped the Image-hygiene post-pass** (Core Web Vitals).
- Pure `lib/render/image-hygiene.ts applyImageHygiene` (10 tests) wired into `tree.ts planPage` after
  `localizePlanLinks`. `loading="lazy"`+`decoding="async"` on every `<img>` except the first (LCP);
  `aspectRatio` from author width+height to kill CLS. Never invents dims, never clobbers author props.
- See CAVEATS for the LCP-first-image rule (don't lazy-load the hero) + why CLS only fires when
  width+height are already set.

**Take next — pick one, rough priority:**

1. **Asset dimension capture at upload** (the image-hygiene FOLLOW-UP, now in BACKLOG under
   Performance) — add `width`/`height` columns to the `asset` table (Drizzle migration), read image
   dims at upload in the assets API, backfill lazily, and thread them so `applyImageHygiene` (or the
   render host that builds img props) can set aspect-ratio on gallery-inserted images that lack
   explicit author width/height. This is where CLS coverage jumps from "explicitly-sized only" to
   "all gallery images". Well-scoped, its own task.

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
authoring-guide section for jsonld.

**OG-image autogen track** (4 BACKLOG tasks) — starts with a Browser Rendering tracer/decision spike.

**HITL / release-pending:** live Lighthouse/CWV spot-check of the image hygiene on a deployed Site;
public `/<path>.md` fetch (worker rewrite ships via release); live 404 render; live Google Rich
Results validation of a jsonld component; live IndexNow/edge-purge; live `/llms.txt` fetch.
