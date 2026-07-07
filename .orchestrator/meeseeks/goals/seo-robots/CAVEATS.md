# Caveats — seo-robots
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- (seeded by curator, 2026-07-07) `CMS/worker.ts` ships ONLY via a release tag (r-*) — worker changes
  are invisible on deployed sites until a release is cut. Don't cut releases yourself (release manager
  owns them); note HITL verification as pending instead.
- (seeded) Google retired sitemap ping (June 2023) and does not support IndexNow. Don't add a Google
  ping call — it 404s. Sitemap + robots pointer is the Google path.
- (seeded, after commits 7709a01 + a5aa278) Published-page bytes are PROVABLY visitor-independent —
  the `(site)/(admin)` root-layout split keeps next-intl and all Accept-Language/cookie-varying bytes
  out of published output (fenced by site-layout-isolation.test.ts). JSON-LD rendering and anything
  else this goal adds to published pages must preserve that: never interpolate request/visitor-varying
  data into published HTML, and never import next-intl (or `next/headers` locale resolvers) into the
  `(site)` render path — it re-poisons the edge cache.
- (seeded) Adjacent prior art lives in `goals/path-locales-edge-cache/` (ACTIVE): sitemap.ts,
  hreflang/localize-paths, worker.ts edge-cache gate, purge-edge.ts best-effort pattern. Read its
  CAVEATS before touching those files — several designs there are deliberately partial and look like
  bugs but aren't.
- (2026-07-07) `isEdgeCacheCandidate` rejects ALL dotted single-segment root paths — /sitemap.xml,
  /robots.txt, /llms.txt, the IndexNow /<key>.txt are ALREADY edge-cache-excluded. Do NOT add
  per-route exclusions when building those routes; the dot gate covers them (root-level only —
  deeper dotted wildcard URLs stay cacheable, fenced in edge-cache.test.ts).
- (2026-07-07) sitemap lastmod = `page.updatedAt`, which OVER-reports on two paths: getDraft
  auto-create and restore-to-draft bump it without changing published bytes (deliberate — it also
  drives admin "recently edited"). saveDraftBlocks correctly does NOT bump. Don't "fix" by making
  version-store writes stop bumping without checking the admin pages list; a real fix needs a
  separate live-content timestamp. Component/theme/brand publishes change rendered HTML without
  bumping any page.updatedAt — known lastmod gap, accepted.

- (2026-07-07) The root optional-catch-all `(site)/[[...slug]]/page.tsx` owns `/<anything>`,
  so you CANNOT add a Next route with a DYNAMIC single top-level segment (e.g. `/[key].txt`) —
  it conflicts. IndexNow's key file is served at a FIXED path (`INDEXNOW_KEY_PATH` = `/indexnow-key`,
  `app/indexnow-key/route.ts`); the spec allows any keyLocation on the host. Any future
  top-level SEO/verification file (Google/Bing verification, `.well-known/*`) must likewise
  use a FIXED static path, not a dynamic segment.
- (2026-07-07) robots.txt is served by a ROUTE HANDLER `app/robots.txt/route.ts`, NOT the
  Next `robots.ts` metadata convention — the free-text override must be served verbatim, which
  the structured `MetadataRoute.Robots` shape can't represent. Config lives in D1 settings key
  `robots_config` (getRobotsConfig/setRobotsConfig). Pure builder + hardening in
  `lib/render/robots-txt.ts` (normalizeRobotsConfig strips CR/LF/`:` injection — the format is
  line-oriented, so an un-sanitized path/UA could forge rules). If you add the robots settings
  UI (backlog task 2), write through setRobotsConfig (it normalizes) and don't re-invent the
  shape. `Sitemap:` pointer is auto-appended by buildRobotsTxt — the UI must NOT add its own.
