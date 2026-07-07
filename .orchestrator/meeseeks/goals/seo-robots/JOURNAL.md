# Journal — seo-robots
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-07-07 10:41 — Sitemap audit + fence (backlog task 1)
- **Status:** DONE
- **What I did:** Full audit of the sitemap surface; found and fixed ONE real defect.
  - **DEFECT (fixed):** `/sitemap.xml` passed `isEdgeCacheCandidate` ("sitemap.xml" isn't a
    SKIP_SEGMENT), and worker.ts then ran `resolvePage(["sitemap.xml"])` — a TOP-LEVEL wildcard
    page (`:param` matches ANY segment) resolves, and with `cache_max_age > 0` its
    Cache-Control/Cache-Tag got stamped onto the sitemap XML response → edge-cached STALE sitemap
    that no page-publish purge clears (publish purges `page:<publishedId>`, not the wildcard's tag).
    Fix: `isEdgeCacheCandidate` rejects dotted SINGLE-segment paths (`SLUG_RE` forbids "." so no
    real page URL is a dotted root file). Also future-proofs robots.txt, llms.txt, favicon.ico and
    the IndexNow `/<key>.txt`. Regression tests fail-before/pass-after; root-only scope fenced
    (`/fi/sitemap.xml`, `/products/v2.0` stay cacheable).
  - **Non-published leak hunt: no defect.** publishedPagePaths gates on LEAF publishStatus only
    (deliberate — matches resolvePage: unpublished ancestor still routes a published child); drafts,
    dangling parents, cycles, wildcards already fenced in sitemap-paths.test.ts. Per-locale gaps
    impossible: publish is page-level (no per-locale publish), and localized-slug URL emission is
    verified + fenced by localize-paths.test.ts (prior goal — its CAVEATS say don't re-hunt).
  - **lastmod audit: acceptable, two minor over-reports.** `page.updatedAt` bumps on publishDraft ✓
    and meta writes ✓ (both change live bytes); saveDraftBlocks does NOT bump ✓ (draft edits don't
    change published output). Over-reports: getDraft auto-create and restore-to-draft bump
    updatedAt without changing published bytes — hint-level noise, NOT fixed (would need a second
    live-content timestamp on the page row; also updatedAt drives admin "recently edited" where the
    bump is wanted). Known gap: component/theme/brand publishes change rendered HTML without
    bumping any page's updatedAt — inherent to lastmod-per-row, not worth a usage-graph walk.
- **Verified:** new tests fail before fix, pass after; full `npm test` 1690/1690; `npx tsc --noEmit` clean.
- **Files:** CMS/src/lib/render/edge-cache.ts, CMS/src/lib/render/edge-cache.test.ts

## 2026-07-07 10:50 — IndexNow notify on content change (Sitemap track #2)
- **Status:** DONE
- **What I did:** Best-effort IndexNow submission on page publish/unpublish/delete/rename.
  - **Pure core** `lib/render/indexnow.ts` (dep-free, node-tested): `isValidIndexNowKey`
    (8–128 `[a-zA-Z0-9-]`), `generateIndexNowKey` (32 hex via WebCrypto, injectable RNG),
    `buildSubmission` (POST body `{host,key,keyLocation,urlList}`; dedupes, drops foreign
    hosts, null on bad key/origin/empty), `pageUrlsAllLocales` (one page's absolute URLs
    across all content locales via the SAME `pagePathsByLocale`+translator the sitemap uses
    → URLs match sitemap exactly; [] for wildcard/unreconstructible). `INDEXNOW_KEY_PATH`.
  - **Key storage** `db/settings-store.ts` `getIndexNowKey`: generate-once-and-persist
    (settings key `indexnow_key`); invalid stored value → regenerate.
  - **Key file route** `app/indexnow-key/route.ts` (force-dynamic, text/plain, no-store) —
    serves the key at the FIXED `/indexnow-key` path. WHY fixed not `/<key>.txt`: Next's
    root optional-catch-all `(site)/[[...slug]]` owns `/<anything>`, so a dynamic `/[key].txt`
    route collides. IndexNow spec permits any `keyLocation` on the host → fixed path is fine.
  - **Best-effort notify** `lib/render/indexnow-notify.ts` (CF-coupled fetch shell, mirrors
    purge-edge.ts): `submitIndexNowUrls`, `collectPageUrls`, `notifyIndexNowForPage`,
    `notifyIndexNowUrls`. Uses `ctx.waitUntil` so the POST never blocks the admin response;
    every failure mode → false/no-op, never throws.
  - **Wiring:** publish route (after purge), pages PUT (after purge, existing-page updates —
    unpublish/rename/SEO edit → recrawl new URLs), pages DELETE (capture URLs BEFORE delete).
  - Did NOT ping Google (retired 2023; caveat). Rename submits NEW URLs; OLD-URL handling is
    the 301-redirects task (backlog) — noted inline + in NEXT.
- **Verified:** 9 new pure tests (indexnow.test.ts) pass; full `npm test` 1699/1699 (was 1690);
  `npx tsc --noEmit` clean. Did NOT run opennext build (heavy pre-commit gate; route mirrors
  proven sitemap.ts force-dynamic pattern) nor live-submit (needs deployed origin+key — HITL).
- **Files:** CMS/src/lib/render/indexnow.ts (+ .test.ts), CMS/src/lib/render/indexnow-notify.ts,
  CMS/src/app/indexnow-key/route.ts, CMS/src/db/settings-store.ts,
  CMS/src/app/api/pages/route.ts, CMS/src/app/api/pages/[id]/publish/route.ts
