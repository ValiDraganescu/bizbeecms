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

## 2026-07-07 11:30 — Per-page noindex
- **Status:** DONE
- **What I did:** Added a per-page SEO noindex flag end-to-end.
  - **Schema/migration:** `page.noindex` INTEGER NOT NULL DEFAULT 0 (Drizzle:
    schema.ts → `db:generate` → migration `0030_misty_hydra.sql` → applied --local).
  - **Validation/model:** `PageMetaInput.noindex?: boolean` (preserve-when-absent,
    same contract as cacheMaxAge — SEO/publish/localized/cache bodies never carry
    it so they can't clobber it). `validatePageMeta` accepts booleans, rejects
    non-booleans, omits key when absent. `buildSeoMetaBody` gained an optional
    `noindex` 5th arg (only the SEO tab edits it). `PageSummary.noindex: boolean`
    (toSummary `row.noindex===1`); upsertPageMeta writes `noindex?1:0` on update
    (guarded) + insert.
  - **generateMetadata** ((site)/[[...slug]]): emits `robots:{index:false,follow:false}`
    when `loaded.page.noindex` — visitor-independent (stored column, not request-
    derived) so it's edge-cache-safe per the (site)-isolation caveat. No new D1 read
    (page row already loaded).
  - **Sitemap:** `SitemapPageRow.noindex` + `publishedPagePaths` skips the noindexed
    LEAF only (a noindexed ancestor still lets an indexable descendant through, like
    the unpublished-ancestor leaf-only gate). sitemap.ts selects the column.
  - **IndexNow:** `collectPageUrls` selects `noindex` and returns `[]` when the target
    page is noindexed → never submitted on publish/rename.
  - **UI:** SEO tab checkbox (page-level, outside the per-locale fieldset) +
    `seoNoindex`/`seoNoindexHint` i18n EN/FI/ET.
- **Verified:** full `npm test` 1735/1735 (was 1732; +3 tests: page-meta validate/
  build noindex, sitemap-paths leaf-vs-ancestor). `npx tsc --noEmit` clean. Migration
  applied to local D1. Did NOT run opennext build (heavy gate) nor live-click (HITL).
- **Files:** CMS/src/db/schema.ts, CMS/migrations/0030_misty_hydra.sql,
  CMS/migrations/meta/*, CMS/src/lib/pages/page-meta.ts (+ .test.ts),
  CMS/src/db/page-store.ts, CMS/src/app/(site)/[[...slug]]/page.tsx,
  CMS/src/lib/render/sitemap-paths.ts (+ .test.ts), CMS/src/app/sitemap.ts,
  CMS/src/lib/render/indexnow-notify.ts,
  CMS/src/components/page-builder/seo-form.tsx, CMS/src/lib/pages/page-picker.test.ts,
  CMS/messages/{en,fi,et}.json

## 2026-07-07 11:40 — Full OG/Twitter cards
- **Status:** DONE
- **What I did:** Complete OpenGraph + Twitter card metadata on published pages.
  - **Pure builders:** `lib/render/social-cards.ts` — `buildOpenGraph` (type:website,
    og:title←metaTitle, og:description←metaDescription, og:site_name←brandName,
    og:locale←active content locale, images from resolved metaImage) and
    `buildTwitterCard` (card = summary_large_image iff a meta image exists, else
    summary; title/desc mirror OG). Every field coerces empty/whitespace→undefined
    so Next omits unset keys. Dep-free (node --test).
  - **Wiring:** `generateMetadata` in `(site)/[[...slug]]/page.tsx` now reads
    `getSiteIdentity()` for brandName (off the hot path, like resolveSiteOrigin —
    generateMetadata is NOT the 429-sensitive render hot path) and returns
    `openGraph: buildOpenGraph(...)` + `twitter: buildTwitterCard(...)`. Replaced the
    old image-only `openGraph`. All inputs are stored page/site data → visitor-
    independent, edge-cache-safe per the (site)-isolation caveat.
  - No schema change, no new column, no next-intl/next-headers import.
  - NOTE: there is NO separate page `title` column — page titles live per-locale in
    `metaTitle`. So the OG title fallback the NEXT note mentioned collapses to
    metaTitle (already the `title` var); dropped the unused pageTitle field.
- **Verified:** `node --test social-cards.test.ts` 4/4; `npx tsc --noEmit` clean;
  full `npm test` 1739/1739 (was 1735; +4). Did NOT run opennext build (heavy gate)
  nor live-verify tags (HITL).
- **Files:** CMS/src/lib/render/social-cards.ts (+ .test.ts),
  CMS/src/app/(site)/[[...slug]]/page.tsx

## 2026-07-07 11:44 — IndexNow notify on noindex OFF→ON transition
- **Status:** DONE
- **What I did:** The one content-visibility change that never pinged IndexNow now does.
  When a page-meta PUT flips SEO `noindex` false→true, engines are told to recrawl so they
  see `robots:noindex` (previously they only dropped the URL on natural recrawl).
  - **Pure helper** `noindexTurnedOn(before, after)` in `lib/render/indexnow.ts`: true ONLY
    for `before===false && after===true`. `after` is the OPTIONAL validated body value —
    absent (preserve-when-absent contract) = no change = false. 6-case unit test.
  - **Wiring** in `api/pages/route.ts` persist(): BEFORE the write (id!==null) capture both
    the OLD noindex (`getPageById(id)`) and the page URLs (`collectPageUrls(id)`) — must grab
    URLs WHILE STILL INDEXABLE because collectPageUrls returns [] once noindexed (the same
    reason DELETE captures URLs pre-delete). After the write, if `noindexTurnedOn` →
    `notifyIndexNowUrls(preUrls)` (best-effort, ctx.waitUntil, never fails the save).
    notifyIndexNowForPage(id) still fires but is a no-op for the now-noindexed page.
  - Whole pre-read block is try/catch best-effort; a failed pre-read just skips the ping.
- **Verified:** `node --test indexnow.test.ts` 10/10; full `npm test` 1740/1740 (was 1739;
  +1); `npx tsc --noEmit` clean. Did NOT run opennext build (heavy gate; route already
  force-dynamic) nor live-submit (needs deployed origin+key — HITL).
- **Files:** CMS/src/lib/render/indexnow.ts (+ .test.ts), CMS/src/app/api/pages/route.ts

## 2026-07-07 11:51 — Auto BreadcrumbList JSON-LD (JSON-LD track)
- **Status:** DONE
- **What I did:** Emit a schema.org `BreadcrumbList` `<script type="application/ld+json">`
  for every published page at depth ≥ 1, built at plan time from the ancestor chain.
  - Pure builder `lib/render/breadcrumb.ts`: `ancestorChain(rows,id)` (root→leaf, cycle- &
    dangling-parent-safe → null on any gap), `buildBreadcrumbData(items)` → escaped inner
    JSON (or null for <2 items / any missing name|url — no lying trail), and
    `buildBreadcrumbJsonLd` (full `<script>` string for future HTML-emitting callers, e.g.
    the jsonld component kind). Escaping: JSON.stringify + `<`/`>`/`&` → `\uXXXX` so no
    `</script>` breakout.
  - Wiring in `render-page.tsx` `buildPlanFromPage`: reused the existing per-render page-rows
    read (added `metaTitle` to its select — no new query), built the chain, resolved each
    ancestor's per-locale meta title + its localized path via `pagePathsByLocale` (active
    locale), absolutized against `resolveSiteOrigin()` (root-relative fallback in local dev).
    Attached to `RenderPlan.jsonLd` (new optional field). Best-effort behind the same
    try-guarded block — any gap drops the whole trail (no partial breadcrumb).
  - `RenderedPage` renders each `plan.jsonLd` entry as an inert `<script type="application/
    ld+json">` (JSON-LD is data, not executed — a React inline script is correct here, unlike
    author client scripts). Payload is pre-escaped in the pure builder → dangerouslySetInnerHTML safe.
  - Visitor-independent: every input is stored page/site data (titles, slugs, origin), never
    the request → safe on the edge-cached (site) render path (see CAVEATS).
- **Verified:** `node --test breadcrumb.test.ts` 10/10 (order, depth-0 skip, cycle/dangling
  → null, escaping/`</script>` breakout, JSON round-trip, wrapper). Full `npm test` 1750/1750
  (was 1740; +10). `npx tsc --noEmit` clean, exit 0. No dev server running. Did NOT run the
  opennext deploy gate (heavy; pure additive Next render-path change, tsc covers type breakage)
  nor validate live rich-results (needs deployed origin — HITL).
- **Files:** CMS/src/lib/render/breadcrumb.ts (+ .test.ts), CMS/src/lib/render/render-page.tsx,
  CMS/src/lib/render/plan-types.ts

## 2026-07-07 11:59 — Search-engine verification tokens
- **Status:** DONE
- **What I did:** Per-Site Google/Bing/Yandex site-verification tokens, emitted as
  `<meta>` verification tags on every published page.
  - **Pure module** `lib/render/site-verification.ts` (dep-free, node-tested):
    `SiteVerification` ({google,bing,yandex}), `emptySiteVerification`,
    `normalizeSiteVerification` (per field: string-coerce, trim, STRIP anything
    outside `[A-Za-z0-9._-]`, clamp 200 — a pasted whole `<meta>` tag / injection
    attempt normalizes to just the token, so no meta-attr breakout), `isEmpty…`,
    `buildVerificationMeta` → Next's `Metadata.verification` shape (google→`google`,
    yandex→`yandex`, bing→`other["msvalidate.01"]` since Next has no first-class Bing
    field), undefined when nothing set so Next emits no verification meta.
  - **Store** `db/settings-store.ts` `getSiteVerification`/`setSiteVerification`
    (settings key `site_verification`; defensive read → empty on missing/garbage).
  - **Wiring:** `generateMetadata` in `(site)/[[...slug]]/page.tsx` reads
    `getSiteVerification()` (ONE extra D1 read, deliberately on the metadata path —
    NOT the 429-sensitive render hot path, same placement as the OG brandName read)
    and spreads `verification` into the returned Metadata. Visitor-independent
    (stored site data, no request) → edge-cache-safe per the (site)-isolation caveat.
  - **Admin:** REST `api/settings/verification` (force-dynamic; GET/PUT; requireAdmin;
    PUT writes through setSiteVerification which normalizes — no stable error codes,
    like the robots PUT). Editor `components/settings/verification-editor.tsx` (three
    text fields → one PUT → adopt server-normalized result). Page
    `(admin)/admin/settings/verification/page.tsx` (force-dynamic; explicit route beats
    catch-all; D1-unbound offline → empty). Nav link in the "Site" group after redirects.
  - **i18n** EN/FI/ET: `settingsNav.verification` + full `verification` namespace.
- **Verified:** `node --test site-verification.test.ts` 7/7; full `npm test` 1757/1757
  (was 1750; +7); `npx tsc --noEmit` exit 0; all 3 message JSONs parse. Did NOT run the
  opennext build gate (heavy; routes mirror proven force-dynamic patterns) nor live-verify
  a real token in Search Console (needs a deployed origin + a real Google/Bing account — HITL).
- **Files:** CMS/src/lib/render/site-verification.ts (+ .test.ts), CMS/src/db/settings-store.ts,
  CMS/src/app/(site)/[[...slug]]/page.tsx, CMS/src/app/api/settings/verification/route.ts,
  CMS/src/components/settings/verification-editor.tsx,
  CMS/src/app/(admin)/admin/settings/verification/page.tsx,
  CMS/src/components/settings/settings-nav.tsx, CMS/messages/{en,fi,et}.json

## 2026-07-07 12:13 — JSON-LD component kind — RENDER PATH tracer (JSON-LD track #1)
- **Status:** DONE
- **What I did:** A custom component can now be `kind:"jsonld"` — its artifact is a JSON
  template (schema.org object with `{{prop}}` slots) that renders as an
  `application/ld+json` script (funnelled onto `plan.jsonLd`), NOT visible HTML. Dynamic
  detail/collection pages get correct per-URL structured data via the same prop-binding
  machinery as HTML components. TRACER SCOPE = render path only (authoring/AI/canvas-chip
  are the next backlog tasks — deliberately deferred per NEXT).
  - **Schema:** `component.kind` TEXT NOT NULL DEFAULT 'html' + `draft_kind` TEXT (drizzle →
    migration 0031_clean_nightcrawler.sql → applied --local). NULL/'' = 'html' (legacy).
  - **Pure module** `lib/render/jsonld-component.ts` (dep-free, node-tested):
    `escapeJsonForScript` (the `<`/`>`/`&`→`\uXXXX` breakout-safe escaper — EXTRACTED from
    breadcrumb.ts, which now imports it → ONE escaper per the JSON-LD escaping caveat),
    `bindJsonLdSlots` (STRING-level `{{prop}}` substitution — NOT the tree walk: a string
    slot gets INNER JSON escaping so a `"` can't break the JSON literal; number/object slots
    splice their JSON form verbatim so `"r":{{rating}}` works; undeclared slots → "" via the
    propsSchema allowlist), `buildJsonLdComponent` (bind → JSON.parse validate → re-stringify
    → escape; null on blank template OR invalid-after-binding JSON → never ships broken data).
  - **Type:** `ComponentArtifact.kind?: "html"|"jsonld"` + `jsonTemplate?` (the raw JSON
    template — jsonld binding is string-level, so we DON'T parseHtml it into a tree).
  - **Render wiring:** `pickArtifactCols` threads kind/draftKind (draft prefers draftKind).
    Both component-map build loops in render-page.tsx (public + Develop preview) skip
    parseHtml for jsonld and carry the raw template; skip nested-tag enqueue (a jsonld
    template composes nothing). `planPage` (tree.ts): a jsonld block binds props (schema
    defaults merged under block props, locale objects resolved) → `buildJsonLdComponent` →
    pushes onto a new `jsonLd[]` returned in the plan; the block itself renders a HIDDEN
    placeholder (occupies its slot, zero visible text). render-page's auto-breadcrumb now
    APPENDS to `plan.jsonLd` (was overwrite) so component + breadcrumb JSON-LD coexist.
- **Verified:** `node --test jsonld-component.test.ts jsonld-plan.test.ts` (13 new) + breadcrumb
  (still green after the escaper extraction); full `npm test` 1770/1770 (was 1757; +13);
  `npx tsc --noEmit` exit 0; migration applied local. Did NOT run opennext build (heavy gate;
  pure additive render-path change, tsc covers types) nor live rich-results validation (needs
  a deployed site with a jsonld component authored — no authoring UI yet, so HITL-blocked until
  the AUTHORING task lands).
- **Files:** CMS/src/lib/render/jsonld-component.ts (+ .test.ts), CMS/src/lib/render/jsonld-plan.test.ts,
  CMS/src/lib/render/breadcrumb.ts, CMS/src/lib/render/plan-types.ts, CMS/src/lib/render/tree.ts,
  CMS/src/lib/render/render-page.tsx, CMS/src/db/schema.ts,
  CMS/migrations/0031_clean_nightcrawler.sql, CMS/migrations/meta/*

## 2026-07-07 12:20 — JSON-LD authoring WRITE PATH (validate/upsert/publish/discard/PUT)
- **Status:** DONE
- **What I did:** Made the component write path accept `kind:"jsonld"` (the render tracer read
  it but nothing wrote it). `ComponentArtifactInput` gained `kind?: "html"|"jsonld"` +
  `jsonTemplate?` (raw JSON-LD template). `validateComponentArtifact` branches: jsonld path
  (`validateJsonLdArtifact`) skips the HTML-tree render lint and instead probes the template —
  replaces every `{{slot}}` with `0` (legal JSON token in both quoted and unquoted positions),
  `JSON.parse`s the probe, requires a JSON OBJECT carrying `@context` + `@type`, self-correcting
  errors naming the exact miss + the quote-the-string-slots fix. jsonld blanks script/css, sets
  `tree = parseHtml("")` (EMPTY_TREE), stores the raw template in `jsonTemplate`. `upsertComponent`
  now writes the `html` column from `jsonTemplate` for jsonld (else `treeToHtml(tree)`), persists
  `kind` on create, and stages `draftKind` on update ONLY when kind changed (else null = no pending
  kind change; kind included in the no-op guard). `publishComponentDraft` copies `draft_kind→kind`
  (falls back to live kind when null); `discardComponentDraft` clears `draft_kind`. PUT
  `/api/components/<name>` forwards `kind` from the body (omit → keep stored kind). Tool schema
  `CREATE_COMPONENT_TOOL` gained a `kind` enum param so the AI can author jsonld. The AI dispatch
  (tool-dispatch.ts) needed NO change — it passes `valid.artifact` straight to `upsertComponent`,
  and the script/class lints run harmlessly over the empty tree.
- **Verified:** `npx tsc --noEmit` clean; `npm test` 1779/1779 (was 1770 + 9 new jsonld validation
  tests: template stored, script/css blanked, unquoted numeric/array slots pass, missing @context/
  @type/JSON/array/empty rejected, bad kind rejected). NOT verified live: no D1 write ran here
  (needs binding) and there's still no editor UI to author a jsonld component by hand — see NEXT.
- **Files:** CMS/src/lib/chat/component-tool.ts, CMS/src/lib/chat/component-tool.test.ts,
  CMS/src/db/component-store.ts, CMS/src/app/api/components/[name]/route.ts

## 2026-07-07 12:26 — JSON-LD READ path surfaces kind (Develop-editor prerequisite)
- **Status:** DONE
- **What I did:** The component READ path now carries `kind` so the (upcoming) Develop
  editor can tell a loaded component's kind. This is step 1 of the NEXT-note editor task —
  the render + write paths already handle kind; only the read/export path was blind to it.
  - `ComponentRow.kind?: string | null` (portable.ts) — documented UI-only, like `label`;
    `serializeComponent` deliberately does NOT put it in the portable bundle.
  - `getComponentByName` now selects `kind` + `draftKind` and returns the EFFECTIVE kind:
    live read → `r.kind`; draft read (`preferDraft && hasDraft`) → `r.draftKind ?? r.kind`
    (mirrors publishComponentDraft's `draftKind ?? kind` fallback — draft_kind is null when
    no pending kind change, so it correctly falls back to live).
  - GET `/api/components?name=` ships the kind out-of-band in an `X-Component-Kind` response
    header (default "html") — keeps the JSON body a clean portable bundle (kind excluded per
    the caveat) while giving the editor the kind. The `?draft=1` refetch gets the draft kind.
- **Verified:** 2 new pure tests (serializeComponent excludes kind for jsonld AND html —
  pins the bundle-exclusion invariant); `node --test portable.test.ts` 2/2; full `npm test`
  1781/1781 (was 1779; +2); `npx tsc --noEmit` exit 0. Did NOT run opennext build (heavy gate;
  additive read-path change, tsc covers types) nor live-fetch (needs D1 binding — HITL). The
  editor UI itself (kind toggle, JSON-template pane, save PUT) is still TODO — see NEXT.
- **Files:** CMS/src/lib/components/portable.ts (+ .test.ts new),
  CMS/src/db/component-store.ts, CMS/src/app/api/components/route.ts

## 2026-07-07 12:31 — JSON-LD × bindings (per-URL structured data) — verify + regress
- **Status:** DONE
- **What I did:** Verified (by reading the render host) that collection/data-source bindings AND
  `:param`/`?query` route refs already interpolate into a jsonld component with NO new seam:
  `hydrateBlockBindings` (render-page.tsx) is component-agnostic — it writes resolved values into
  `block.props` (via `hydrateProps` for bindings + `resolveRouteProps` for route refs) BEFORE
  planPage runs, and the jsonld branch in tree.ts reads that same hydrated `block.props` exactly
  like html components do. Added `CMS/src/lib/render/jsonld-bindings.test.ts` (4 tests) that drives
  the real hydrateProps→resolveRouteProps→planPage hand-off and asserts the emitted ld+json:
  collection-bound row lands in the payload; a `:slug` route-param resolves to the URL segment; a
  `</script>` breakout in a bound value is escaped through the full pipeline (still valid JSON);
  an unresolved binding falls back to the schema default (no lying/broken structured data).
- **Verified:** `node --test` on the new file (4/4); full `npm test` 1785/1785 (was 1781; +4);
  `npx tsc --noEmit` exit 0. Did NOT run opennext build (test-only change, no runtime code touched)
  nor live rich-results validation (needs an authored+published jsonld component + D1 — HITL).
- **Files:** CMS/src/lib/render/jsonld-bindings.test.ts (new)

## 2026-07-07 12:46 — JSON-LD Develop editor UI (authoring surface)
- **Status:** DONE
- **What I did:** Wired the operator-facing JSON-LD authoring surface into the component
  workbench — the LAST jsonld gap (render/write/read/bindings were all done). Changes:
  (1) Develop reads the loaded kind from the `X-Component-Kind` header on the `?draft=1` GET and
  stores it; (2) the raw JSON-LD TEMPLATE now rides out-of-band on GET as a base64 header
  `X-Component-Json-Template` (the portable bundle's `tree` is a parseHtml-mangled version of the
  template — useless to edit); (3) a HTML | JSON-LD kind toggle in the workbench (`switchKind`
  stages a draft kind change, persisted on next autosave/publish); (4) for jsonld the Code view
  shows ONE "JSON-LD template" editor (json language) editing `draft.html`, no script/css tabs;
  (5) the Preview shows the EMITTED structured data (pretty-printed via the SHARED `bindJsonLdSlots`
  + `declaredProps` — matches production `buildJsonLdComponent`) with a "Test in Google Rich
  Results" deep-link, and hides the viewport/device/send-to-AI/no-placeholder controls (no visual);
  (6) save PUT always sends the editor's authoritative `kind` (so html⇄jsonld switches persist);
  (7) `listComponents` now selects `kind` → the list badges jsonld components; (8) extracted the
  base64 UTF-8 header codec to a shared pure module `lib/components/base64-header.ts` (used by the
  route + the client) with a round-trip regression test.
- **Verified:** `npx tsc --noEmit` exit 0; `node --test` on base64-header (2/2), jsonld-component
  (13), all component/chat/render/jsonld pure suites (274/274). Did NOT run opennext build (heavy;
  isolated UI + one pure module, tsc+tests cover it) nor live Google Rich Results validation — that
  needs an authored+published jsonld component on a deployed Site with real D1 (HITL). No worker.ts
  / D1 schema change → no r-* release needed.
- **Files:** CMS/src/components/components/component-develop.tsx, CMS/src/app/api/components/route.ts,
  CMS/src/db/component-store.ts (jsonTemplate on getComponentByName row + kind in listComponents),
  CMS/src/lib/components/portable.ts (ComponentRow.jsonTemplate field),
  CMS/src/app/(admin)/admin/components/develop/page.tsx (kind in initialComponents),
  CMS/src/lib/components/base64-header.ts (new) + .test.ts (new), CMS/messages/{en,fi,et}.json (jsonld keys)

## 2026-07-07 13:01 — Designated branded 404 page (Page-level SEO controls)
- **Status:** DONE
- **What I did:** A site can now designate a PUBLISHED page as its branded 404. On a
  catch-all miss (after the redirect check) `notFound()` fires and `(site)/not-found.tsx`
  renders that page's real plan with HTTP 404 + robots noindex; falls back to a plain
  built-in 404 when unset/unpublished.
  - **Setting** `site_settings` key `not_found_page` (getNotFoundPageId/setNotFoundPageId,
    settings-store) — plain page-id string, "" = plain 404. No migration (reuses the
    existing settings table).
  - **Plan loader** `loadPlanById(pageId, activeLocale)` + `peelActiveLocale` in load-plan.ts;
    refactored the shared tail into `planForPage(pageRow, locale, routeContext)` (loadPlan +
    loadPlanById both call it). loadPlanById re-checks `publishStatus==="published"` so a
    deleted/unpublished target degrades to the plain 404.
  - **not-found.tsx** renders in the site DEFAULT content locale (Next gives not-found no
    params/pathname, and the (site) group reads no request/visitor data — cache-poison guard).
    Per-URL-locale 404 would need worker.ts to inject the path (release-gated) → filed as
    follow-up. A 404 is never edge-cached anyway (worker gate is GET-200-only —
    isEdgeCacheCandidate rejects status 404/308, already asserted in edge-cache.test.ts).
  - **Admin:** pure `lib/render/not-found-page.ts notFoundPageOptions` (published-only,
    label = default-locale metaTitle → any title → path; dep-free, node-tested). REST
    `api/settings/not-found-page` (force-dynamic, requireAdmin; GET → {pageId, options};
    PUT hard-rejects a non-published id with stable code `notPublished`, "" clears). Editor
    `not-found-page-editor.tsx` (select + save, fetches its own data). Page
    `(admin)/admin/settings/not-found-page/page.tsx` (explicit route beats catch-all). Nav
    link in "Site" group after verification. i18n EN/FI/ET (`notFoundPage` + `settingsNav.notFoundPage`).
- **Verified:** `npx tsc --noEmit` exit 0; new pure suite not-found-page.test.ts 4/4; full
  `npm test` 1794/1794 (was 1785; +4 new + counts). All 3 message JSONs parse. Did NOT run
  opennext build (heavy gate; routes mirror proven force-dynamic patterns) nor live-verify a
  real 404 (needs a deployed Site + published page designated — HITL). No worker.ts/D1 change
  → no r-* release needed.
- **Files:** CMS/src/db/settings-store.ts, CMS/src/lib/render/load-plan.ts,
  CMS/src/lib/render/not-found-page.ts (+ .test.ts), CMS/src/app/(site)/not-found.tsx,
  CMS/src/app/api/settings/not-found-page/route.ts,
  CMS/src/components/settings/not-found-page-editor.tsx,
  CMS/src/app/(admin)/admin/settings/not-found-page/page.tsx,
  CMS/src/components/settings/settings-nav.tsx, CMS/messages/{en,fi,et}.json

## 2026-07-07 12:52 — AI write-path IndexNow + edge-purge coherence
- **Status:** DONE
- **What I did:** The AI live-write tools now mirror the REST /api/pages post-write
  hooks — an AI `create_page` (update path) or `translate` of a PUBLISHED page now
  pings IndexNow and busts the edge cache (previously an AI publish never notified
  IndexNow and an AI edit of a cached published page left the edge stale until TTL).
  (1) `upsertPage` (page-store) + `applyTranslation` (translate-store) success shapes
  now return `pageId` (additive — no caller broke). (2) New pure module
  `lib/render/page-write-hooks.ts` `purgeTagsForPageWrite(action,pageId)`: CREATE→[]
  (nothing cached yet), UPDATE/translate→[pageCacheTag(id)]. (3) `handleCreatePage` +
  `handleTranslate` (tool-dispatch) call it then `purgeEdgeTags(...tags)` +
  `notifyIndexNowForPage(pageId)` — both helpers self-wrap ctx.waitUntil / swallow
  errors, so this is best-effort and never fails the tool result.
- **Verified:** `npx tsc --noEmit -p tsconfig.json` exit 0; `node --test` on the new
  page-write-hooks suite (3/3) + all render suites (280/280). No live IndexNow/purge
  test — those hit the CF/network boundary (HITL); the PURE purge decision is fenced.
  Did NOT run opennext build (isolated: two store return fields + one pure module +
  two handler edits, tsc+tests cover it). No worker.ts/D1 change → no r-* release.
- **Files:** CMS/src/db/page-store.ts, CMS/src/db/translate-store.ts,
  CMS/src/lib/render/page-write-hooks.ts (new) + .test.ts (new),
  CMS/src/lib/chat/tool-dispatch.ts

## 2026-07-07 13:06 — /llms.txt AI-crawler index
- **Status:** DONE
- **What I did:** Serve `/llms.txt` (llmstxt.org format) — brand identity header
  (`# brandName`, `> tagline`) + a `## Pages` list of every PUBLISHED page in the
  site DEFAULT content locale, each linking to that page's `.md` variant with the
  meta description as the note. Pure builder `lib/render/llms-txt.ts` (buildLlmsTxt,
  oneLine-collapses every value so a newline/tab can't break a link line; drops
  blank title/url entries) + unit test. Route `app/llms.txt/route.ts` (force-dynamic,
  no-store) reuses `publishedPagePaths` (added additive `id` to its return so per-page
  metaTitle/metaDescription lookup works — sitemap.ts ignores id), `createPathTranslator`
  + `pathForLocale` for the default-locale path, `resolveLocalized`+`parseJsonColumn`
  for per-locale title/desc. Origin unknown (local dev) → header-only body (mirrors
  sitemap.ts). ONE entry per page (default locale) — llms.txt is a curated index, not
  a full URL enumeration. `.md` links point at `<path>.md` (root `/` stays `/`) — the
  markdown-page-variants task (next) makes them resolve; until then they 404 (harmless,
  just an unbuilt link target).
- **Verified:** `tsc --noEmit` clean; new llms-txt.test.ts (5 cases) + sitemap-paths.test.ts
  + hreflang.test.ts all pass (28 assertions). Did NOT run opennext build (isolated: one
  new pure module + one route + one additive store-shape field; tsc+tests cover it). No
  worker.ts/D1 change → no r-* release. `/llms.txt` is dotted-root → already edge-cache
  excluded by the worker dot gate.
- **Files:** CMS/src/lib/render/llms-txt.ts (new) + .test.ts (new),
  CMS/src/app/llms.txt/route.ts (new), CMS/src/lib/render/sitemap-paths.ts (added id)

## 2026-07-07 13:35 — Image hygiene post-pass (Core Web Vitals — lazy/decoding/CLS)
- **Status:** DONE
- **What I did:** Pure `applyImageHygiene(plans)` in `lib/render/image-hygiene.ts` — a post-pass
  over the FINISHED ElementPlan, same seam as `localizePlanLinks` (wired into `tree.ts planPage`
  right after `blocks.map(planTopBlock)`, so it covers every `<img>` regardless of how it got there:
  component tree, block prop, binding hydration, List row stamp).
  - Walks in DOCUMENT ORDER; the FIRST `<img>` = LCP candidate → NOT lazy-loaded (lazy on the
    largest above-fold image hurts LCP). Every other `<img>` gets `loading="lazy"`+`decoding="async"`.
    The LCP image still gets `decoding="async"` (eager decode helps it). Author-set
    `loading`/`decoding` ALWAYS win — only ABSENT props are filled.
  - CLS: when author-set numeric `width`+`height` are BOTH known (number or numeric string), mirrors
    them into an inline `aspectRatio` style so the browser reserves the box before bytes arrive.
    NEVER invents dimensions (asset pixel sizes aren't stored yet — that's the filed follow-up), so
    an unsized image gets the lazy/decoding win only, no CLS guess. Won't clobber an existing
    aspect-ratio, merges into an existing style OBJECT, and LEAVES a rare string style alone
    (parse-html always emits style objects, but string-safe anyway). Returns the SAME array/nodes on
    image-free pages (cheap identity no-op).
  - `style` set as a React style OBJECT (`aspectRatio` camelCase) — correct for the createElement
    adapter (htmlPropsToReact passes style objects through verbatim).
- **Verified:** `node --test image-hygiene.test.ts` 10/10 (LCP skip, lazy on 2nd+, doc-order across
  nested trees, author-wins, aspect-ratio from number+string dims, no-CLS on missing/zero dim,
  don't-overwrite existing aspect-ratio, merge into style, non-img untouched/identity no-op). Full
  `npm test` 1831/1831; `npx tsc --noEmit` exit 0. Did NOT run opennext build (pure additive
  render-path post-pass, tsc+tests cover it) nor live-verify Lighthouse (needs a deployed Site —
  HITL). No worker.ts/D1 change → no r-* release.
- **Files:** CMS/src/lib/render/image-hygiene.ts (+ .test.ts), CMS/src/lib/render/tree.ts

## 2026-07-07 13:20 — Markdown page variants (.md AI-crawler surface) — closes the llms.txt loop
- **Status:** DONE
- **What I did:** Shipped the `<path>.md` markdown-variant surface the `/llms.txt` links point at.
  - **Pure serializer** `lib/render/element-to-markdown.ts`: `planToMarkdown(root, {title,description})`
    walks a built `RenderPlan.root` (ElementPlan[]) → Markdown — headings, paragraphs, links
    (`[text](href)`), images (`![alt](src)`), ordered/nested/unordered lists, blockquote, hr, `<pre>`
    fences, GFM tables, emphasis (strong/em/del/code). Chrome dropped (script/style/nav/svg/form
    controls/iframe). Transparent wrappers (div/section/span) flow children through. Text escaped for
    Markdown-special chars. Also exports `peelMarkdownSuffix(segments)`. PURE / dep-free / 16 unit tests.
  - **Internal route** `app/api/md/[...slug]/route.ts`: resolves the SAME `loadPlan` slug/publish/locale
    walk the HTML route uses, then serializes → `text/markdown`. 404 for unpublished / route-miss /
    **noindex** (same crawler-hide gate as sitemap/IndexNow). Under `/api` on purpose (see caveat).
  - **Worker rewrite** (release-gated, r-*) `worker.ts` + pure `markdownVariantRewrite` in edge-cache.ts:
    a public GET `/<path>.md` is rewritten to `/api/md/<path>.md` BEFORE OpenNext (cheap string gate, no
    D1). System prefixes / dotted-root / bare `.md` never rewrite. 6 unit tests.
- **Verified:** 311 render unit tests pass (16 new mdserializer + 6 new rewrite). `tsc --noEmit` clean.
  LIVE in `next dev`: `/api/md/contact` and `/api/md/for-restaurants.md` return correct Markdown off
  the real seeded D1 (title/desc head, headings, links, images, lists all right); `/api/md/nope` → 404.
  COULD NOT verify the public `/<path>.md` URL end-to-end — the worker rewrite ships ONLY via a release
  (r-*); the internal route is what dev exercises.
- **Files:** CMS/src/lib/render/element-to-markdown.ts (+.test.ts),
  CMS/src/app/api/md/[...slug]/route.ts, CMS/src/lib/render/edge-cache.ts (+.test.ts append),
  CMS/worker.ts.

## 2026-07-07 13:31 — Capture asset pixel dimensions at upload (image-hygiene follow-up)
- **Status:** DONE
- **What I did:** Assets now store their intrinsic pixel dims so a later run can give
  applyImageHygiene an aspect-ratio (CLS) hint on gallery images the author never sized.
  - **Schema:** nullable `asset.width`/`asset.height` INTEGER (Drizzle → migration
    `0032_last_baron_zemo.sql` → applied --local). NULL for non-images / undecodable /
    older uploads — fully backward-compatible; the other putAsset callers (theme fonts,
    site-import, AI generate, component asset upload) omit dims and store null.
  - **Client capture:** new pure-ish `readImageDimensions(file)` in `lib/chat/image-thumb.ts`
    (reuses `createImageBitmap`, closes the bitmap, null on non-image/undecodable). The media
    uploader (`media-library.tsx onUpload`) reads dims alongside the existing describe-thumb and
    appends `width`/`height` form fields.
  - **Trust boundary:** pure `parseAssetDimension(value)` in `lib/render/asset.ts` — client dims
    are UNTRUSTED, so it coerces number|string, floors, rejects non-finite/non-positive and clamps
    to `1..MAX_ASSET_DIMENSION` (100k), null otherwise. The POST route parses `width`/`height`
    through it and passes to `putAsset`; a forged huge/garbage value simply stores null.
  - **Store:** `putAsset` gained optional `width?`/`height?` (default null) written into the row.
    GET list + POST response already spread the row → dims surface to clients with no extra work.
  - Did NOT thread dims into the render `<img>` props yet — that touches the 429-sensitive,
    edge-cached RENDER hot path (caveats forbid a new per-request D1 read there). Filed as its own
    BACKLOG TODO with the recommended approach (bake dims onto the block prop at picker-insert time,
    NOT a render-time lookup).
- **Verified:** `node --test scripts/asset.test.mjs` 19/19 (+3 new parseAssetDimension cases);
  full `npm test` 1834/1834 (was 1831; +3); `npx tsc --noEmit` exit 0; migration applied local.
  Did NOT run opennext build (heavy gate; additive column + pure helper + one form field, tsc+tests
  cover it) nor live-upload verify (needs live R2/D1 binding — HITL). No worker.ts change → no r-* release.
- **Files:** CMS/src/db/schema.ts, CMS/migrations/0032_last_baron_zemo.sql, CMS/migrations/meta/*,
  CMS/src/lib/render/asset.ts, CMS/scripts/asset.test.mjs, CMS/src/db/asset-store.ts,
  CMS/src/lib/chat/image-thumb.ts, CMS/src/components/media/media-library.tsx,
  CMS/src/app/api/assets/route.ts

## 2026-07-07 13:37 — Thread asset dims into render <img> for CLS (authoring-time, zero render D1)
- **Status:** DONE
- **What I did:** Closed the CLS gap for gallery images by carrying intrinsic pixel dims on the
  image URL as `?w=&h=` query params, baked in at PICK time — so `applyImageHygiene` sets an
  aspect-ratio for gallery images that carry no author width/height, with ZERO per-request D1 read
  on the edge-cached / 429-sensitive render hot path (the caveats' hard constraint).
  - **Encode (authoring):** `withAssetDims(url,w,h)` (pure, `lib/render/asset.ts`) appends `?w=&h=`
    only when BOTH dims pass `parseAssetDimension` (clamp/reject) and the URL has no query yet
    (never double-stamps over the media route's `?fmt=` variant param). `ImagePicker.onConfirm`
    now calls it — the Block-tab image props + SEO OG-image field pick a dims-stamped URL. Assets
    uploaded before migration 0032 (no dims) → plain URL, graceful.
  - **Decode (render):** `readAssetDims(src)` (pure) parses `?w=&h=` back via URLSearchParams;
    `applyImageHygiene.hygieneProps` falls back to it ONLY when author width/height props are
    absent (author props always win). The `/media/[...key]` serve route keys off the PATH and
    ignores the query, so the params are inert for serving.
  - `GalleryAsset` gained `width?`/`height?` (the list/POST JSON already spreads the row → dims
    already flow to the client; just needed the type).
- **Verified:** `npm test` 1841/1841 (was 1838; +3 image-hygiene URL-dims cases + a new
  `asset-dims.test.ts` with 4 round-trip/reject cases = 7 new asserts across 2 files);
  `npx tsc --noEmit` exit 0. asset.ts stays import-free → image-hygiene's new import is dep-free
  under `node --test`. Did NOT run opennext build (pure helpers + one client-picker line + a type
  field; tsc+tests cover it) nor live Lighthouse/CWV (HITL — needs a deployed Site). No worker.ts
  change → no r-* release needed; this ships on the next normal CMS build.
- **Files:** CMS/src/lib/render/asset.ts, CMS/src/lib/render/asset-dims.test.ts,
  CMS/src/lib/render/image-hygiene.ts, CMS/src/lib/render/image-hygiene.test.ts,
  CMS/src/components/page-builder/image-picker.tsx, CMS/src/components/media/media-library.tsx

## 2026-07-07 13:49 — SEO audit admin report (orphans / broken links / missing meta / missing alt)
- **Status:** DONE
- **What I did:** New read-only admin SEO health report at `/admin/settings/seo-audit`, driven by a
  pure analyzer over the published-page rows. Four findings:
  - **orphans** — published, non-home, non-wildcard pages nothing links to (unreachable except via
    nav/sitemap);
  - **brokenLinks** — internal `/path` link props (Hero CTAs etc.) pointing at a path no published
    page serves; accepts default + every locale-prefixed form, and skips links under a wildcard
    `:param` subtree (dynamic detail URLs we can't enumerate) so they're never false-flagged;
  - **missingMeta** — published (non-noindex, non-wildcard) page × content-locale missing meta
    title or description;
  - **missingAlt** — image-ish block props (`src`/`image`/`imageUrl`/`imageSrc`/`backgroundImage`,
    or an `alt`-bearing block) with blank alt.
  - Pure `lib/render/seo-audit.ts auditSeo(pages, contentLocales)` — no React/D1 imports, reuses
    `publishedPagePaths` (canonical targets) + `SKIP_SEGMENTS` (system-path skip). Store read
    `listPagesForAudit()` (one query, blocks parsed + meta maps). Server page computes + renders
    (localized EN/FI/ET, settings-nav item under "Site"). Read-only — no auto-fix, no API route.
  - **SCOPE (deliberate):** links + images are collected from RAW `page.blocks` prop trees, NOT from
    resolved *component* trees (that needs the D1 component resolver + next-intl — not a pure input).
    Catches the common author mistakes (CTA at a renamed slug, image block with no alt). Deep
    component-tree scan is filed as a follow-up TODO.
- **Verified:** `node --test seo-audit.test.ts` 12/12 (orphans/broken/meta/alt + wildcard-skip +
  locale-form accept + nested-children walk + draft/noindex skips); full `npm test` 1853/1853 (was
  1841; +12); `npx tsc --noEmit` exit 0; all 3 message JSONs parse. Did NOT run opennext build (pure
  helper + one store read + a server page + i18n; tsc+tests cover it) nor live-render the admin page
  (needs live D1 + admin session — HITL). No worker.ts change → ships on next normal CMS build.
- **Files:** CMS/src/lib/render/seo-audit.ts (+.test.ts), CMS/src/db/page-store.ts (listPagesForAudit),
  CMS/src/app/(admin)/admin/settings/seo-audit/page.tsx, CMS/src/components/settings/settings-nav.tsx,
  CMS/messages/{en,fi,et}.json

## 2026-07-07 13:56 — AI bulk-meta assistant tools (audit_meta + set_page_meta)
- **Status:** DONE
- **What I did:** Added the chat-side pair for the SEO-audit report — two AI tools so the assistant
  can FIND and FILL missing per-locale SEO meta:
  - `audit_meta` (read, no args) → runs `listPagesForAudit()` + `auditSeo`, returns ONLY the
    `missingMeta` findings (`{slug, locale, missing:["title"|"description"]}`) + a `total`; empty
    → a `note`. Reuses the exact analyzer the admin report uses — no new data path.
  - `set_page_meta` (write) → addresses a page by `slug` (+ optional `parentSlug`), writes a
    per-locale `metaTitle`/`metaDescription` MERGE through the SAME `upsertPageMeta` store path the
    REST SEO tab uses, then runs the LIGHT AI hook (purge `pageCacheTag` + `notifyIndexNowForPage`,
    exactly like `handleCreatePage`). Self-correcting errors name the exact bad slug/locale.
  - Pure module `lib/chat/meta-tools.ts` (tool schemas + `validateSetPageMeta` + `mergePageMeta`) —
    node-testable, no React/D1/CF imports. `mergePageMeta` is the crux: it carries the page's
    existing slug/parent/publishStatus/**metaImage** through UNCHANGED and OMITS
    noindex/localizedSlugs/cacheMaxAge (preserve-when-absent) — so a meta write can NEVER move a
    URL, flip noindex, or blank the OG image. That's why no rename-301 / noindex pre-capture is
    needed (per the AI write-path IndexNow caveat) — the light hook is correct.
  - Wired both into tool-dispatch (`TOOL_BY_NAME` + `HANDLERS`), tool-scopes (`KNOWN_TOOL_NAMES` +
    the `pages` and `page-builder` contexts) and added an SEO-housekeeping sentence to the `pages`
    context prompt (title ~50-60 / desc ~140-160 chars).
- **Verified:** `node --test meta-tools.test.ts` 8/8 (slug/no-op/non-string reject + merge preserves
  metaImage & omits noindex + empty-string clears); full `npm test` 1861/1861 (was 1853; +8);
  `npx tsc --noEmit` exit 0. Did NOT run opennext build (pure logic + wiring; tsc+tests cover it) nor
  live-exercise the tool (needs live D1 + a chat session — HITL). MCP surface picks the tools up
  automatically via `allToolSchemas()`. No worker.ts change → ships on next normal CMS build.
- **Files:** CMS/src/lib/chat/meta-tools.ts (+.test.ts), CMS/src/lib/chat/tool-dispatch.ts,
  CMS/src/lib/chat/tool-scopes.ts

## 2026-07-07 14:03 — Editable llms.txt template (USER-QUEUED task 1/4)
- **Status:** DONE
- **What I did:** New pure `lib/render/llms-template.ts` — `LLMS_TEMPLATE_VARS` (the slot allowlist
  AND the settings-UI side-panel docs, one source of truth), `renderLlmsTemplate` (substitutes
  `{{slot}}` via the SHARED `SLOT_RE` imported from plan-tree.ts — same convention components use,
  per the USER REQUIREMENT; unknown slots → "", one trailing newline), `templateSlots` +
  `unknownSlots` (self-correcting validation: names the bad tokens, sorted/distinct; blank template
  is valid). Slots surveyed & documented: brandName, tagline, origin, defaultLocale, locales,
  pageTree. Extracted `buildLlmsPageList` from `buildLlmsTxt` (llms-txt.ts) so `{{pageTree}}` = the
  EXACT auto "## Pages" list. Store getter/setter `getLlmsTemplate`/`setLlmsTemplate` (settings key
  `llms_template`, stored VERBATIM — it's free text, not JSON). Wired the `/llms.txt` route: a
  non-blank stored template renders with the vars bag, else today's auto output.
- **Verified:** `node --test` 12/12 (7 new template tests + 5 existing llms-txt, incl. the new
  buildLlmsPageList path). `npx tsc --noEmit` clean. Did NOT run opennext build (pure logic + light
  route wiring; tsc+tests cover it). Did NOT live-fetch /llms.txt (needs live D1 + a stored
  template — HITL). No worker.ts change → ships on next normal CMS build.
- **Files:** CMS/src/lib/render/llms-template.ts (+.test.ts), CMS/src/lib/render/llms-txt.ts,
  CMS/src/db/settings-store.ts, CMS/src/app/llms.txt/route.ts

## 2026-07-07 11:09 — llms.txt settings editor UI (USER-QUEUED task 2/4)
- **Status:** DONE
- **What I did:** The admin editor for the editable-llms.txt template (task 1/4's pure engine).
  - **REST route** `app/api/settings/llms/route.ts` — GET `{ template }` (""=auto fallback), PUT
    saves after a HARD reject of unknown `{{slot}}` tokens via `unknownSlots` (stable
    `code:"unknownSlots"` + `slots:[...]` names the offenders — like the redirect admin, NOT robots'
    silent-normalize; a typo'd slot would otherwise vanish to "" in the served file). Writes via
    `setLlmsTemplate` (stores verbatim). requireAdmin-guarded, force-dynamic, REST-only.
  - **Editor** `components/settings/llms-editor.tsx` — template textarea on the LEFT, a VARIABLES
    reference panel on the RIGHT (per the user requirement) rendering every `LLMS_TEMPLATE_VARS`
    entry (name + one-line description from i18n + example). Each var is a click-to-insert button
    that splices `{{slot}}` at the caret (uncontrolled selectionStart/End + requestAnimationFrame
    to restore focus/caret). unknownSlots 400 shown inline naming the bad token(s).
  - **Page** `(admin)/admin/settings/llms/page.tsx` — explicit route (beats the `[[...slug]]`
    catch-all), reads the stored template, degrades to "" when D1 unbound.
  - **Nav + i18n** — `settings-nav.tsx` gets an `llms` item under Site (after Redirects); full
    `llms` message block + `settingsNav.llms` added to EN/FI/ET.
- **Verified (live, dev server on :3602):** GET→200 `{"template":""}`; PUT bad slot→400
  `{"code":"unknownSlots","slots":["pgTree"]}`; PUT valid→200; GET roundtrips; **`/llms.txt` renders
  the stored template** (real brand/tagline/pageTree substitution) then falls back to auto after I
  reset the stored template to "". Admin page→200 (title/editor/Variables panel present).
  `npx tsc --noEmit` clean; `node --test llms-template.test.ts` 7/7; route reject logic re-checked via
  an inline assert (existing unknownSlots tests already fence it — no new test file, pure fn unchanged).
- **NOT done / caveat:** the full `opennextjs-cloudflare build` deploy-gate could NOT complete in this
  local env — `.env.local` sets `CMS_DEV_SUPERADMIN=1` and the prod-build guard FATALs on it (a
  pre-existing local-env condition, unrelated to this change). The Next `next build` COMPILE + the
  TypeScript pass both succeeded before that guard fired; combined with clean `tsc --noEmit` + live
  dev verification, the change is sound. No worker.ts change → ships on next normal CMS build.
- **Files:** CMS/src/app/api/settings/llms/route.ts, CMS/src/components/settings/llms-editor.tsx,
  CMS/src/app/(admin)/admin/settings/llms/page.tsx, CMS/src/components/settings/settings-nav.tsx,
  CMS/messages/{en,fi,et}.json

## 2026-07-07 14:19 — Cache /llms.txt (USER-QUEUED task 3/4)
- **Status:** DONE
- **What I did:** Gave `/llms.txt` its own edge-cache tag `LLMS_CACHE_TAG = "llms"`
  (edge-cache.ts) + a pure `llmsTxtCacheHeaders(pathname)` that opts EXACTLY `/llms.txt`
  back in (public, max-age=LLMS_MAX_AGE=3600, SWR). worker.ts: explicit carve-out BEFORE
  the general edge-cache gate — GET 200 + `llmsTxtCacheHeaders` match → stamp Cache-Control +
  `Cache-Tag: llms`. This is a FIXED single-path match, NOT a dot-gate loosening, so a
  top-level wildcard page can never get the llms tag stamped (the sitemap-staleness precedent).
  Purge coverage for `LLMS_CACHE_TAG` added to every site that changes the file: page publish
  (publish route), page create/update/unpublish/rename + delete (api/pages route), brand save
  (settings/brand), llms-template save (settings/llms PUT — new purge), and the AI write path
  (page-write-hooks: CREATE now returns [LLMS_CACHE_TAG] not []; update/translate append it).
- **Verified:** `node --test edge-cache.test.ts + page-write-hooks.test.ts` = 27/27 (2 new
  carve-out tests: exact-match + rejects-everything-else incl. /fi/llms.txt, /robots.txt, a page
  path; 3 page-write-hooks tests updated for the always-purge-llms rule). `npx tsc --noEmit` clean.
  worker.ts carve-out is RELEASE-GATED (r-*) → unverifiable locally (dev :3602 not running; same
  bar as every worker.ts change). Route still emits no-store as the pre-release fallback; the
  worker overwrites it.
- **Files:** CMS/src/lib/render/edge-cache.ts (+ .test.ts), CMS/worker.ts,
  CMS/src/lib/render/page-write-hooks.ts (+ .test.ts), CMS/src/app/api/settings/llms/route.ts,
  CMS/src/app/api/settings/brand/route.ts, CMS/src/app/api/pages/route.ts,
  CMS/src/app/api/pages/[id]/publish/route.ts

## 2026-07-07 14:23 — Cache .md page variants (USER-QUEUED task 4/4)
- **Status:** DONE
- **What I did:** Edge-cache the `/api/md/[...slug]` markdown page variants. Added pure
  `mdVariantCacheHeaders(pageId)` + `MD_MAX_AGE=3600` to edge-cache.ts (public, max-age, SWR;
  Cache-Tag = the page's OWN `pageCacheTag(id)`). The /api/md route now stamps `Cache-Control` +
  `Cache-Tag` on its 200 body using `loaded.page.id`. NO worker.ts change / NO release gate: the
  worker rewrites `/<path>.md`→/api/md and returns that response untouched, so stamping in the
  route is what opts it into Workers Cache. Tagged `page:<id>` (not `pages`) so the EXISTING
  publish/unpublish/rename/delete/noindex purges — all of which already purge `pageCacheTag(id)` —
  cover the cached `.md` with zero new purge sites. Route is under /api (SKIP_SEGMENTS), so no
  wildcard page tag can ever be stamped there (sitemap-staleness precedent sidestepped
  structurally). 404 responses (unpublished/miss/noindex) stay uncached (no Cache-Control).
- **Verified:** `node --test edge-cache.test.ts` 26/26 (2 new regression tests: own-tag +
  tag-matches-purge). `npx tsc --noEmit` clean. Live edge behavior (cf-cache-status on a real
  `.md` URL) is DEPLOY-ONLY + the public `/<path>.md` rewrite is release-gated (r-*) — unverifiable
  locally; the internal /api/md route is dev-verifiable.
- **Files:** CMS/src/lib/render/edge-cache.ts (+ .test.ts),
  CMS/src/app/api/md/[...slug]/route.ts

## 2026-07-07 14:27 — Stamp ?w=&h= dims on AI-inserted asset URLs (list_assets)
- **Status:** DONE
- **What I did:** `formatAssetList` (list-assets-tool.ts) now URL-stamps intrinsic pixel
  dims via `withAssetDims(assetUrl(key), width, height)` — so an image the AI drops into a
  page from `list_assets` carries the `?w=&h=` CLS carrier the render path (`applyImageHygiene`)
  reads for the aspect-ratio box, ZERO per-request D1 read (authoring-time only). Added
  optional `width?/height?` to `AssetRowLike`; the dispatch handler already hands full `Asset[]`
  rows (listAssets returns them), so no route wiring change. `generate_image` was checked and
  left ALONE: its `putAsset` omits dims (per the asset-dims caveat — AI generate stores NULL
  dims), so there's nothing to stamp there; `withAssetDims` never invents dims → plain URL.
- **Verified:** `node --test scripts/list-assets-tool.test.mjs` 4/4 (2 new regression tests:
  dims-stamped when both present; plain URL when a dim is null/absent). `npx tsc --noEmit` clean.
- **Files:** CMS/src/lib/chat/list-assets-tool.ts, CMS/scripts/list-assets-tool.test.mjs

## 2026-07-07 14:31 — INVESTIGATION: responsive image variants (design note, unblocks BLOCKED srcset task)
- **Status:** DONE
- **What I did:** Design/decision only, no code. Evaluated the four candidate paths for responsive
  image variants of `/media/[...key]` R2 assets on per-site Workers (incl. workers.dev). KEY FINDING
  that reframes the whole task: the `IMAGES` binding is ALREADY wired and used
  (`CMS/src/lib/ports/images.ts` → `env.IMAGES`, `wrangler.jsonc` `"images": {"binding":"IMAGES"}`),
  and the media route already does transform-on-delivery PNG/JPEG→WebP via
  `images.input(body).output({format,quality})`. That SAME binding also RESIZES via
  `.transform({ width, height, fit })` — and it's the **Workers Images binding, which runs on ANY
  Worker including workers.dev** (it is NOT zone-scoped Image Resizing). So the original backlog
  premise ("workers.dev can't resize") is STALE — it predates this binding landing.
  **CHOSEN PATH: extend the existing on-delivery transform with a width param.** Add a `?w=<n>`
  query to `/media/[...key]`, clamp to a FIXED width ALLOWLIST (e.g. 320/640/960/1280/1920) via a new
  PURE `deliveryWidth()` helper, and call `.transform({ width })` before `.output(...)`. The route's
  cache key is already `request.url` (via `cacheKeyFor`) so folding `w` in gives each (key,fmt,width)
  its own edge-cache entry — transform runs once per PoP per variant, not per request. R2 master is
  never touched (export/import still ships masters); any transform failure falls back to the original
  bytes (same graceful-degrade as the WebP path — unbound IMAGES = serve original, never 5xx).
  Then `<img>` gets `srcset` = allowlist widths pointing at `/media/<key>?w=<n>` from a pure render
  pass (sibling to `applyImageHygiene`), gated to widths ≤ the intrinsic width already carried in the
  `?w=&h=` dims query. Filed two impl tasks (media `?w=` variants; render srcset/sizes).
  **REJECTED alternatives:** (1) Cloudflare **Images** product upload-time named variants — a second
  product with per-image storage+transform billing, and it duplicates masters (breaks the
  R2-master/export story); the binding-transform path reuses the R2 master and only bills the
  Images transform op we already pay for WebP. (2) Zone **Image Resizing** (`/cdn-cgi/image/...`) —
  requires a zone / custom domain; workers.dev sites can't use it (the original blocker, still true
  for THAT approach — but moot now). (3) In-Worker JS resize — no native image codecs on Workers
  (same reason we can't decode dims server-side); dead end.
  **Constraints noted:** the delivery-width `?w=` param COLLIDES in spelling with the intrinsic-dims
  `?w=&h=` carrier (`withAssetDims`/`readAssetDims`) — the srcset URLs must carry the DELIVERY width,
  and the two uses must be reconciled in one `mediaVariantUrl(key,width)` helper so a variant URL
  isn't mistaken for a dims-carrier by `readAssetDims`. Images-binding transform cost = one Images
  operation per uncached variant per PoP (same billing class as the WebP transcode already shipping).
- **Verified:** Confirmed the `IMAGES` binding exists in `wrangler.jsonc` and is consumed via
  `getImages()`; confirmed the route already does `.output({format,quality})` and edge-caches per
  synthetic `fmt` key (so adding `w` to the key is a one-line extension). No code changed → no
  build/test run needed. Live transform of a width variant is DEPLOY-ONLY (needs a real IMAGES
  binding + R2) — unverifiable locally.
- **Files:** (design note only) .orchestrator/meeseeks/goals/seo-robots/{JOURNAL,CAVEATS,BACKLOG,NEXT}.md

## 2026-07-07 14:42 — Responsive images IMPL 1/2: /media?w= width variants
- **Status:** DONE
- **What I did:** Delivered the `/media/[...key]?w=<n>` delivery-width variant path per the
  investigation design. Added two PURE helpers to `lib/render/asset.ts`: `deliveryWidth(value)` clamps
  a requested width to a CLOSED allowlist `DELIVERY_WIDTHS=[320,640,960,1280,1920]` (rounds UP to the
  smallest ≥ request, caps at 1920, null for absent/garbage — bounded variants so a scraper can't mint
  unbounded cache entries/Images ops), and `mediaVariantUrl(key,width)` — the ONE place srcset builders
  (impl 2/2) mint variant URLs, so the delivery `?w=` never collides with the intrinsic-dims `?w=&h=`
  carrier (variant URL has NO `h`, so `readAssetDims` returns null for it — intentional). Route
  (`media/[...key]/route.ts`): negotiates `width` from `?w=` (pure, no R2 read), folds the CLAMPED width
  into `cacheKeyFor(url,fmt,width)` so each (key,fmt,width) edge-caches distinctly, and runs
  `.transform({width, fit:"scale-down"})` before `.output` on the same Images binding — one pipeline
  (resize then encode). fit:scale-down never upscales past the master. Resize-only (no WebP transcode)
  preserves the master format via `resizeOutputFormat(key)` (ImageOutputOptions.format is a closed
  literal union, so mapped from the key ext; jpeg default). Transform failure falls back to the original
  bytes (same as the WebP path). R2 master untouched.
- **Verified:** `node --test scripts/asset.test.mjs` → 25/25 pass (added 5 tests: deliveryWidth
  round-up/cap/reject, mediaVariantUrl clamp/null/no-h). `npx tsc --noEmit` clean (confirmed the
  Images `.transform`/`.output` calls typecheck against the generated `ImageTransform`/
  `ImageOutputOptions` in cloudflare-env.d.ts). LIVE width-transform on a real IMAGES binding + R2 is
  DEPLOY-ONLY — unverifiable locally (getImages() returns null in dev → serves original).
- **Files:** CMS/src/lib/render/asset.ts, CMS/src/app/media/[...key]/route.ts, CMS/scripts/asset.test.mjs

## 2026-07-07 14:57 — Responsive images impl 2/2: render srcset/sizes
- **Status:** DONE
- **What I did:** Pure `srcsetFor(src, intrinsicWidth)` in image-hygiene.ts emits one
  `mediaVariantUrl(key, w) <n>w` candidate per DELIVERY_WIDTHS entry ≤ the intrinsic width (skips
  upscales), null for non-/media/ srcs or images below the smallest allowlist width. Wired into
  `hygieneProps`: when the intrinsic width is known (author width or `?w=&h=` dims via readAssetDims)
  and author `srcset`/`sizes` are absent, sets `srcset` + default `sizes:"100vw"`. Added
  `mediaKeyFromSrc` (asset.ts) — the ONE place to strip `/media/` + query and validate the key
  (isValidAssetKey), so variant URLs are minted from the canonical key. Fixed React casing:
  `srcset`→`srcSet` in react-props.ts attrToReactName (lowercase `srcset` warns + is dropped by React;
  also benefits authored HTML). Pure/edge-cache-safe — reads only the built plan, no D1/getImages.
- **Verified:** node --test image-hygiene (+6), react-props (+1), asset (+2) all green (asset 27/27);
  `npx tsc --noEmit` clean. Could NOT verify live resized bytes/srcset selection in a browser — the
  IMAGES binding transform is deploy-only (getImages returns null in dev → original served); HITL.
- **Files:** CMS/src/lib/render/image-hygiene.ts, asset.ts, react-props.ts + their 3 test files.

## 2026-07-07 15:02 — dims for generate_image assets (CLS box + srcset for AI images)
- **Status:** DONE
- **What I did:** AI-generated images (`generate_image` tool) stored NULL width/height because the
  handler runs SERVER-SIDE on the Worker — no browser to run the client-side `readImageDimensions`
  (image-thumb.ts). New pure `imageDimensionsFromBytes` (CMS/src/lib/media/image-dimensions.ts) reads
  intrinsic dims straight from the FILE HEADER (no decode/canvas — Workers-safe): PNG IHDR, GIF LSD,
  JPEG SOFn scan, WebP VP8/VP8L/VP8X. Wired into `handleGenerateImage` (tool-dispatch.ts): stamp
  `width`/`height` into the existing `putAsset` call (which already accepted them); null → stored null
  exactly as before, so it can only ADD dims. Closes the last CWV image gap — AI images now get the
  anti-CLS box AND the srcset from impl 2/2.
- **Verified:** new node --test image-dimensions.test.ts 7/7 (real byte fixtures per format incl. the
  1x1 PNG, truncated→null, zero-dim→null); full suite 1895/1895; `npx tsc --noEmit` clean. Could NOT
  verify a live AI generation round-trip (needs an OpenRouter key + deployed origin) — HITL.
- **Files:** CMS/src/lib/media/image-dimensions.ts (+ .test.ts), CMS/src/lib/chat/tool-dispatch.ts

## 2026-07-07 15:07 — Builder canvas chip for invisible (jsonld) blocks
- **Status:** DONE
- **What I did:** A jsonld-kind component block renders only a `display:none` placeholder (its ld+json
  is funnelled onto `RenderPlan.jsonLd`, not into the DOM), so its `data-block-wrap` div collapses to
  ZERO height — nothing to hover/click/select on the Preview canvas, so operators couldn't manage the
  block. Fixed in the PREVIEW-ONLY overlay (`preview-overlay.ts`), never the render plan (public =
  preview must stay byte-identical): at wire time `injectInvisibleChips()` scans every
  `data-block-wrap`, and for any whose `getBoundingClientRect()` has no area, injects a visible dashed
  `◇ <component-name>` chip (`data-bb-invisible-chip`) as an appended child. The chip gives the wrap a
  real box, so the EXISTING hover-label / click-select / markSelected machinery works unchanged. Chip
  label comes from the same `labelFor` (previewLabels already maps a jsonld leaf id→component name).
  New pure `isVisuallyEmptyRect({width,height})` (exported, unit-tested) is the inject decision. Chips
  are removed on overlay cleanup and re-injected on each iframe reload; injection is idempotent per wrap.
- **Verified:** new preview-overlay.test.ts 3/3 (zero-area→chip, real box→skip, NaN/negative→empty so
  we never inject on bad rects); full suite 1898/1898; `npx tsc --noEmit` clean. Could NOT verify the
  visual chip live in a browser (needs a jsonld component on a page + the running builder) — HITL.
- **Files:** CMS/src/lib/page-builder/preview-overlay.ts (+ new preview-overlay.test.ts)

## 2026-07-07 15:19 — List → schema.org ItemList JSON-LD (user-queued backlog task 1)
- **Status:** DONE
- **What I did:** The one binding case a SINGLE jsonld component instance couldn't ride —
  aggregating a List's rows into ONE schema.org `ItemList` (rich-result carousels / category
  pages). DISCOVERY first: per-row Product/Article JSON-LD ALREADY works today via composition
  (a jsonld component as a List template child → planList's `planBlock(stampRow(...))` fires the
  jsonld branch per row → N separate scripts; proved with a throwaway test, 2 rows → 2 scripts).
  So the CAVEATS "planList needs new work" note was over-pessimistic for the per-row case; the
  genuine gap was the AGGREGATE ItemList document. Implemented:
  - `jsonld-component.ts`: split `bindJsonLdComponent` into a reusable `bindJsonLdObject`
    (bind+parse→object|null) + added `buildItemListJsonLd(items)` — wraps valid row objects as
    positioned `ListItem`s under `itemListElement`, ONE `escapeJsonForScript` (shared escaper),
    returns null on zero valid items (never an empty ItemList). Invalid rows drop, valid ones list.
  - `plan-types.ts`: `ListSource.itemList?: boolean` (opt-in; stored verbatim in listSource JSON —
    round-trips through setBlockField with no field allowlist, confirmed).
  - `tree.ts`: factored the jsonld prop-merge into `jsonLdValues(artifact, props)` (shared by the
    single-instance branch + the aggregator). New `emitItemList` closure (has components/locale/
    jsonLd) handed to planList: for each jsonld template child, stamp each row's mapped fields →
    bind → collect → push ONE ItemList; returns the handled component names.
  - `plan-list.ts`: `planList` takes an optional `emitItemList`; when `listSource.itemList===true`
    it calls it and DROPS the handled jsonld children from per-row visible stamping (so no
    double-emit of per-row scripts alongside the aggregate). Non-jsonld children stamp as normal.
- **Verified:** `node --test` full suite 1902 pass (was 1898; +4 new in jsonld-itemlist.test.ts:
  aggregate-one-script, default-off-still-per-row, empty→nothing, invalid-row-skipped). `tsc
  --noEmit` clean. Throwaway per-row composition test confirmed the existing path (deleted).
- **Files:** CMS/src/lib/render/jsonld-component.ts, plan-types.ts, tree.ts, plan-list.ts,
  CMS/src/lib/render/jsonld-itemlist.test.ts

## 2026-07-07 15:25 — ItemList JSON-LD authoring toggle (operator + AI knob)
- **Status:** DONE
- **What I did:** Closed the jsonld-List track by adding the KNOB to turn on the (already-shipped)
  aggregate `ItemList` render. Two surfaces, both write `listSource.itemList:true`:
  - **Builder** (`binding-panels.tsx` ListSettings): a checkbox "Emit ItemList JSON-LD" + hint,
    placed in the plain-list layout section right after autoscroll. Carried through edits by adding
    `itemList` to the `layout` object + persisting it in the `pres !== "combobox"` branch of
    `emitSource` (mirrors the `autoscroll` field). Localized EN/FI/ET (`list.itemList` /
    `list.itemListHint`).
  - **AI** (`bind_list` tool): added an `itemList` boolean to `BIND_LIST_TOOL` schema + `BindListArgs`
    + `validateBindList` (`typeof === "boolean"` gate, false survives so the AI can turn it OFF) +
    the `handleBindList` patch application (`if (v.itemList !== undefined) patch.itemList = v.itemList`).
    Chose `bind_list` (PATCH) over `create_list` — itemList is a config toggle on an existing list;
    the AI creates the list, binds a jsonld template, then flips this on. `create_list` left alone
    (it builds a fresh list; the toggle rides bind_list's reconfigure path).
- **Verified:** full `npm test` suite 1903 pass (was 1902; +1 in bind-list-combobox.test.ts:
  on/off/absent/non-boolean). `tsc --noEmit` clean. All 3 message JSONs parse. Builder checkbox is
  UNVERIFIED live (dev not run this session) — HITL to eyeball it on the canvas; render already
  proven by jsonld-itemlist.test.ts.
- **Files:** CMS/src/components/page-builder/binding-panels.tsx, CMS/src/lib/chat/binding-tools.ts,
  CMS/src/lib/chat/tool-dispatch.ts, CMS/src/lib/chat/bind-list-combobox.test.ts,
  CMS/messages/{en,fi,et}.json

## 2026-07-07 15:32 — AI authoring-guide section for JSON-LD (last jsonld backlog item)
- **Status:** DONE
- **What I did:** Added an on-demand `get_jsonld_guide` tool (schema.org structured-data
  authoring playbook) mirroring the shipped `get_data_sources_guide` seam. The AI reads the full
  jsonld playbook ON DEMAND instead of bloating every system prompt.
  - New pure module `CMS/src/lib/chat/jsonld-guide.ts` (`GET_JSONLD_GUIDE_TOOL` + `JSONLD_GUIDE`):
    what a jsonld component IS (kind:'jsonld', html = JSON-LD template not markup), the
    slot-quoting contract (string slots QUOTED `"name":"{{title}}"`, number/array UNQUOTED
    `"ratingValue":{{rating}}` — matches validateJsonLdArtifact's `0`-probe), required @context+@type,
    per-type patterns (Product/Article/FAQPage/Recipe), the AUTOMATIC BreadcrumbList (don't double
    up), binding for per-URL dynamic data, and the TWO List modes (per-row scripts vs aggregate
    ItemList via `bind_list itemList:true`), plus WHEN to author jsonld vs plain content.
  - Wired: tool-dispatch.ts (import + TOOL_SCHEMAS entry + constant handler), tool-scopes.ts
    (KNOWN_TOOL_NAMES + page-builder/components/pages context arrays + terse pointers in all three
    context prompts so the model knows the guide exists).
  - Test `CMS/scripts/jsonld-guide.test.mjs` (4 tests) locks the schema, the shipped surface +
    quoting facts, no-tool-name-drift, and the scope/prompt registration.
- **Verified:** `node --test scripts/jsonld-guide.test.mjs` 4/4 pass; data-sources-guide +
  tool-scopes tests still green; `npx tsc --noEmit` exit 0; full pure suite 1070 pass / 1 fail —
  the 1 fail is `live-ds-context-chip-check.mjs`, a MANUAL live-Chrome check ("not in the suite",
  needs dev server on :3602), pre-existing and unrelated to this change.
- **Files:** CMS/src/lib/chat/jsonld-guide.ts (new), CMS/src/lib/chat/tool-dispatch.ts,
  CMS/src/lib/chat/tool-scopes.ts, CMS/scripts/jsonld-guide.test.mjs (new)

## 2026-07-07 15:40 — SEO audit: deep component-tree scan
- **Status:** DONE
- **What I did:** Extended the read-only SEO audit to see links/images authored INSIDE referenced
  component trees (previously only raw `page.blocks` props were scanned). Chose the DEP-LIGHT path
  (a component-tree walk over the already-resolved `listComponents()` rows) over building the render
  plan — the plan pulls next-intl/React and would break the dep-free `node --test` layer. New PURE
  helpers in `seo-audit.ts`: `extractComponentSeo(tree)` (own hrefs + images{src,alt} + PascalCase
  deps) and `buildComponentSeoIndex(rows)` (name→ComponentSeo map; skips `kind:"jsonld"` and
  unparseable trees). `auditSeo` gained an OPTIONAL 3rd param `componentSeo`: when a block references
  a component, its TRANSITIVE (nested-ref, cycle-safe via a `seen` set) markup hrefs/images feed the
  SAME `checkHref`/`checkImage` broken-link + missing-alt logic (also counts inbound links so a page
  linked only from inside a component isn't a false orphan). Admin route
  (`settings/seo-audit/page.tsx`) now `listComponents()` + `buildComponentSeoIndex` and passes it in.
  Backwards compatible: no index → old block-props-only scan. AI `audit_meta` left untouched (it
  only surfaces `missingMeta`, which the deep scan doesn't affect).
- **Verified:** `node --test seo-audit.test.ts` = 19 pass (10 new); `npx tsc --noEmit` exit 0; full
  pure suite (excluding the known manual live-Chrome `live-ds-context-chip-check.mjs`) = 1914 pass /
  0 fail. Live admin-page render unverified (needs dev server + seeded components — HITL).
- **Files:** CMS/src/lib/render/seo-audit.ts, CMS/src/lib/render/seo-audit.test.ts,
  CMS/src/app/(admin)/admin/settings/seo-audit/page.tsx

---

## 2026-07-07 — Edge-cache /sitemap.xml with its OWN `sitemap` Cache-Tag (mirror the /llms.txt carve-out)
- **Task:** the lower-value follow-up. /sitemap.xml is crawler-hammered and did a per-request D1 read
  today (dot-gated OUT of edge caching by isEdgeCacheCandidate). Give it its own carve-out fn + tag,
  never widen the dot gate (llms precedent).
- **Shipped (all pure + release-gated worker):**
  - `SITEMAP_CACHE_TAG="sitemap"` + `SITEMAP_MAX_AGE=3600` + `sitemapXmlCacheHeaders(pathname)` (fixed
    `pathname === "/sitemap.xml"`) in `CMS/src/lib/render/edge-cache.ts` — a straight copy of the
    llms carve-out, DISTINCT tag.
  - `CMS/worker.ts`: folded into the SAME dot-file block as llms via
    `llmsTxtCacheHeaders(p) ?? sitemapXmlCacheHeaders(p)` (one Response rebuild, one return) — NOT a
    dot-gate loosening, so a top-level wildcard page can never match `/sitemap.xml` and stamp its tag.
  - Purge coverage (page-CONTENT sites ONLY, a SUBSET of the llms sites): publish route,
    api/pages PUT (both pathChanged branches) + DELETE, and `purgeTagsForPageWrite` (AI path,
    created+updated+translated). DELIBERATELY NOT brand PUT / llms-template PUT — neither is sitemap
    content (sitemap = URL + lastmod only).
- **Verified:** `node --test edge-cache.test.ts page-write-hooks.test.ts` — added 2 edge-cache carve-out
  tests (own-tag + distinct-from-llms; FIXED-single-path rejects /robots.txt /llms.txt /fi/sitemap.xml
  /sitemap-index.xml etc.) and rewrote the 3 page-write-hooks tests to assert SITEMAP_CACHE_TAG. Full
  project runner `npm test`: **1909 pass / 0 fail**. `npx tsc --noEmit`: only fresh-worktree
  CF-ambient errors (D1Database/R2Bucket/HTMLRewriter/ExportedHandler + env.DB) — resolve after
  `npx wrangler types` + the real build env; ZERO errors in any file I touched.
- **HITL:** release-gated (worker.ts, r-*) — verify `cf-cache-status: HIT` + publish-busts on a
  deployed site. Pre-release sitemap.ts `force-dynamic` keeps it no-store (never stale-cached).
- **Files:** CMS/src/lib/render/edge-cache.ts, CMS/worker.ts, CMS/src/app/api/pages/route.ts,
  CMS/src/app/api/pages/[id]/publish/route.ts, CMS/src/lib/render/page-write-hooks.ts,
  CMS/src/lib/render/edge-cache.test.ts, CMS/src/lib/render/page-write-hooks.test.ts

## 2026-07-07 15:45 — OG-image autogen tracer + decision (+ spike)
- **Status:** DONE
- **What I did:** Evaluated Cloudflare Browser Rendering for the fallback og:image and picked the
  `browser` Worker binding + `@cloudflare/puppeteer` over the Browser Rendering REST API. Rationale:
  the binding is an ACCOUNT-level product wired exactly like the existing `AI`/`IMAGES` bindings — no
  secret, no per-Site provision (deployer needs zero override). The REST path would need a Cloudflare
  account API token injected per-Site as a Worker SECRET through the deployer (the OPENROUTER_API_KEY
  plumbing) — more moving parts. Both need a PAID Workers plan (Browser Rendering isn't on Free) and
  share session/concurrency limits + cold-start, so autogen must be off the hot path, best-effort,
  waitUntil (that's the publish-wiring task). Shipped the SPIKE in `lib/render/og-image.ts`: the PURE
  R2 key scheme `ogImageKey(pageId,locale)`→`og/<id>.<locale>.png` (sanitized, its OWN `og/` namespace
  distinct from `assets/` uploads so autogen can never overwrite a media upload) + `isOgImageKey`
  guard + OG dims (1200×630, image/png), and best-effort `screenshotPageToR2(pageUrl,key)` — resolves
  the `BROWSER` binding via getCloudflareContext, launches puppeteer via a NON-LITERAL dynamic import
  (so tsc/the bundler don't require the optional, not-yet-installed dep), setViewport 1200×630,
  goto(networkidle0), png screenshot, put to R2 via the Storage port. Returns a structured
  `{ok:false,reason}` instead of throwing (so a waitUntil caller can ignore failures); skips silently
  when no binding/origin (local dev).
- **Verified:** +6 pure tests (scripts/og-image.test.mjs — key scheme, sanitization/traversal guard,
  namespace separation, dims, and that the spike returns ok:false without throwing in a bindingless
  env). `npx tsc --noEmit` fully clean. Could NOT verify a live screenshot — needs a PAID plan + the
  `BROWSER` binding in wrangler.jsonc + `npm i @cloudflare/puppeteer` on a DEPLOYED site (HITL). Did
  NOT touch worker.ts / edge-cache.ts (a parallel Meeseeks owned those this cycle).
- **Files:** CMS/src/lib/render/og-image.ts (new), CMS/scripts/og-image.test.mjs (new).

---

## 2026-07-07 12:xx — Per-URL-locale branded 404 (Page-level SEO controls)
- **Status:** DONE
- **What I did:** The branded 404 now renders in the VISITOR's URL locale (`/fi/missing` → 404 in
  fi) instead of always the site default. Next gives `not-found.tsx` no params/pathname, so:
  - **worker.ts:** injects the incoming pathname as request header `REQUEST_PATH_HEADER`
    (`x-bizbee-path`) BEFORE the OpenNext handler runs. GET-only, and it OVERWRITES (`headers.set`)
    so a client can't spoof a locale. Best-effort try/catch → falls back to the raw request. The
    request clone is cast `as typeof request` (cloning drops the incoming-`cf` type; OpenNext only
    reads standard headers/url so that's fine).
  - **load-plan.ts:** new `peelActiveLocaleFromPath(pathname)` — sibling to the existing
    `peelActiveLocale(params)` but takes a raw PATH STRING (what the header carries). Composes
    `pathnameSegments` (imported from edge-cache.ts — pure) + `peelLocaleSegment` + getContentLocales.
    Blank/absent path → site default locale.
  - **not-found.tsx:** reads the header via `next/headers` `headers()`, peels the locale, and
    `loadPlanById(pageId, locale)`. Absent header (pre-release worker / non-worker path) → site
    default = old behavior. Still emits `robots noindex`.
- **Why it's cache-safe:** a 404 is NEVER edge-cached (worker gate is GET-200-only —
  isEdgeCacheCandidate rejects status 404), so reading a request header in the (site) group here can
  never poison a cached published page. This is the explicitly-sanctioned exception in the CAVEATS.
- **Verified:** `npx tsc --noEmit` clean (only pre-existing `env.DB` CloudflareEnv ambient noise);
  full pure suite `npm test` 1919/1919 (+5: branded-404 locale composition in edge-cache.test.ts —
  header constant shape + `/fi/missing`→fi, `/et/…`→et, and default-fallback for `/missing`,
  `/en/missing`, `/`, `""`, `null`). Live render on a deployed Site is HITL/release-pending
  (worker.ts ships only via an r-* release).
- **Files:** CMS/worker.ts, CMS/src/lib/render/edge-cache.ts (REQUEST_PATH_HEADER const),
  CMS/src/lib/render/load-plan.ts (peelActiveLocaleFromPath), CMS/src/app/(site)/not-found.tsx,
  CMS/src/lib/render/edge-cache.test.ts

## 2026-07-07 12:53 — OG-image serving + metadata precedence (OG track item 2/4)
- **Status:** DONE
- **What I did:** Shipped the fallback-og:image serving + precedence layer (the lowest-risk OG item;
  no paid plan / BROWSER binding needed).
  - **Pure precedence** `resolveOgImageUrl` (og-image.ts): manual per-locale metaImage ALWAYS wins →
    else auto `og/<id>.<locale>.png` IF it exists → else undefined. Absolutizes against
    resolveSiteOrigin (leaves already-absolute URLs; collapses trailing origin slash; root-relative
    when no origin — Next metadataBase absolutizes in prod). Added `ogImageUrl` +
    `OG_IMAGE_ROUTE_PREFIX` (`/api/`) to mint the public URL for an `og/` R2 key.
  - **Serve route** `app/api/og/[...key]/route.ts`: streams the R2 `og/` object via the storage port,
    `isOgImageKey`-guarded (traversal-safe). Under /api because the (site) catch-all shadows arbitrary
    top-level paths AND /api is a SKIP_SEGMENT (worker can't stamp a wildcard cache-tag on it).
    `max-age=3600` (NOT immutable — fixed key per page×locale, a regenerate overwrites in place).
  - **Wiring** `generateMetadata` ((site)/[[...slug]]): renamed `image`→`manualImage`, and now probes
    R2 for the auto image ONLY when there's no manual image (one `getStorage().get(ogImageKey(...))`
    on the METADATA path — NOT the 429 render hot path; a manual-image page pays ZERO extra reads).
    The resolved `image` flows into buildOpenGraph + buildTwitterCard unchanged, so twitter:card
    auto-upgrades to summary_large_image on the auto image with NO social-cards.ts change.
- **Verify:** +8 tests in og-image.test.mjs (precedence: manual-wins / auto-fallback / none /
  blank-manual / absolute-untouched / no-origin / trailing-slash; ogImageUrl round-trips through
  isOgImageKey). `npm test` = 1930 pass / 0 fail; `tsc --noEmit` clean.
- **Caveat left:** "OG-image PRECEDENCE + serving" — the one place precedence lives; R2 probe stays
  off the render hot path; nothing writes `og/` objects yet (autoExists always false until the
  publish-wiring task) so precedence currently degrades to manual-or-none (correct no-op). Live R2 = HITL.
- **NEXT:** OG-image publish wiring (track item 3/4) — on publish, per configured locale, if no
  manual metaImage AND no `og/<id>.<locale>.png` yet → best-effort `ctx.waitUntil(screenshotPageToR2(...))`;
  page delete removes its `og/` objects. Never blocks the publish (purge-edge/IndexNow pattern).
  Do NOT touch CMS/worker.ts or CMS/wrangler.jsonc this cycle (parallel rate-limit Meeseeks owns them).

---

## 2026-07-07 12:xx — Naughty-robot rate limiting (worker-level per-IP, backlog item 1/2)
- **Status:** DONE
- **What I did:** Worker-level per-IP rate limit on PUBLIC PAGE paths only, BEFORE the OpenNext
  handler so a throttled bot never touches the render/D1 path.
  - **wrangler.jsonc** (I owned it this cycle): added `unsafe.bindings` rate-limit binding
    `PUBLIC_RATE_LIMITER` (`type:"ratelimit"`, `namespace_id:"1001"`, `simple:{limit:100,period:60}`)
    — account-level like AI/IMAGES, no per-Site provision, deployer needs no override.
  - **edge-cache.ts** (pure, node-testable): `isRateLimitCandidate({method,pathname})` reuses the
    SAME `SKIP_SEGMENTS` + dotted-root gate as `isEdgeCacheCandidate` (single source of truth for
    "public page path") — GET only, system paths (media/api/admin/preview/_next) exempt, dotted-root
    files (sitemap/robots/llms/favicon) exempt. `rateLimitKey(headers)` = CF-Connecting-IP (edge-set,
    unspoofable) → falls back to a `"shared"` global bucket, never null. `rateLimitedResponse()` =
    429 + `Retry-After:60` + `Cache-Control:no-store`. `isVerifiedCrawler(cf)` = the verified-crawler
    exemption investigation (see below + new CAVEAT).
  - **worker.ts** (I owned it): checks the binding after the md-rewrite gate, before the 404-path
    injection: `limiter && isRateLimitCandidate(...) && !isVerifiedCrawler(request.cf)` → `limit({key})`
    → `success:false` returns the 429. Binding accessed via `(env as {PUBLIC_RATE_LIMITER?:RateLimit})`
    so it needs no CloudflareEnv typegen; absent binding (local dev / pre-release) = no throttle.
    Best-effort try/catch — a limiter error fails OPEN (never blocks serving).
- **Verified crawler exemption (investigation):** `cf.verifiedBotCategory`/`cf.botManagement.verifiedBot`
  are Bot-Management-gated (Enterprise add-on) → usually ABSENT on Free/Pro/workers.dev, so the helper
  returns false and the IP limiter still applies. No reliable FREE verified-bot cf flag today; the free
  alternative (reverse-DNS of CF-Connecting-IP vs googlebot.com PTR) is a per-request DNS round-trip —
  too heavy for this hot gate. Shipped default = generous 100/min cap (legit crawlers stay under) PLUS
  a cf-object exemption that "lights up for free" on any Site that DOES carry the signal.
- **Tests:** +13 in edge-cache.test.ts (candidate gate, non-GET exempt, SKIP_SEGMENTS exempt, dotted-root
  exempt, key extraction+fallback, 429 shape, crawler exemption). Suite 1919 → 1932, all pass.
- **tsc:** clean re: my change — the only 3 errors are the PRE-EXISTING `CloudflareEnv.DB` misses (no
  OpenNext-generated cloudflare-env.d.ts on a clean checkout; identical count on the stashed base).
- **Release-gated:** worker.ts + wrangler.jsonc ship ONLY via a release tag (r-*) — invisible on
  deployed Sites until a release is cut. Live 429/Retry-After behavior is HITL (needs a deployed Site +
  a paid plan for the rate-limit binding + a release). Per-site configurable threshold is backlog item 2/2.

## 2026-07-07 16:06 — OG-image autogen publish wiring (OG track item 3/4)
- **Status:** DONE
- **What I did:** Wired OG-image fallback screenshots into the page publish + delete lifecycle.
  - PURE (og-image.ts): `planOgScreenshots({pageId,urlsByLocale,manualImageByLocale,existingKeys})`
    → one `{locale,pageUrl,key}` job per locale that has (a) a page URL, (b) NO manual metaImage,
    and (c) NO existing `og/<id>.<loc>.png`. Manual-upload-wins + idempotent baked into the planner.
    `ogImageKeysForLocales(id,locales)` derives the deduped cleanup key set (Storage has no list).
  - COUPLED shell (NEW `og-image-notify.ts`, mirrors indexnow-notify.ts): `generateOgImagesForPage(id)`
    reads page rows + content locales + origin, builds per-locale absolute URLs via
    `pagePathsByLocale` (SAME machinery as sitemap/IndexNow → URLs match), probes R2 for existing auto
    keys (only for no-manual locales), plans, then screenshots SEQUENTIALLY (Browser Rendering
    concurrency is scarce) via `screenshotPageToR2`. `deleteOgImagesForPage(id)` R2-deletes every
    derived key. BOTH best-effort under `ctx.waitUntil` (or inline w/o CF ctx) — never fail/delay the
    write. No-op without the BROWSER binding (screenshotPageToR2 returns no-binding; the delete just
    finds no objects).
  - Wired: publish route POST → `await generateOgImagesForPage(id)` after IndexNow; pages DELETE →
    `await deleteOgImagesForPage(id)` before deletePage.
  - Did NOT touch worker.ts / wrangler.jsonc (parallel Meeseeks owns them this cycle).
- **Verified:** +6 pure tests in og-image.test.mjs (planner: emits/manual-wins/idempotent/no-url/empty;
  keys dedup). Full suite 1932 → 1943 pass. `npx tsc --noEmit` clean. Live screenshot round-trip is
  HITL (needs paid plan + BROWSER binding + `npm i @cloudflare/puppeteer` + deployed R2).
- **Files:** src/lib/render/og-image.ts (planOgScreenshots + ogImageKeysForLocales),
  src/lib/render/og-image-notify.ts (NEW), src/app/api/pages/[id]/publish/route.ts,
  src/app/api/pages/route.ts, scripts/og-image.test.mjs.