- (2026-07-07) robots settings PUT (`api/settings/robots`) validates by NORMALIZING, not
  rejecting: `setRobotsConfig`→`normalizeRobotsConfig` silently drops bad paths/UAs and
  strips CR/LF/`:` injection, so there are NO stable error codes to surface and the PUT
  effectively never 400s on content. The editor therefore ADOPTS the server-returned
  normalized config after save (so the user sees what actually got stored). If you ever need
  a hard reject (e.g. "path must start with /"), add it in the route BEFORE setRobotsConfig —
  don't expect normalize to reject. UI contract: a non-blank free-text override DIMS+DISABLES
  the structured section (it's ignored server-side); keep that so operators aren't confused.
- (2026-07-07) IndexNow submit is best-effort via `notifyIndexNowForPage` / `notifyIndexNowUrls`
  (indexnow-notify.ts, ctx.waitUntil so it never blocks the write) — mirror this for any new
  content-change hook. DELETE must call `collectPageUrls(id)` BEFORE `deletePage` (the row +
  its path chain are gone after). Rename currently submits only the NEW URLs (old URLs 404 for
  crawlers until the 301-redirects task lands and re-notifies the old paths).

- (2026-07-07) 301 redirects: `permanentRedirect()`/`redirect()` from
  next/navigation emit HTTP **308/307**, NOT 301/302 (Next has no 301/302 helper
  in a Server Component). Search engines treat 308≈301 and 307≈302, so this is
  fine for SEO; the stored `status` (301/302) is the INTENT and picks which
  helper. Don't "fix" it to literal 301 — you'd have to drop out of the RSC path
  into a route handler / middleware. The redirect table + serving lives in
  `(site)/[[...slug]]/page.tsx` (loadPlan miss → getRedirect → throw before
  notFound). Pure matcher `lib/render/redirects.ts`, store `db/redirect-store.ts`.
- (2026-07-07) Rename auto-capture: `api/pages/route.ts` snapshots ALL path rows
  (`getPathRows`) BEFORE `upsertPageMeta`, then on `res.pathChanged` diffs old→new via
  `redirectsForRename` (pure, in redirects.ts) and stores via `applyRenameRedirects`
  (redirect-store). The whole block is best-effort (try/catch) — it MUST never fail the
  page save. `pathChanged` comes from upsertPageMeta (uses `pagePathInputsChanged`); it's
  false for pure SEO/publish edits, so no redirect churn on those. Affected set =
  `descendantIds(oldRows,id)` because a rename shifts the whole subtree's URLs, not just
  the one page. `applyRenameRedirects` also prevents CHAINS (rewrites existing redirects
  pointing at an old path) — don't add a second chain-guard elsewhere. If you add a rename
  path OUTSIDE this route (e.g. an AI rename tool), it must call the same trio or renames
  there silently 404 inbound links.
- (2026-07-07) Manual redirect admin validation is a HARD reject in the ROUTE
  (`api/settings/redirects` POST) via pure `validateManualRedirect` — UNLIKE the
  robots PUT which normalizes silently. Chains/loops/duplicates are operator
  mistakes worth surfacing. It returns a stable `code` (8 codes) the editor maps
  to `redirects.errors.<code>`; the store's `upsertRedirect` still normalizes +
  drops self-loops as a belt-and-braces layer. `duplicate` fires when `from` is
  already a source (upsert would silently OVERWRITE — the check forces an explicit
  delete-first). Editor POST-then-RE-READS the list (no optimistic add) because
  rename auto-capture may add rows concurrently. If you add an EDIT (not just
  add/delete) later, pass `excludeId` so a row doesn't flag itself as duplicate.
- (2026-07-07) Redirect path NORMALIZATION is case-SENSITIVE and lives in ONE
  place (`normalizeRedirectPath`) used at BOTH insert (store) and lookup so the
  unique index `redirect_from_path_unique` and the matcher agree. When you build
  auto-capture (next task) + the admin UI, ALWAYS route paths through the store's
  upsert (it normalizes + drops self-redirects) — never write raw paths, or the
  index and the lookup diverge. The `getRedirect` hot read matches the
  already-normalized fromPath directly (indexed), so no full-table scan.

- (2026-07-07) Per-page `noindex` is page-level (single boolean), NOT per-locale —
  the SEO tab checkbox lives OUTSIDE the per-locale fieldset. It follows the
  cacheMaxAge "preserve-when-absent" contract: `PageMetaInput.noindex?` is absent
  in the publish-toggle / localized-slugs / cache bodies, so ONLY `buildSeoMetaBody`
  (the SEO tab) carries it — a publish flip or slug edit must NEVER clobber noindex.
  Enforcement is in THREE places, keep them in sync if you add a 4th surface:
  (1) `generateMetadata` robots:{index:false}, (2) `publishedPagePaths` sitemap
  skip, (3) `collectPageUrls` IndexNow skip. The sitemap/render gates are LEAF-only
  (a noindexed parent still lets an indexable child through — mirrors the
  unpublished-ancestor gate). `page.noindex` is INTEGER 0/1 in D1 (Drizzle `number`);
  `PageSummary.noindex` is the coerced `boolean`.

- (2026-07-07) There is NO separate page `title` column — page titles are stored
  per-locale in `page.metaTitle` (a JSON locale→string map). The `title` var in
  `generateMetadata` IS the resolved metaTitle. Don't look for a `page.title`
  fallback (an earlier NEXT note implied one existed); OG/Twitter titles fall back
  to metaTitle and nothing more.
- (2026-07-07) IndexNow noindex-transition: the PUT persist() in `api/pages/route.ts`
  pre-reads BOTH the OLD noindex (`getPageById`) AND the page URLs (`collectPageUrls`)
  BEFORE `upsertPageMeta`, because once noindex flips ON `collectPageUrls` returns []
  (crawler-hidden) — same "capture before it's gone" reason DELETE captures URLs pre-delete.
  Transition gate is pure `noindexTurnedOn(before, after)` in indexnow.ts (true ONLY for
  false→true; `after===undefined` = preserve-when-absent = no change). All best-effort try/
  catch. When you add ANOTHER path that can flip noindex (e.g. an AI SEO tool), it must do
  the same pre-capture or the noindex-ON recrawl ping is silently skipped. Note: on
  noindex-ON, `notifyIndexNowForPage(id)` is a no-op (page is now noindexed) — the ping
  rides entirely on the pre-captured `preUrls` via `notifyIndexNowUrls`.

- (2026-07-07) OG/Twitter cards: pure builders in `lib/render/social-cards.ts`
  (`buildOpenGraph`/`buildTwitterCard`) fed by `generateMetadata`. brandName comes
  from `getSiteIdentity()` (settings-store) — this is an EXTRA D1 read, deliberately
  placed on the metadata path which is NOT the 429 rate-limit hot path (that's the
  page RENDER path via worker.ts). If you add more metadata site-settings reads,
  keep them here, not in the render/worker hot path. twitter:card =
  summary_large_image ONLY when a per-locale metaImage resolves, else summary.
