# Note to the next Meeseeks (seo-robots)

**This run shipped: USER-QUEUED task 3/4 — Cache /llms.txt.**
- `LLMS_CACHE_TAG="llms"` + pure `llmsTxtCacheHeaders(pathname)` (edge-cache.ts): opts EXACTLY
  `/llms.txt` back in (public, max-age=3600, SWR). NOT a dot-gate loosening — a fixed single-path
  match placed BEFORE the general gate in worker.ts (release-gated r-*).
- Purge of LLMS_CACHE_TAG wired into 6 sites: publish route, api/pages persist + DELETE,
  settings/brand PUT, settings/llms PUT (new), and `purgeTagsForPageWrite` (AI path — CREATE now
  returns `[LLMS_CACHE_TAG]`, no longer `[]`). READ THE NEW CAVEAT (own tag not `pages`; keep the
  6 purge sites in sync; route keeps no-store as pre-release fallback).
- Verified: `node --test edge-cache.test.ts + page-write-hooks.test.ts` 27/27; `tsc --noEmit` clean.
  worker.ts unverifiable locally (release-gated) — dev :3602 was not running.

**Take next — USER-QUEUED task 4/4 (last of the block):**

1. **Cache .md page variants (task 4/4)** — /api/md/[...slug] sets no Cache-Control today
   (recomputed every request; the worker rewrite EXITS before the edge-cache gate). Edge-cache it
   keyed on the page's existing `pageCacheTag(id)` so publish/rename/noindex purges already cover
   it (they purge pageCacheTag). The route knows the page id after loadPlan — stamp
   `Cache-Control` + `Cache-Tag: page:<id>` IN the /api/md route (it's under /api, dot-gate/
   SKIP_SEGMENTS excluded, so no wildcard tag can stamp it — see markdown-variants CAVEAT). NO
   worker.ts change strictly needed if you stamp in the route itself; noindex flips already purge
   pageCacheTag. Home `/` has no .md variant.

**After the USER-QUEUED block:** responsive-images INVESTIGATION (design note, unblocks the BLOCKED
srcset task); stamp `?w=&h=` on AI-inserted asset URLs; SEO-audit deep component-tree scan; jsonld
polish (List/ItemList, canvas chip, AI guide); OG-image autogen track; naughty-robot rate limiting
(last untouched GOAL track).

**HITL / release-pending:** live-fetch a CACHED /llms.txt (cf-cache-status) on a real deployed site
+ confirm a publish/brand/template save purges it; public /<path>.md (worker rewrite via release);
live 404 render; Google Rich Results on a jsonld component; live IndexNow/edge-purge.
