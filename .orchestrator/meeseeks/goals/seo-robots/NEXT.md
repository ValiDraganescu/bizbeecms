# Note to the next Meeseeks (seo-robots)

**This run (lane-B worktree): Per-URL-locale branded 404 (DONE).** The branded 404 now renders in
the visitor's URL locale (`/fi/missing` → 404 in fi). worker.ts injects the request pathname as
header `REQUEST_PATH_HEADER` (`x-bizbee-path`, GET-only, overwrite-not-append); `not-found.tsx` reads
it via `next/headers` + new `peelActiveLocaleFromPath(pathname)` (load-plan.ts). Absent header
(pre-release worker) → site default = old behavior. Safe because a 404 is never edge-cached. +5
tests, suite 1919, tsc clean. Release-gated (worker.ts, r-*). See the new "Per-URL-locale branded
404" CAVEAT. **Page-level SEO controls track is now closed.**

**Pick the highest-value GOAL slice (ranked):**
1. **OG-image autogen track** (4 backlog items, start with the tracer/decision spike) — a parallel
   Meeseeks (lane A) was assigned the tracer on 2026-07-07; CHECK JOURNAL/BACKLOG/git before taking
   it (might already be DONE or DOING). Browser Rendering `browser` binding vs REST API; screenshot
   one published page to R2 `og/<pageId>.<locale>.png`; skip silently in local dev (needs a public
   origin). Paid-plan gate.
2. **Naughty-robot rate limiting** (2 backlog items) — the last untouched GOAL track (track 4);
   needs worker.ts (release-gated r-*): Workers rate-limiting binding, 429+Retry-After over the cap
   on public page paths only (reuse the isEdgeCacheCandidate gate), per-site threshold OFF the hot
   path (in-isolate cache w/ TTL, no per-request D1). Note: worker.ts now already injects
   REQUEST_PATH_HEADER on GETs — the rate-limit gate slots in near there.
3. **AI "fix missing alt" path** (lower-value follow-up) — `audit_alt` read tool + guide line so the
   AI drives `set_block_props`/`update_component` from the alt audit. Component-internal alt lives in
   the component's `html` column, not block props.

**HITL / release-pending (accumulating — needs a real deployed site + a release cut):**
- NEW: Per-URL-locale branded 404 — on a deployed Site with a designated 404 page + a non-default
  content locale: `/fi/<missing>` should render the branded 404 in fi (`<html lang="fi">`, fi meta),
  `/missing` in the default locale. worker.ts release-gated (r-*).
- /sitemap.xml edge cache — `cf-cache-status: HIT` on a second fetch; a page publish busts it.
- SEO-audit deep scan live render; ItemList JSON-LD + Google Rich Results validation; builder chip
  live check; responsive images live `/media/<key>?w=640` + `<img srcset>`; `.md` variant caching;
  /llms.txt cached + purge; live IndexNow/edge-purge; AI generate_image live dims round-trip.
- NOTE: `scripts/live-ds-context-chip-check.mjs` is a MANUAL live-Chrome check (dev on :3602) —
  exclude it from the pure suite count.
