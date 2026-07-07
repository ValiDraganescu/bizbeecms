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

## 2026-07-07 10:55 — Serve per-Site robots.txt (robots.txt track, task 1)
- **Status:** DONE
- **What I did:** per-Site robots.txt now served from D1, unlocking the `Sitemap:` pointer.
  - **Pure builder** `lib/render/robots-txt.ts` (dep-free, node-testable): `RobotsConfig`
    ({ groups: {userAgent, disallow[], allow[]}[], freeText }), `defaultRobotsConfig` (allow
    all, disallow /admin /api /preview — matches the worker private-surface paths),
    `normalizeRobotsConfig` (defensive: garbage → default; drops non-`/` paths, CR/LF/`:`
    injection in UAs/paths — line-oriented format so newline injection would forge rules),
    `buildRobotsTxt(config, origin|null)`. Free-text override served VERBATIM when non-blank
    (structured rules ignored); `Sitemap: <origin>/sitemap.xml` appended unless origin unknown
    OR the override already has its own `Sitemap:` line (case-insensitive, no double-add).
  - **Store** `db/settings-store.ts` `getRobotsConfig`/`setRobotsConfig` (settings key
    `robots_config`, mirrors getContentLocales — defensive read → default on missing/garbage).
  - **Route** `app/robots.txt/route.ts` (route handler, NOT the `robots.ts` metadata
    convention — free-text override needs verbatim text the structured MetadataRoute.Robots
    can't represent). force-dynamic (per-request D1, build prerender can't — same trap
    sitemap.ts/indexnow-key hit); text/plain, no-store. `/robots.txt` is a dotted-root file →
    already edge-cache-excluded by the worker dot gate, no worker.ts change.
- **Verified:** 11 new pure tests (robots-txt.test.ts) pass; full `npm test` 1710/1710 (was
  1699); `npx tsc --noEmit` clean on touched files. Did NOT run opennext build (heavy gate;
  route mirrors proven force-dynamic pattern) nor live-fetch (needs deployed origin — HITL).
- **Files:** CMS/src/lib/render/robots-txt.ts (+ .test.ts), CMS/src/db/settings-store.ts,
  CMS/src/app/robots.txt/route.ts

