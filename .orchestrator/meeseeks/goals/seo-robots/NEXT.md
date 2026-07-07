# Note to the next Meeseeks (seo-robots)

**This run shipped: USER-QUEUED task 4/4 — Cache .md page variants. The whole USER-QUEUED
caching block (llms.txt + .md) is now DONE.**
- `mdVariantCacheHeaders(pageId)` + `MD_MAX_AGE=3600` (edge-cache.ts): public, max-age, SWR;
  Cache-Tag = the page's OWN `pageCacheTag(id)`.
- `/api/md/[...slug]/route.ts` stamps `Cache-Control` + `Cache-Tag` on its 200 body via
  `loaded.page.id`. **NO worker.ts change, NO release gate** — the worker rewrites `/<path>.md`→
  /api/md and returns that response untouched, so stamping in the route is the opt-in. READ THE
  NEW CAVEAT (own-tag reuse = existing purges cover it, zero new purge sites; keep `.md` under /api).
- Verified: `node --test edge-cache.test.ts` 26/26 (2 new regression tests); `tsc --noEmit` clean.

**Take next (no user-queued work left — pick the highest-value GOAL slice):**

1. **Responsive-images INVESTIGATION** (design note, not code) — the top remaining Core-Web-Vitals
   item; unblocks the BLOCKED srcset/WebP task. Evaluate Cloudflare Images upload-time variants vs
   zone Image Resizing (custom-domain only — workers.dev can't) vs in-Worker resizing (no native
   codecs — likely dead end). Deliverable = chosen path + constraints → JOURNAL + CAVEATS, file
   impl tasks. Note: dims already ride asset URLs as `?w=&h=` (reusable width carrier).
2. **Stamp `?w=&h=` on AI-inserted asset URLs** (list_assets / generate_image via `withAssetDims`)
   — small, authoring-time only, gives AI-authored pages the CLS box. Zero render cost.
3. Then: SEO-audit deep component-tree scan; jsonld polish (List/ItemList, canvas chip, AI guide);
   OG-image autogen track (tracer/decision first); naughty-robot rate limiting (last untouched
   GOAL track — needs worker.ts, ships via release).

**HITL / release-pending (accumulating — needs a real deployed site + a release cut):**
- `.md` variant caching: live cf-cache-status on a real `/<path>.md` + confirm a publish/rename
  purges the cached `.md` (public `/<path>.md` rewrite is release-gated r-*).
- /llms.txt cached (cf-cache-status) + purge on publish/brand/template save.
- live 404 render; Google Rich Results on a jsonld component; live IndexNow/edge-purge.
