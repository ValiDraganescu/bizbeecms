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

- (2026-07-07) JSON-LD on published pages rides `RenderPlan.jsonLd: string[]` — the
  ESCAPED INNER text of `application/ld+json` scripts (NOT the full `<script>` tag). Built at
  plan time in `render-page.tsx buildPlanFromPage`, rendered by `RenderedPage` (wraps each in a
  React `<script type="application/ld+json" dangerouslySetInnerHTML>` — JSON-LD is INERT data,
  a React inline script is correct here, UNLIKE author client scripts which need ClientScripts).
  The pure builder does ALL escaping (`<`/`>`/`&`→`\uXXXX`, breakout-safe) so the plan string is
  safe to inject raw — DON'T re-escape or wrap. `breadcrumb.ts` exports BOTH `buildBreadcrumbData`
  (inner JSON, for React callers) and `buildBreadcrumbJsonLd` (full `<script>` string, for the
  future jsonld-component-kind HTML path). When the jsonld component kind lands, reuse the SAME
  escaping (JSON-string escape, NOT the HTML escape path) and consider funneling its output onto
  `plan.jsonLd` too, or into the tree — either way keep the escaping in ONE pure place.
- (2026-07-07) Breadcrumb build REUSES the per-render page-rows read in `buildPlanFromPage`
  (the one feeding `createPathTranslator`/`pagePathsByLocale`) — added `metaTitle` to its select,
  NO new query. Ancestor titles = `resolveLocalized(parseJsonColumn(row.metaTitle))` (per-locale
  map, active locale); ancestor URLs = `pagePathsByLocale(rows, ancestorId, params, ...)` for the
  active locale, absolutized via `resolveSiteOrigin()` (root-relative fallback in local dev). It's
  best-effort: `ancestorChain` returns null on a cycle/dangling parent, `buildBreadcrumbData`
  returns null if ANY hop lacks a name or url — no partial/lying trail is ever emitted. If you add
  a 2nd page column to that select, keep the type in `BreadcrumbRow` in sync.
- (2026-07-07) Search-engine verification tokens live in settings key `site_verification`
  (getSiteVerification/setSiteVerification), NOT in `site_identity` — kept separate so they
  don't bloat the AI system prompt. Pure `lib/render/site-verification.ts`:
  `normalizeSiteVerification` STRIPS every char outside `[A-Za-z0-9._-]` (an operator often
  pastes the whole `<meta ...>` tag or an injection string — stripping leaves just the token,
  so no meta-attr breakout in `<head>`). `buildVerificationMeta` maps to Next's
  `Metadata.verification`: google→`google`, yandex→`yandex`, bing→`other["msvalidate.01"]`
  (Next has NO first-class Bing field — do NOT invent `verification.bing`, it's ignored; the
  `other` map is the only way to emit `msvalidate.01`). It returns undefined when empty so no
  verification meta ships. Wired in `generateMetadata` ((site)/[[...slug]]) as an EXTRA D1 read
  on the metadata path (fine — that's NOT the 429 render hot path; same placement as the OG
  brandName read). Visitor-independent (stored tokens, not request). If a FILE-based
  verification method is ever needed, use a FIXED static path (dynamic top-level segments
  collide with the catch-all — see the earlier caveat).