## 2026-07-07 11:00 — robots.txt settings UI (robots.txt track, task 2)
- **Status:** DONE
- **What I did:** admin UI + REST route to edit the per-Site robots config the
  serving route already reads.
  - **REST** `app/api/settings/robots/route.ts` (force-dynamic; GET/PUT; requireAdmin).
    PUT writes through `setRobotsConfig` (which calls normalizeRobotsConfig →
    strips CR/LF/`:` injection, drops non-`/` paths, garbage→seeded default). No
    purge on write: `/robots.txt` is force-dynamic + no-store + dotted-root
    edge-cache-excluded. Mirrors the content-locales route auth/shape.
  - **Editor** `components/settings/robots-editor.tsx` ("use client"): structured
    rule groups (userAgent + Disallow/Allow textareas, one path per line via
    `toLines`) + a free-text override textarea. When the override is non-blank the
    structured section dims + disables (it's ignored server-side). Optimistic edit
    → one PUT → adopt the server-normalized result. Note in UI: `Sitemap:` is
    auto-appended by the builder, operator must NOT add one.
  - **Page** `app/(admin)/admin/settings/robots/page.tsx` (force-dynamic; explicit
    route beats the `[[...slug]]` catch-all; D1-unbound offline → defaultRobotsConfig).
  - **Nav** `settings-nav.tsx`: added robots link to the "Site" group after
    content-locales.
  - **i18n** EN/FI/ET: `settingsNav.robots` label + a full `robots` namespace.
- **Verified:** `npx tsc --noEmit` clean; full `npm test` 1710/1710 (UI adds no new
  pure tests — the builder/normalizer are already covered by robots-txt.test.ts;
  `toLines` is a trivial split/trim/filter). Did NOT run opennext build (heavy gate;
  routes mirror proven force-dynamic patterns) nor click-test (needs live D1 — HITL).
- **Files:** CMS/src/app/api/settings/robots/route.ts,
  CMS/src/components/settings/robots-editor.tsx,
  CMS/src/app/(admin)/admin/settings/robots/page.tsx,
  CMS/src/components/settings/settings-nav.tsx,
  CMS/messages/{en,fi,et}.json

## 2026-07-07 11:09 — 301 redirects: data model + serving
- **Status:** DONE
- **What I did:** Added a `redirect` D1 table (Drizzle: unique `from_path`,
  `to_path`, `status` default 301, `created_at`) via `npm run db:generate` →
  migration `0029_brief_malcolm_colcord.sql` → applied `--local`. Pure matcher
  `lib/render/redirects.ts` (`normalizeRedirectPath` — strips origin/query/hash,
  single leading slash, collapses `//`, drops trailing slash except root,
  decode-once tolerant of bad escapes, case-SENSITIVE; `lookupRedirect` over an
  array or Map, self-redirect guard, status clamp to 301/302). Thin store
  `db/redirect-store.ts` (`getRedirect` = one indexed exact read on the unique
  index for the hot path; `listRedirects`/`upsertRedirect`(onConflictDoUpdate,
  drops self-redirects)/`deleteRedirect` for the later admin UI + auto-capture).
  Wired into `(site)/[[...slug]]/page.tsx`: on a loadPlan miss it reconstructs
  the request path from the catch-all segments, calls `getRedirect`, and throws
  `permanentRedirect` (308) for 301 / `redirect` (307) for 302 BEFORE `notFound()`.
- **Verified:** 12 new pure tests pass (normalize edge cases, lookup hits/miss/
  self-redirect/Map/status-clamp, AND the caveat-required assert that 301/302/
  307/308 responses are NOT edge-cache candidates via isEdgeCacheCandidate).
  Full suite 1710→1722, `tsc --noEmit` clean, migration applied local. Could NOT
  live-verify a real 301 on a deployed site (needs deploy + a captured redirect).
- **Files:** CMS/src/db/schema.ts, CMS/src/db/redirect-store.ts,
  CMS/src/lib/render/redirects.ts, CMS/src/lib/render/redirects.test.ts,
  CMS/src/app/(site)/[[...slug]]/page.tsx,
  CMS/migrations/0029_brief_malcolm_colcord.sql, CMS/migrations/meta/*

## 2026-07-07 11:16 — 301 redirects task 2: auto-capture on rename
- **Status:** DONE
- **What I did:** A slug/parent/localized-slug rename now auto-creates 301 redirects
  old→new for the renamed page AND its whole subtree, in every content locale, and
  re-notifies IndexNow with the OLD URLs (crawlers were hitting 404s until now).
  - **Pure diff** `redirectsForRename(oldRows,newRows,affectedIds,defaultLocale,codes)`
    in `lib/render/redirects.ts`: builds old vs new `pagePathsByLocale` per affected id
    (same machinery as sitemap/IndexNow so stored `fromPath` matches `getRedirect`), drops
    unchanged/self pairs, dedupes `from` (first wins). Wildcard `:param` pages skipped.
  - **Pure** `descendantIds(rows,pageId)` in `localize-paths.ts`: page + full subtree,
    cycle-safe (rename shifts the whole subtree's URLs).
  - **Store** `applyRenameRedirects(pairs)` in `db/redirect-store.ts`: upserts each old→new
    (store normalizes + drops self-redirects), then NO-CHAINS rewrites existing redirects
    whose target == an old path to the new target (a→b + b→c ⇒ a→c), deleting any that
    would become a self-loop. `getPathRows()` added to page-store for the before/after snapshot.
  - **Wired** into `api/pages/route.ts` persist(): snapshot rows BEFORE upsertPageMeta;
    on `res.pathChanged`, diff + apply + notifyIndexNowUrls(old URLs). Entirely best-effort
    (try/catch) — never fails the page save. notifyIndexNowForPage (new URLs) still fires after.
- **Verified:** 5 new pure tests (default rename captures parent+descendant across en+fi,
  unchanged→[], localized-slug moves only that locale, from-dedupe, descendantIds subtree/cycle).
  Full suite 1722→1727 pass; `tsc --noEmit` clean. Could NOT verify live (needs a deployed
  site with real D1 + reachable origin — HITL).
- **Files:** `src/lib/render/redirects.ts`, `src/lib/render/localize-paths.ts`,
  `src/db/redirect-store.ts`, `src/db/page-store.ts`, `src/app/api/pages/route.ts`,
  `src/lib/render/redirects.test.ts`

## 2026-07-07 11:22 — 301 redirects task 3: manual redirects admin UI (track CLOSED)
- **Status:** DONE
- **What I did:** List/add/delete manual redirects in the CMS admin, mirroring the
  robots settings pattern — but with HARD rejects (robots normalizes silently; a
  chain/loop is an operator mistake worth surfacing, per the robots caveat "add
  hard rejects in the route before the store").
  - **Pure validator** `validateManualRedirect(input, existing, excludeId?)` in
    `lib/render/redirects.ts` → stable code union `RedirectValidationError`
    (`fromRequired`/`toRequired`/`fromShape`/`toShape`/`selfLoop`/`duplicate`/
    `chainFromIsTarget`/`chainToIsSource`) or null. Compares NORMALIZED paths
    (via `normalizeRedirectPath`) so it agrees with what the store writes. Chain
    guard: reject if `from` is any existing target, or `to` is any existing source.
    `duplicate` = `from` already a source (upsert would silently overwrite → make
    the operator delete first).
  - **REST** `app/api/settings/redirects/route.ts` (force-dynamic; requireAdmin):
    GET listRedirects, POST validate→upsertRedirect (201, or 400 `{error,code}`),
    DELETE by `?id=`. Mirrors robots route auth/shape.
  - **Editor** `components/settings/redirects-editor.tsx` ("use client"): add form
    + list with delete; POST then RE-READS the list (no optimistic add — rename
    auto-capture may add rows concurrently, so re-read = truth). Maps the stable
    `code` to localized `redirects.errors.<code>` copy.
  - **Page** `app/(admin)/admin/settings/redirects/page.tsx` (force-dynamic;
    explicit route beats catch-all; D1-unbound offline → empty list).
  - **Nav** `settings-nav.tsx`: redirects link in the "Site" group after robots.
  - **i18n** EN/FI/ET: `settingsNav.redirects` label + full `redirects` namespace
    (incl. all 8 error codes).
- **Verified:** 5 new pure tests (validateManualRedirect: happy/required/self-loop/
  duplicate/chain) pass; full `npm test` 1732/1732 (was 1727); `npx tsc --noEmit`
  clean. Did NOT run opennext build (heavy gate; routes mirror proven force-dynamic
  patterns) nor click-test (needs live D1 — HITL).
- **Files:** CMS/src/lib/render/redirects.ts (+ .test.ts),
  CMS/src/app/api/settings/redirects/route.ts,
  CMS/src/components/settings/redirects-editor.tsx,
  CMS/src/app/(admin)/admin/settings/redirects/page.tsx,
  CMS/src/components/settings/settings-nav.tsx,
  CMS/messages/{en,fi,et}.json
