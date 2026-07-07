# Note to the next Meeseeks (seo-robots)

**This run (2026-07-07, lane-B worktree):** Per-site rate-limit THRESHOLD (rate-limit track 2/2 —
DONE). D1 setting `rate_limit_preset` (`off`/`normal`/`strict`, default normal) + a radio-group
settings UI at `/admin/settings/rate-limit` (EN/FI/ET). worker.ts gates the limiter on it via a 30s
in-isolate TTL cache (`getRateLimitPresetCached` — NO per-request D1 read on the hot gate). `off`
skips `limiter.limit()`; `strict` layers an in-isolate 40/60s counter on top of the fixed 100/60s
binding (a looser-than-100 cap is impossible with a fixed binding — the binding is the ceiling).
Pure `lib/render/rate-limit-config.ts` +6 tests (suite 1943), tsc clean (only pre-existing env.DB
typegen errors). Release-gated (worker.ts, r-*). See the two "Per-site rate-limit THRESHOLD" CAVEATs.
**The whole rate-limit track (both items 1/2 + 2/2) is now DONE.**

**A parallel run this cycle** was doing OG-image publish wiring (OG track 3/4) in the MAIN checkout
— check the journal/backlog for its landing before picking OG work, to avoid collision.

**Pick the highest-value GOAL slice (ranked):**
1. **OG-image regenerate button (OG track item 4/4):** per-locale "Generate from page" action in the
   page-settings SEO tab (API route, stable error codes) that (re)screenshots on demand; SEO tab shows
   the currently-effective og:image with a manual/auto badge; localized EN/FI/ET. (Do item 3/4 —
   publish wiring — first if the parallel run did NOT land it; check backlog.)
2. **Purge SITEMAP+LLMS cache tags on content-locales save** (scrub-queued small task): the
   content-locales PUT (`api/settings/content-locales` route.ts:74) purges only PAGES_CACHE_TAG; a
   locale add/remove leaves the edge-cached /sitemap.xml + /llms.txt stale up to max-age. One-line
   purge extension + update the two edge-cache CAVEATs' purge-coverage lists.
3. **AI "fix missing alt" path** (lower-value): `audit_alt` read tool + guide line; component-internal
   alt lives in the component `html` column so a fixer needs `set_block_props`/`update_component`.

**HITL / release-pending (accumulating — needs a deployed Site + a release cut):**
- Per-site rate-limit THRESHOLD — on a deployed Site (paid plan for the binding): `off` disables the
  429, `strict` cuts an IP off at ~40/min vs `normal`'s ~100/min. In-isolate strict counter + 30s
  preset-cache propagation only observable live.
- Naughty-robot rate limit 1/2 — 429 + `Retry-After:60` over the cap per IP; verified-crawler
  exemption only with Bot Management.
- OG-image live screenshot (paid plan + BROWSER binding + `npm i @cloudflare/puppeteer`) + live R2
  serve/precedence round-trip.
- Per-URL-locale branded 404 — `/fi/<missing>` renders the branded 404 in fi on a deployed Site.
- /sitemap.xml + /llms.txt edge cache — `cf-cache-status: HIT` on a second fetch; a publish busts it.
- SEO-audit deep scan live render; ItemList JSON-LD + Google Rich Results validation; builder chip
  live check; responsive images live `/media/<key>?w=640` + `<img srcset>`; `.md` variant caching;
  live IndexNow/edge-purge; AI generate_image live dims round-trip.
- NOTE: `scripts/live-ds-context-chip-check.mjs` is a MANUAL live-Chrome check (dev on :3602) —
  exclude it from the pure suite count.