- (2026-07-07) JSON-LD component KIND: `component.kind` ('html' default | 'jsonld') + `draft_kind`
  (migration 0031). A jsonld component's `html` COLUMN holds a JSON TEMPLATE (schema.org object
  with `{{prop}}` slots), NOT markup — the render loops in render-page.tsx DON'T `parseHtml` it;
  they carry the raw string as `ComponentArtifact.jsonTemplate` (tree = ""). `planPage` (tree.ts)
  routes a jsonld block to `buildJsonLdComponent` and pushes the payload onto `plan.jsonLd`,
  rendering a HIDDEN placeholder in the flow (zero visible text). Binding is STRING-level
  (`bindJsonLdSlots`, NOT the tree walk / NOT bindTree): a string slot gets INNER JSON escaping
  (a `"` in user content can't break the JSON literal); number/object slots splice their JSON
  form verbatim (template must OMIT the quotes: `"r":{{rating}}`). Escaping is the SHARED
  `escapeJsonForScript` in `jsonld-component.ts` — breadcrumb.ts now imports it (ONE escaper).
  `buildJsonLdComponent` returns null (→ no script) on a blank template OR a bound result that
  doesn't `JSON.parse` — never ships malformed structured data. render-page's auto-breadcrumb
  APPENDS to `plan.jsonLd` (was overwrite) so component + breadcrumb JSON-LD coexist. NOTHING
  WRITES kind yet — the authoring surface (create/update component, Develop editor, canvas chip,
  draft_kind publish/discord) is the NEXT backlog task. When you add authoring: publish must copy
  draft_kind→kind + discard must clear it, mirroring the html/script/css draft columns.
- (2026-07-07) OG/Twitter cards: pure builders in `lib/render/social-cards.ts`
  (`buildOpenGraph`/`buildTwitterCard`) fed by `generateMetadata`. brandName comes
  from `getSiteIdentity()` (settings-store) — this is an EXTRA D1 read, deliberately
  placed on the metadata path which is NOT the 429 rate-limit hot path (that's the
  page RENDER path via worker.ts). If you add more metadata site-settings reads,
  keep them here, not in the render/worker hot path. twitter:card =
  summary_large_image ONLY when a per-locale metaImage resolves, else summary.

- (2026-07-07) JSON-LD authoring WRITE PATH: `ComponentArtifactInput` now carries `kind?`
  ('html'|'jsonld') + `jsonTemplate?` (the raw JSON-LD template string). For a jsonld artifact
  `tree` is the EMPTY tree (`parseHtml("")`) and the raw template lives in `jsonTemplate` — because
  JSON-LD isn't HTML, `upsertComponent` writes the `html`/`draft_html` COLUMN from `jsonTemplate`
  (NOT `treeToHtml(tree)`). So the `html` column of a jsonld component is a JSON template, exactly
  what the render tracer (render-page.tsx) expects. `kind` is OMITTED (undefined) unless the caller
  passes one, so an html-only edit/save NEVER resets the stored kind (same preserve-when-absent
  contract as propsSchema/label). `draft_kind` is staged ONLY when the incoming kind DIFFERS from
  live (else null) — publish copies `draft_kind→kind` only when non-null, else keeps live kind.
- (2026-07-07) Validating a jsonld TEMPLATE (which isn't valid JSON on its own because of unquoted
  slots like `"count":{{n}}`): `validateJsonLdArtifact` replaces every `{{slot}}` with the literal
  `0` before `JSON.parse` — `0` is a legal JSON token in BOTH quoted (`"x":"0"`) and unquoted
  (`"x":0`) positions, so the probe parses regardless of slot position. Do NOT probe-replace with
  `""` (breaks a quoted string slot → `"x":""""`). The probe validates SHAPE only (object + @context
  + @type); the ACTUAL bound-value JSON validity is re-checked at render time by `buildJsonLdComponent`
  (returns null on a bound result that doesn't parse — never ships malformed structured data).
- (2026-07-07) A jsonld component's `script`/`css` are IGNORED at validate time (blanked to "") —
  it emits no HTML/JS. The PUT route + tool-dispatch still run `lintComponentScript`/
  `reconcileComponentClasses` over the artifact, but the tree/script/css are empty so those are
  harmless no-ops. Don't add a jsonld-specific guard there; the empty inputs already handle it.
- (2026-07-07) jsonld READ path now carries kind: `ComponentRow.kind?: string|null` +
  `getComponentByName` returns the EFFECTIVE kind (live → `kind`; draft read → `draftKind ?? kind`,
  matching publishComponentDraft). `kind` is UI-ONLY — `serializeComponent` deliberately EXCLUDES it
  from the portable bundle (pinned by portable.test.ts); it must never leak into a cross-Site bundle.
  GET `/api/components?name=` ships it out-of-band in the `X-Component-Kind` response HEADER (default
  "html") so the Develop editor can read the loaded kind without polluting the bundle JSON — the
  `?draft=1` refetch returns the draft kind. The editor UI PROPER (kind toggle, JSON-template pane,
  save PUT kind:jsonld) is still TODO; it reads kind from that header. `listComponents` (the gallery
  list) still doesn't select kind — add it there if the rail ever needs to badge jsonld components.

- (2026-07-07) JSON-LD Develop editor: the portable-bundle `tree` for a jsonld component is a
  parseHtml-MANGLED version of the JSON template (getComponentByName does `parseHtml(r.html)` and
  r.html IS the JSON template) — you CANNOT reconstruct the template from the bundle. The raw
  template rides out-of-band on GET `/api/components?name=` as a base64 header
  `X-Component-Json-Template` (base64 so newlines/non-ASCII survive; codec = shared pure
  `lib/components/base64-header.ts`, round-trip tested). The workbench decodes it as the editor
  content. Kept OUT of the portable bundle for the same reason as `kind`/`label` (UI-only). Added
  `ComponentRow.jsonTemplate` (the raw html column verbatim) so the route can read it — it's NOT
  serialized into the bundle (portable.test.ts still pins the bundle shape).
- (2026-07-07) The Develop editor is now AUTHORITATIVE on kind: it reads the loaded kind on GET and
  the save PUT ALWAYS sends `kind` (not just when jsonld). This is fine — an explicit `kind:"html"`
  on an html component is a no-op, and it's REQUIRED so the HTML|JSON-LD toggle can persist a
  jsonld→html switch (preserve-when-absent would otherwise strand the old kind). Do NOT copy this
  "always send kind" onto the AI `update_component` tool — the AI legitimately omits kind to leave
  it alone; only the workbench (which loaded the kind) may assert it.
- (2026-07-07) Switching an html component to jsonld via the toggle leaves the current html markup
  as the template draft — it usually won't be valid JSON, so the SAVE gets a 400 from
  validateJsonLdArtifact (shown inline) and the preview says "invalid JSON" until the operator writes
  a real schema.org template. This is intended/self-correcting, NOT a bug — don't "fix" it by
  blanking the editor on switch (that would nuke an operator's in-progress work if they mis-toggled).

- (2026-07-07) JSON-LD × bindings needs NO special seam — `hydrateBlockBindings`
  (render-page.tsx) resolves `block.bindings` + route `{param}`/`{query}` refs INTO
  `block.props` BEFORE planPage, and the jsonld branch in tree.ts (~line 285) reads that
  SAME hydrated `block.props`, so bound/route values flow into the JSON template exactly
  like html content (fenced by `jsonld-bindings.test.ts`). LIST-kind blocks are the ONLY
  binding path a jsonld component can't ride: planPage's jsonld branch handles a SINGLE
  component instance, not the per-row List repeat — a "one JSON-LD script per collection
  row" (ItemList) use case would need new work in planList, not hydrateProps. Single-item
  binding + wildcard `:param` detail pages (the stated goal) are fully covered.

- (2026-07-07) Branded 404: the site's 404 page renders via `(site)/not-found.tsx`, reached when
  the catch-all `[[...slug]]/page.tsx` calls `notFound()` (a Server Component CANNOT set an
  arbitrary HTTP status — `notFound()` → not-found.tsx is the ONLY way to get a 404 status). It
  reads setting `not_found_page` (getNotFoundPageId/setNotFoundPageId) and renders via
  `loadPlanById(pageId, DEFAULT_locale)` (load-plan.ts — re-checks published, so a deleted target
  degrades to the plain 404). It renders in the site DEFAULT content locale, NOT the visitor's URL
  locale, because Next gives not-found.tsx NO params/pathname AND the (site) group must read no
  request/visitor-varying data (cache-poison guard). Do NOT "fix" it to read Accept-Language/cookie
  — use the release-gated worker-header path (BACKLOG follow-up) if per-URL-locale 404 is needed. A
  404 is never edge-cached (isEdgeCacheCandidate rejects status!=200), so reading a request header
  in not-found.tsx would be edge-safe IF you go the worker-injected-path route. The PUT route
  (`api/settings/not-found-page`) HARD-rejects a non-published id (code `notPublished`) — options
  list is published-only, so this only fires on a stale list. load-plan.ts refactor: `loadPlan`
  and `loadPlanById` share `planForPage(pageRow, locale, routeContext)`; `peelActiveLocale` is
  exported for the future per-locale follow-up.
- (2026-07-07) AI write-path IndexNow/purge: `upsertPage` (page-store) and `applyTranslation`
  (translate-store) success shapes now return `pageId` (additive — needed because the AI tools
  address pages by SLUG but the hooks need the id). The AI hooks live in tool-dispatch
  `handleCreatePage`/`handleTranslate`, NOT the REST route, and are DELIBERATELY LIGHTER than the
  REST /api/pages hooks: they do purge(per-page tag) + notifyIndexNowForPage only. They do NOT run
  the rename 301 auto-capture (redirectsForRename/applyRenameRedirects) or the noindex-transition
  pre-capture — create_page upserts by slug and can't MOVE an existing page's URLs, and there's no
  AI noindex/rename tool. Purge-tag decision is the pure `lib/render/page-write-hooks.ts`
  (CREATE=[] since nothing's cached yet; UPDATE/translate=[pageCacheTag(id)]). If an AI rename or
  AI noindex tool ever lands, it MUST additionally run the REST route's rename/noindex pre-capture
  trio or renames silently 404 inbound links / noindex-ON never re-pings.

- (2026-07-07) `/llms.txt` lists ONE entry per page in the site DEFAULT content
  locale (a curated index, NOT the sitemap's full locale × page enumeration).
  Links point at `<path>.md` (root `/` stays `/`, no `/index.md`) — those `.md`
  URLs 404 until the markdown-page-variants task ships the serializer; that's
  expected, not a bug. Pure builder `lib/render/llms-txt.ts`: `buildLlmsTxt`
  oneLine-collapses EVERY value (name/tagline/title/desc) so a newline/tab in
  operator content can't break a Markdown link line — keep that if you extend it.
  `publishedPagePaths` now returns `id` (additive) so llms.txt can look up the
  page row's per-locale metaTitle/metaDescription; sitemap.ts ignores it.
  GOTCHA: `resolveLocalized({}, locale)` on an EMPTY locale map returns the `{}`
  OBJECT (empty {} isn't a locale object), so String() it → `[object Object]`.
  The route guards with a `typeof v === "string"` check — do the same anywhere
  you String()-ify a resolveLocalized result of a possibly-empty JSON column.

- (2026-07-07) ROUTING FACT (proven this run, two throwaway dev tests): the `(site)` OPTIONAL
  catch-all `[[...slug]]/page.tsx` shadows EVERY sibling route — even a more-specific LITERAL
  segment like `app/_mdtest/[...slug]/route.ts` lost to it (`/_mdtest/about` rendered the catch-all
  PublicPage, not the handler). ONLY fixed SYSTEM prefixes survive (`api`/`media`/`_next` — the
  SKIP_SEGMENTS set; `/api/mdtest2/about` DID reach its handler). ALSO proven: a page component
  CANNOT return a `Response` (Next tries to render it as an element → error page). Consequence: any
  new non-HTML surface at an ARBITRARY page path must live under `/api/*` (or media/_next) and be
  reached via a worker.ts URL rewrite — you cannot add it as a normal app route/page.
- (2026-07-07) Markdown variants: served by INTERNAL route `app/api/md/[...slug]/route.ts` (builds
  the plan via `loadPlan` — pulls next-intl/React, so it CAN'T live in the lean worker.ts) + a
  release-gated `worker.ts` rewrite of public `/<path>.md`→`/api/md/<path>.md` (pure
  `markdownVariantRewrite` in edge-cache.ts). Placed under `/api` on purpose: `api` is in
  SKIP_SEGMENTS so `isEdgeCacheCandidate` rejects it — a deep `/products/item.md` can NEVER get a
  wildcard `:param` page's Cache-Tag stamped on it (the sitemap-staleness precedent is sidestepped
  structurally, no special-casing needed). The route 404s unpublished/route-miss/**noindex** (4th
  crawler-hide gate alongside generateMetadata/sitemap-skip/IndexNow-skip — keep in sync). The pure
  serializer `planToMarkdown` walks the ALREADY-BUILT ElementPlan (visitor-independent, no
  request/next-intl reads → edge-safe philosophy preserved). The worker rewrite only fires on GET.
  Home `/` has NO `.md` variant (llms.txt links root to `/`, not `/.md`) and `/api/md/` 308s (Next
  trailing-slash) — fine. Public `/<path>.md` is UNVERIFIED until a release cuts worker.ts; the
  internal route is dev-verified.
