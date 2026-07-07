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
