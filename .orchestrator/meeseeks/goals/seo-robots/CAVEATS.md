# Caveats — seo-robots
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- (USER INSTRUCTION 2026-07-07) The opennext deploy-gate build DOES work locally: run it with the
  superadmin guard off — `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare build` (env override beats
  .env.local; never edit .env.local itself). Stop any running dev server first (build corrupts .next
  under a live dev server). Use this as the pre-commit build gate instead of skipping it as
  "unverifiable locally".

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
  `block.props` BEFORE planPage, and the jsonld branch in tree.ts reads that
  SAME hydrated `block.props`, so bound/route values flow into the JSON template exactly
  like html content (fenced by `jsonld-bindings.test.ts`). Single-item binding + wildcard
  `:param` detail pages (the stated goal) are fully covered.
- (2026-07-07) List × JSON-LD — BOTH modes now work; the OLD caveat "planList can't ride a
  jsonld component" was WRONG for the per-row case: (1) PER-ROW (default) — a jsonld component as
  a List TEMPLATE CHILD already emits N separate Product/Article scripts, because planList stamps
  each row via `planBlock(stampRow(t,row,map))` and that fires the jsonld branch per row (proved
  end-to-end). NOTHING special needed. (2) AGGREGATE ItemList — opt-in `listSource.itemList:true`
  emits ONE `ItemList` over the rows instead of per-row scripts. Wiring: `tree.ts`'s `emitItemList`
  closure (handed to `planList`) identifies jsonld template children, stamps+binds each row via the
  SHARED `jsonLdValues` + `bindJsonLdObject`, and `buildItemListJsonLd` wraps them; planList then
  DROPS the handled jsonld children from visible stamping so per-row scripts don't ALSO emit (the
  no-double-emit contract — a test pins it). `bindJsonLdObject` returns the parsed object (null on
  invalid) so a bad row is skipped but valid rows still list; empty→no script (never an empty
  ItemList). Keep the ONE escaper (`escapeJsonForScript`) — buildItemListJsonLd escapes ONCE at the
  end, not per item. Render+storage (`listSource` stored verbatim, no field allowlist) done; the
  operator/AI TOGGLE to set `itemList:true` is a filed follow-up (ListSettings checkbox + AI tool).

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
- (2026-07-07) Image hygiene (`lib/render/image-hygiene.ts applyImageHygiene`) is a PURE post-pass
  wired into `tree.ts planPage` right AFTER `localizePlanLinks` (disjoint props, order irrelevant).
  The FIRST `<img>` in DOCUMENT ORDER is treated as the LCP candidate and deliberately NOT
  lazy-loaded — do NOT "fix" that to lazy-load everything (lazy on the above-fold hero image hurts
  LCP). Author-set `loading`/`decoding` always win (only ABSENT props filled). CLS `aspectRatio` is
  set ONLY when BOTH author width+height are known — it NEVER invents dimensions, because asset pixel
  sizes aren't stored (filed follow-up: capture at upload → then CLS covers gallery images). It won't
  clobber an existing aspect-ratio and leaves a non-object (string) `style` untouched (parse-html
  always emits object styles, but string-safe regardless). `style` is a React OBJECT with camelCase
  `aspectRatio` — correct for the createElement adapter (htmlPropsToReact passes style objects
  verbatim). Visitor-independent (reads only the built plan) → edge-cache-safe.
- (2026-07-07) Asset dims → render `<img>` CLS: dims are carried on the image URL as `?w=&h=`, baked
  in at PICK time by `withAssetDims(url,w,h)` (pure, `lib/render/asset.ts`) and read back at render by
  `readAssetDims(src)` — NO render-time D1 read (the caveats' hard constraint on the edge-cached/429
  path). `applyImageHygiene` uses the URL dims ONLY as a FALLBACK when author width/height props are
  absent (author props win). `withAssetDims` never stamps over a URL that already has a query (the
  `/media` route adds its own `?fmt=` variant param) — so if you ever add ANOTHER query to an asset
  URL, the dims won't be added and CLS silently regresses for that image; keep dims the FIRST query on
  the URL, or extend both helpers to merge params. Only the ImagePicker (Block-tab image props + SEO
  OG-image field) stamps dims today; images inserted by the AI or hand-typed `/media/…` URLs carry no
  `?w=&h=` and get the lazy/decoding win but no CLS box (acceptable — never invents dims). Assets
  uploaded before migration 0032 have NULL dims → plain URL, graceful.
- (2026-07-07) Asset pixel dims: `asset.width`/`asset.height` are NULLABLE INTEGER (migration 0032)
  — NULL for non-images, undecodable files, older uploads, AND every non-media-uploader putAsset
  caller (theme fonts / site-import / AI generate / component-asset upload all omit dims). Only the
  MEDIA GALLERY upload captures them: `readImageDimensions` (image-thumb.ts, createImageBitmap) client-
  side → `width`/`height` form fields → pure `parseAssetDimension` (asset.ts, the TRUST BOUNDARY:
  floors, clamps 1..MAX_ASSET_DIMENSION=100k, rejects garbage → null) → `putAsset`. Client dims are
  UNTRUSTED (never decode server-side — no native image codecs on Workers). The dims are NOT yet used
  at render: threading them into `<img>` props for applyImageHygiene's CLS aspect-ratio is a FILED
  TODO, and it must NOT add a per-request D1 read on the edge-cached/429-sensitive render hot path —
  the recommended path is to bake dims onto the block prop when the image PICKER inserts the asset
  (authoring-time), not a render-time lookup.
- (2026-07-07) Markdown page variants: served by the internal route `app/api/md/[...slug]/route.ts` (builds
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

- (2026-07-07) SEO audit (`lib/render/seo-audit.ts auditSeo`) is a PURE analyzer over RAW
  `page.blocks` prop values — it does NOT resolve referenced *component* trees (that needs the D1
  component resolver + next-intl, not a pure input). So links/images authored INSIDE a component's
  markup are NOT audited; only author-typed BLOCK props (Hero CTA href, image-block src/alt) are.
  This is deliberate scope, filed as a follow-up TODO — don't "fix" it by pulling the plan builder
  into the analyzer (breaks the dep-free `node --test` + it's the wrong layer). Store read is
  `listPagesForAudit()` (page-store, one query, blocks parsed). The report is READ-ONLY (no API
  route, no auto-fix) — each finding names page+locale for the operator to fix in page settings.
  Broken-link detection accepts a link if it matches a published path in ANY locale form
  (`/about` or `/fi/about`) OR sits under a wildcard `:param` page's static prefix (dynamic detail
  URLs are un-enumerable — never flag them). Image detection is prop-NAME-based
  (src/image/imageUrl/imageSrc/backgroundImage + looksLikeImage), so a custom image prop name
  authored by the AI would be missed — extend IMAGE_SRC_KEYS if a new convention appears.

- (2026-07-07) AI bulk-meta tools: `audit_meta` (read) + `set_page_meta` (write) in
  `lib/chat/meta-tools.ts` (pure schemas + `validateSetPageMeta` + `mergePageMeta`). GOTCHA that
  drove the design: in `upsertPageMeta`, `metaImage` is NOT preserve-when-absent — it ALWAYS writes
  `JSON.stringify(meta.metaImage)`. So any partial meta write (like this tool, which edits only
  title/desc) MUST carry the page's EXISTING metaImage forward or it blanks the OG image.
  `mergePageMeta` does exactly this (required `existing.metaImage`), AND omits
  noindex/localizedSlugs/cacheMaxAge (those ARE preserve-when-absent). Because a meta-only write can
  never move a URL / flip noindex, the LIGHT AI hook is correct (purge pageCacheTag +
  notifyIndexNowForPage, same as handleCreatePage) — no rename-301 / noindex pre-capture. If you ever
  add slug/parent/publish/noindex to this tool, you MUST add the REST route's rename+noindex
  pre-capture trio (see the AI write-path caveat). The tool addresses pages by SLUG (+optional
  parentSlug) via `listPages()` match — there is NO getPageBySlug store helper; add one if this
  match-scan ever shows up hot (it won't — it's an authoring-time path).
- (2026-07-07) auditSeo's `missingAlt` findings are NOT writable by the bulk-meta tool — alt text
  lives in block props / component markup, not the page-meta title/desc fields. Don't try to bolt alt
  onto set_page_meta; it'd need set_block_props (see the filed follow-up). audit_meta returns ONLY
  the `missingMeta` slice on purpose.

- (2026-07-07) Editable llms.txt template (`lib/render/llms-template.ts`): `LLMS_TEMPLATE_VARS` is
  the SINGLE source of truth for BOTH the runtime substitution allowlist AND the settings-UI side
  panel (each entry = slot + description + example). Add a new placeholder there and it's
  automatically substitutable, validatable, AND documented — don't maintain a second list. The
  syntax is the SHARED component `SLOT_RE` (imported from plan-tree.ts), so `{{slot}}` and
  `{{ t slot }}` both work — do NOT invent a parallel regex (USER REQUIREMENT). VALIDATION SPLIT:
  `unknownSlots(template)` names bad tokens but the ROUTE does NOT reject — it substitutes unknowns
  to "" (a template can't 500 the public /llms.txt). The on-save HARD reject (like the redirect
  admin, NOT the robots normalize-silently path) belongs to the settings UI/PUT (next task): call
  `unknownSlots` there, 400 with the names. Template is stored VERBATIM (getLlmsTemplate/
  setLlmsTemplate, key `llms_template`) — NOT JSON, it's free text. `{{pageTree}}` = the exact auto
  "## Pages" list via `buildLlmsPageList` (extracted from buildLlmsTxt); a blank stored template
  falls back to the full auto output. CACHING: still no-store (the caching task is separate) —
  don't add Cache-Control here; the dot-gate already edge-excludes /llms.txt.

- (2026-07-07) llms.txt settings UI: route `api/settings/llms` PUT HARD-rejects unknown `{{slot}}`
  tokens (`code:"unknownSlots"`, `slots:[names]`) via `unknownSlots` — DIFFERENT from the robots PUT
  (silent-normalize) and DIFFERENT from the /llms.txt RENDER route (substitutes unknowns to "", never
  500s the public file). Deliberate: the UI is the ONE place an operator sees & fixes a typo; the
  public route must never fail. Editor is `components/settings/llms-editor.tsx`; the right-side
  variables panel is DATA-DRIVEN off `LLMS_TEMPLATE_VARS` (add a slot there → auto-appears in the
  panel AND the substitution allowlist AND validation). The per-slot DESCRIPTION shown is an i18n key
  `llms.vars.<slot>` (NOT the pure module's English `description`) — keep BOTH in sync when you add a
  slot, or the panel throws a missing-message error. Click-to-insert uses uncontrolled
  selectionStart/End + requestAnimationFrame to restore the caret after the React state flush.
- (2026-07-07) BUILD-GATE BLOCKER (env, not code): `.env.local` here sets `CMS_DEV_SUPERADMIN=1` (dev
  auth backdoor). The prod-build guard FATALs page-data collection ("must never ship"), so
  `npx opennextjs-cloudflare build` / `npm run build` CANNOT complete in THIS local checkout — Next
  loads `.env.local` even when you `env -u` the var. The COMPILE + TypeScript stages run BEFORE the
  guard, so a green "✓ Compiled successfully / Finished TypeScript" + a clean `npx tsc --noEmit` +
  live dev verification is the achievable pre-commit bar here. Don't burn a run chasing the build gate.

- (2026-07-07) /llms.txt edge caching: `LLMS_CACHE_TAG="llms"` is the file's OWN tag (NOT
  `pages` — a per-page purge can't clear a global file, and blasting `pages` on every
  llms-only change would needlessly re-render every cached page). worker.ts opts /llms.txt
  back in via `llmsTxtCacheHeaders(pathname)` — a FIXED `pathname === "/llms.txt"` match placed
  BEFORE the general edge-cache gate. It is DELIBERATELY not a loosening of the dot gate: a
  top-level wildcard page can never match `/llms.txt`, so it can never get the llms tag stamped
  on it (the sitemap wildcard-cache-tag hole is sidestructurally). If you add MORE dotted-root
  cacheable files (e.g. a cached sitemap), give each its OWN carve-out fn + tag, never widen the
  dot gate. PURGE COVERAGE for LLMS_CACHE_TAG lives in 6 places — keep in sync when a NEW page-
  or brand-mutating path lands: (1) publish route, (2) api/pages persist (update/unpublish/
  rename), (3) api/pages DELETE, (4) settings/brand PUT (alongside PAGES_CACHE_TAG), (5)
  settings/llms PUT, (6) `purgeTagsForPageWrite` (the AI path — CREATE now returns
  [LLMS_CACHE_TAG] because a create ADDS a page to the index; it's no longer []). The route still
  emits `Cache-Control: no-store` as the PRE-RELEASE fallback (worker overwrites it once shipped)
  — leaving it means /llms.txt stays uncached until the worker.ts release, never stale-cached.

- (2026-07-07) `.md` variant caching is stamped IN the ROUTE (`api/md/[...slug]/route.ts` via pure
  `mdVariantCacheHeaders`), NOT worker.ts — because the worker REWRITES `/<path>.md`→/api/md and
  returns THAT response untouched (worker.ts line ~48, `return handler.fetch(...)` — it never
  reaches the header-stamping block below). So it's NOT release-gated (ships with the CMS deploy),
  UNLIKE /llms.txt's worker carve-out. Tag = the page's OWN `pageCacheTag(id)` (NOT `pages`, NOT a
  new tag): the existing publish/unpublish/rename/delete/noindex purges all already purge
  pageCacheTag(id), so the `.md` is covered with ZERO new purge sites — do NOT add a separate `.md`
  purge. Safe from the wildcard-tag hole because /api is in SKIP_SEGMENTS (isEdgeCacheCandidate
  rejects it), so worker.ts can never stamp a wildcard page's tag on an /api/md response. Only the
  200 body carries Cache-Control; 404s (unpublished/miss/noindex) stay uncached. If you ever move
  `.md` serving OFF /api, you reopen the wildcard-tag hole — keep it under /api.
- (2026-07-07) AI-inserted image dims: `list_assets` (formatAssetList) NOW stamps `?w=&h=` via
  withAssetDims when the D1 row carries width/height — so AI-authored pages get the CLS box for
  GALLERY-uploaded images (only those capture dims; migration 0032). `generate_image` still can't
  be stamped: its `handleGenerateImage`→`putAsset` omits width/height (no server-side decode — no
  native codecs on Workers), so generated images have NULL dims → plain URL, no CLS box. To fix that
  you'd need dims at generate time (the model/upstream doesn't return them reliably) or a client
  re-decode step — filed as its own concern, don't retro-fit a render-time D1 read (forbidden on the
  edge-cached/429 hot path). Keep dims the FIRST query on the URL (withAssetDims won't stamp a URL
  that already has one — the /media route adds `?fmt=`).

- (2026-07-07) RESPONSIVE IMAGES design (investigation): don't reach for Cloudflare Images
  upload-time variants OR zone Image Resizing (`/cdn-cgi/image/`). The `IMAGES` binding already
  wired for WebP transform-on-delivery (`getImages()` → `env.IMAGES`, media route
  `.input(body).output({format,quality})`) ALSO resizes via `.transform({ width, height, fit })`
  and runs on workers.dev (it's the Workers Images binding, NOT zone Image Resizing — the old
  "workers.dev can't resize" blocker is STALE). Chosen impl: `/media/[...key]?w=<n>` clamped to a
  FIXED width allowlist (pure `deliveryWidth`), `.transform({width})` before `.output`, fold `w`
  into `cacheKeyFor` so each (key,fmt,width) edge-caches distinctly, transform-failure falls back to
  original (mirror the WebP path). GOTCHA: the delivery-width `?w=` param spells the SAME as the
  INTRINSIC-DIMS carrier `?w=&h=` (withAssetDims/readAssetDims). A variant URL (`/media/k?w=640`)
  has NO `h`, so `readAssetDims` returns null for it (needs BOTH w+h) — but keep them reconciled in
  ONE `mediaVariantUrl(key,width)` helper so srcset builders never emit a URL that a future
  readAssetDims change could misread. R2 master untouched (export/import ships masters); billing =
  one Images op per uncached variant per PoP (same class as the WebP transcode already shipping).

- (2026-07-07) RESPONSIVE IMAGES impl 1/2 SHIPPED: `/media/[...key]?w=<n>` resizes via the IMAGES
  binding. `DELIVERY_WIDTHS=[320,640,960,1280,1920]` (asset.ts) is the CLOSED allowlist — `deliveryWidth`
  rounds a request UP to the smallest ≥ it, caps at 1920, null for absent/garbage (bounded variants so a
  scraper can't mint unbounded cache/Images-ops). `mediaVariantUrl(key,width)` is THE mint point for
  variant URLs — impl 2/2's srcset builder MUST use it, never hand-build `?w=` (it clamps + keeps the
  delivery `?w=` from colliding with the intrinsic-dims `?w=&h=` carrier: a variant URL has NO `h`, so
  `readAssetDims` returns null for it — by design). `cacheKeyFor(url,fmt,width)` folds the CLAMPED width
  (not raw px) so `?w=500` and `?w=600` share the `640` cache entry. Resize runs `.transform({width,
  fit:"scale-down"})` (never upscales past the master) BEFORE `.output`; resize-only (no WebP transcode)
  preserves the master format via `resizeOutputFormat(key)` (ImageOutputOptions.format is a CLOSED
  literal union — you can't pass a raw content-type string; map from the key ext, jpeg default). SVG/GIF
  `?w=` requests attempt-then-fall-back-to-original (harmless). Live transform is DEPLOY-ONLY (getImages
  returns null in dev → serves original) — HITL to verify.
- (2026-07-07) impl 2/2 (srcset/sizes) SEAM: mirror `applyImageHygiene` (image-hygiene.ts) — a PURE
  post-pass over the built plan, edge-cache-safe (reads only the plan, no request/D1). For an `/media/`
  `<img>` that carries `?w=&h=` intrinsic dims (readAssetDims), emit `srcset` from `mediaVariantUrl(key,
  W)` for each DELIVERY_WIDTHS entry ≤ the intrinsic width (skip upscales), plus a default `sizes`
  (e.g. `100vw`); AUTHOR-set srcset/sizes always win. The `key` for mediaVariantUrl = strip the
  `/media/` prefix AND the `?w=&h=` query off the img src (the src is the dims-carrier form; the
  variants are separate URLs). Keep it pure — no getImages/D1.

- (2026-07-07) RESPONSIVE IMAGES impl 2/2 SHIPPED (srcset/sizes): `srcsetFor(src,intrinsicWidth)` in
  image-hygiene.ts is the pure builder; `applyImageHygiene`→`hygieneProps` wires it. It fires ONLY when
  (a) the src resolves to a valid /media/ key (`mediaKeyFromSrc` — new in asset.ts, strips /media/ +
  ANY query then isValidAssetKey; external/hand-typed URLs get NO srcset) AND (b) the intrinsic width
  is known (author `width` prop OR the `?w=&h=` dims carrier via readAssetDims) AND (c) author
  `srcset`/`srcSet`/`sizes` are absent (author always wins). Candidates = DELIVERY_WIDTHS ≤ intrinsic
  (never advertises an upscale). Default `sizes:"100vw"` (over-fetches on narrow layouts, safe). So an
  image with NO stored dims (AI generate_image, hand-typed URL) gets the lazy/CLS win but NO srcset —
  same "never invents dims" contract as the CLS box. REACT CASING GOTCHA (bit me): React needs `srcSet`
  camelCase — plain `srcset` warns AND is dropped by the DOM. Fixed in ONE place: `react-props.ts`
  attrToReactName maps `srcset`→`srcSet` (it has no hyphen so the camelCase pass missed it). If you emit
  any other non-hyphen React-cased attr from a plan (rare), add it there too. Live resize is DEPLOY-ONLY
  (IMAGES binding null in dev) — the srcset URLs render, but the bytes resize only on a deployed site (HITL).

- (2026-07-07) Server-side image dims: `generate_image` runs ON THE WORKER — there is NO
  `createImageBitmap`/`Image`/canvas there, so the client-side `readImageDimensions` (image-thumb.ts,
  used by the media-library UPLOADER) can't be reused. To get dims for any bytes we produce/receive
  server-side, use pure `imageDimensionsFromBytes` (lib/media/image-dimensions.ts) — it parses the
  file HEADER only (PNG/JPEG/GIF/WebP), no decode, node-testable. Returns null for unknown/truncated →
  store null (same as before). Don't try to bring a decoder onto Workers for this.

- (2026-07-07) ItemList JSON-LD toggle (`listSource.itemList`) authoring: TWO write surfaces, both
  set `itemList:true`. (1) Builder — a checkbox in `binding-panels.tsx` ListSettings, wired the SAME
  way as `autoscroll`: field added to the `layout` carry object AND persisted in the `pres !==
  "combobox"` branch of `emitSource` (`if (l.itemList) src.itemList = true;`) — persisting outside
  that branch would leak it onto comboboxes (a combobox emits no page structured data). (2) AI —
  `bind_list` (NOT `create_list`): `itemList` is a config PATCH on an existing list; `handleBindList`
  applies it via `patch.itemList`, and `{...base,...patch}` means an explicit `false` OVERRIDES a
  prior stored `true` (so the AI/operator can turn it OFF). `validateBindList` only accepts a real
  boolean (a string "yes" is ignored, not coerced). The toggle only DOES anything when the list
  template is a jsonld-kind component — with a plain HTML template it's a harmless no-op (documented
  in the tool schema). Render was already proven by jsonld-itemlist.test.ts; this run only added the
  knob (+1 test in bind-list-combobox.test.ts). Builder checkbox UNVERIFIED live (HITL).

- (2026-07-07) The Preview canvas overlay (`preview-overlay.ts`) is PREVIEW-ONLY chrome — the parent
  reaches into the same-origin iframe DOM. Any block-management affordance the render plan can't carry
  (because public=preview must be byte-identical) belongs HERE, injected into the iframe DOM, NOT in
  `tree.ts`/`planPage`. Precedent: the invisible-block chip (jsonld) is injected at wire time into
  zero-area `data-block-wrap`s; cleanup removes it. Do NOT add builder-only markup to the render plan.

- (2026-07-07) /sitemap.xml edge caching: `SITEMAP_CACHE_TAG="sitemap"` is the file's OWN tag (NOT
  `pages`, NOT `llms`). worker.ts opts /sitemap.xml back in via `sitemapXmlCacheHeaders(pathname)` —
  a FIXED `pathname === "/sitemap.xml"` match, folded into the SAME dot-file block as /llms.txt
  (`llmsTxtCacheHeaders(p) ?? sitemapXmlCacheHeaders(p)`) BEFORE the general edge-cache gate. Each
  dotted-root file keeps its OWN carve-out fn + tag — the `??` chain does NOT widen the dot gate, so
  a top-level wildcard page can never match `/sitemap.xml` and get its tag stamped (the whole point
  of this task — /sitemap.xml did a per-request D1 read + risked the wildcard-cache-tag stale hole).
  PURGE COVERAGE for SITEMAP_CACHE_TAG is a SUBSET of the llms sites — ONLY the page-content ones:
  (1) publish route, (2) api/pages persist (update/unpublish/rename — both pathChanged branches),
  (3) api/pages DELETE, (4) `purgeTagsForPageWrite` (AI path — created+updated+translated). It is
  DELIBERATELY NOT purged by (a) settings/brand PUT or (b) settings/llms PUT — brand identity and the
  llms template are NOT sitemap content (the sitemap is just URL + lastmod). If you add a NEW
  page-mutating path, purge sitemap alongside llms; if it's brand/content-index only, do NOT. Pre-
  release the route stays uncached: sitemap.ts is `dynamic="force-dynamic"` (Next → no-store), and the
  worker header only lands once a release cuts worker.ts — never stale-cached before that (HITL).
  NOTE: page.noindex flip already purges via pageCacheTag(id)+SITEMAP path in api/pages PUT, so the
  sitemap-skip of noindexed pages busts correctly. Component/theme/brand publishes don't change the
  sitemap (URL/lastmod only) so their omission is correct, not a gap.

- (2026-07-07) On-demand AI guides follow ONE seam (get_data_sources_guide, now get_jsonld_guide):
  a PURE `*-guide.ts` module exporting `GET_*_GUIDE_TOOL` (zero-arg fn) + a `*_GUIDE` string
  constant, wired in FOUR places — tool-dispatch.ts (import + TOOL_SCHEMAS map entry + a constant
  handler `async () => ({ ok:true, guide: GUIDE })`), tool-scopes.ts KNOWN_TOOL_NAMES, the relevant
  context arrays in TOOLS_BY_CONTEXT, and a terse pointer sentence in each CONTEXT_PROMPTS entry so
  the model knows the guide exists. A `scripts/<name>-guide.test.mjs` locks it. GOTCHA writing the
  test: it regex-scans the guide for snake_case tokens and asserts each is a KNOWN_TOOL_NAME — so
  don't put an invented snake_case word in guide prose or the test fails (hyphenated words like
  `city-slug` are safe; they don't match `[a-z]+(_[a-z]+)+`). Editing CONTEXT_PROMPTS: the
  page-builder + pages prompts END with the IDENTICAL sentence "Prefer ONE wildcard page bound to a
  collection over N near-identical static pages." — you CANNOT uniquely Edit on that tail; anchor on
  each prompt's distinct data-sources-guide pointer clause instead.

- (2026-07-07) SEO audit DEEP component-tree scan: `auditSeo(pages, locales, componentSeo?)` now
  takes an OPTIONAL `ComponentSeoIndex` (Map<name,{hrefs,images,deps}>). Built by PURE
  `buildComponentSeoIndex(rows)` from `listComponents()` rows (each has a JSON `tree` + `kind`) — do
  NOT build the render plan for this (it pulls next-intl/React → breaks dep-free `node --test`; that's
  exactly why the OLD scan was block-props-only). A block referencing a component folds in that
  component's TRANSITIVE markup (nested PascalCase-tag refs, cycle-safe via a `seen` set) into the
  SAME checkHref/checkImage logic — so an inbound link authored inside a component also clears an
  orphan. `kind:"jsonld"` components + unparseable trees are SKIPPED (jsonld emits no visitor HTML).
  Component-tree images use the SAME heuristics as block props (imageSrc/imageAlt/looksLikeImage +
  any node tagged `<img>`), so a custom image-prop NAME inside a component would still be missed
  unless it's in IMAGE_SRC_KEYS — same extend-point as the block-prop scan. The AI `audit_meta` tool
  (tool-dispatch handleAuditMeta) DELIBERATELY does NOT pass the index — it only surfaces
  `missingMeta`, which the deep scan never touches; don't wire the index there.

- (2026-07-07) OG-image autogen DECISION: use the `browser` Worker binding + `@cloudflare/puppeteer`
  (NOT the Browser Rendering REST API). The binding is account-level like AI/IMAGES — no secret, no
  per-Site provision (deployer needs no override). REST would need an account API token as a per-Site
  Worker SECRET (OPENROUTER_API_KEY plumbing). BOTH need a PAID Workers plan (Free has no Browser
  Rendering) and share scarce session/concurrency limits + cold-start, so the publish-wiring MUST be
  best-effort + ctx.waitUntil (purge-edge/IndexNow pattern): at most one screenshot per publish per
  locale, ONLY when none exists (idempotent), never queue/retry on the request path. `@cloudflare/
  puppeteer` is NOT installed — arm it with `npm i @cloudflare/puppeteer` + add
  `"browser": { "binding": "BROWSER" }` to CMS/wrangler.jsonc (typegen after). Until then
  `screenshotPageToR2` returns `{ok:false,reason:"no-binding"}` and skips silently (incl. local dev).
- (2026-07-07) OG-image key scheme (`lib/render/og-image.ts`): auto screenshots live under the `og/`
  R2 prefix (`ogImageKey`→`og/<id>.<locale>.png`), a DISTINCT namespace from user uploads (`assets/…`)
  — that's the mechanism for "autogen stored separately, a manual upload always wins": the serving/
  precedence task (og-image fallback serving) reads a MANUAL per-locale metaImage first and only falls
  back to `og/<id>.<locale>.png`; the two keyspaces can never collide. `isOgImageKey` guards a future
  serve route against traversal (must be under /api or a fixed path — the catch-all shadows arbitrary
  page paths, see the routing caveat; do NOT add a dynamic top-level route for it). Both id+locale are
  sanitized ([a-z0-9_-], never empty). Dims 1200×630/png (OG large-card standard).
- (2026-07-07) The og-image SPIKE launches puppeteer via a NON-LITERAL dynamic import
  (`const spec="@cloudflare/puppeteer"; await import(spec)`) SPECIFICALLY so tsc + the OpenNext
  bundler don't statically require the optional, not-yet-installed dep — a literal
  `import("@cloudflare/puppeteer")` fails `tsc --noEmit` (TS2307) until it's installed. Keep it
  non-literal (or install the dep) if you edit that call. The spike screenshots the PUBLIC page URL
  over the network — needs a reachable origin (resolveSiteOrigin); the publish-wiring task passes the
  built absolute page URL. It's URL-driven (no coupling to the render pipeline).
- (2026-07-07) OG-image PRECEDENCE + serving: pure `resolveOgImageUrl` (og-image.ts) is the ONE
  place og:image precedence lives — manual per-locale metaImage ALWAYS wins → else auto
  `og/<id>.<locale>.png` if it exists → else undefined (no image). It's PURE: the caller decides
  `autoExists`. `generateMetadata` ((site)/[[...slug]]) probes R2 (`getStorage().get(ogImageKey(id,
  loc))`) for the auto image ONLY when there's no manual image — a manual-image page pays ZERO extra
  reads; a no-image page pays ONE R2 read. This read is on the METADATA path, NOT the 429 render hot
  path (same rationale as the brand/verification reads) — do NOT move it into the render/worker hot
  path. The auto image is served by `app/api/og/[...key]/route.ts` at `/api/og/<id>.<loc>.png`
  (minted by `ogImageUrl`/`OG_IMAGE_ROUTE_PREFIX`="/api/"): under /api because (a) the (site)
  catch-all shadows arbitrary top-level paths and (b) /api is a SKIP_SEGMENT so worker.ts can't stamp
  a wildcard page's cache-tag on it. The route is `isOgImageKey`-guarded (only `og/…` keys, never an
  arbitrary R2 object) and serves `max-age=3600` (NOT immutable — the key is fixed per page×locale so
  a regenerate overwrites in place; short TTL lets a refresh propagate). twitter:card auto-upgrades
  to summary_large_image because buildTwitterCard keys off the RESOLVED `image` (manual OR auto) — no
  social-cards.ts change was needed. NOTHING WRITES `og/` objects yet (the screenshotPageToR2 spike
  is unwired) — until the publish-wiring task lands, `autoExists` is always false on real sites, so
  precedence degrades to "manual metaImage or none" (correct, no-op). Live R2 = HITL.
- (2026-07-07) Naughty-robot rate limiting: worker.ts throttles PUBLIC PAGE GETs per-IP via the
  Workers rate-limit binding `PUBLIC_RATE_LIMITER` (`unsafe.bindings` in wrangler.jsonc,
  `simple:{limit:100,period:60}`, `namespace_id:"1001"`). The public-page gate is the PURE
  `isRateLimitCandidate` — it DELIBERATELY reuses the SAME SKIP_SEGMENTS + dotted-root(single-segment
  with ".") rule as `isEdgeCacheCandidate` (one source of truth for "what is a public page path"). So
  media/api/admin/preview/_next AND sitemap/robots/llms/favicon are exempt; only real page GETs are
  limited (authoring POST/PUT never throttled). Binding is account-level (like AI/IMAGES) — NO per-Site
  provision, deployer needs no override. worker.ts reads it via `(env as {PUBLIC_RATE_LIMITER?:RateLimit})`
  (NOT off CloudflareEnv, so no typegen dependency); ABSENT binding (local dev / pre-release worker) =
  no throttle. It's BEST-EFFORT: the whole check is in try/catch and FAILS OPEN (a limiter error never
  blocks serving). Key = `rateLimitKey(headers)` = CF-Connecting-IP (edge-set, unspoofable) → `"shared"`
  fallback (single global bucket, never null). The 429 carries `Retry-After:60` + `Cache-Control:no-store`
  (never edge-cache a throttle). VERIFIED-CRAWLER EXEMPTION `isVerifiedCrawler(request.cf)`: reads
  `cf.verifiedBotCategory` / `cf.botManagement.verifiedBot` — those are Bot-Management-gated (Enterprise
  add-on), so USUALLY ABSENT on Free/Pro/workers.dev → returns false → the IP limiter still applies.
  There is NO reliable FREE verified-bot cf flag today; reverse-DNS (googlebot.com PTR) is a per-request
  DNS round-trip — too heavy for this hot gate. Do NOT add reverse-DNS here without a cache. If you raise
  the cap, edit BOTH the wrangler `simple.limit` AND leave `RATE_LIMIT_RETRY_AFTER` (=period) in sync.
  RELEASE-GATED (worker.ts + wrangler.jsonc, r-*) — invisible on deployed Sites until a release is cut;
  live 429/Retry-After is HITL (deployed Site + paid plan for the binding). Per-site configurable
  threshold (backlog item 2/2) must read the D1 setting OFF the hot path (in-isolate cache w/ TTL — the
  edge-cache "extra D1 only on cache miss" precedent), never a per-request D1 read on this render gate.

- (2026-07-07) Per-URL-locale branded 404: `not-found.tsx` now renders in the VISITOR's URL locale.
  It CANNOT read params (Next gives none), so worker.ts injects the incoming pathname as request
  header `REQUEST_PATH_HEADER` (`x-bizbee-path`, edge-cache.ts) BEFORE the OpenNext handler, GET-only,
  via `headers.set` (OVERWRITE not append — a client header can't spoof the locale). not-found.tsx
  reads it via `next/headers` + `peelActiveLocaleFromPath(pathname)` (load-plan.ts — the path-string
  twin of `peelActiveLocale(params)`; blank/absent path → site default). This is the SANCTIONED
  exception to the (site) cache-poison guard BECAUSE a 404 is never edge-cached (worker gate
  GET-200-only). Header is RELEASE-GATED (worker.ts, r-*) — pre-release the header is absent and the
  404 degrades to the site default locale (the OLD behavior), so nothing breaks before a release.
  If you add ANOTHER not-found-style surface that needs the request path, reuse REQUEST_PATH_HEADER +
  peelActiveLocaleFromPath — don't invent a second header or read Accept-Language/cookie (that WOULD
  poison the cache on any surface that CAN be cached). The worker request-clone is cast
  `as typeof request` (clone drops the incoming-`cf` type; OpenNext reads only standard headers/url).

- (2026-07-07) OG-image PUBLISH WIRING: two funcs in `og-image-notify.ts` (the CF-coupled shell,
  OUT of the pure test harness — pure decision is `planOgScreenshots`/`ogImageKeysForLocales` in
  og-image.ts). `generateOgImagesForPage(id)` is called from the publish route POST (after IndexNow);
  `deleteOgImagesForPage(id)` from pages DELETE (before deletePage). Per-locale ABSOLUTE URLs come
  from `pagePathsByLocale` — the SAME machinery as sitemap.ts + indexnow's `pageUrlsAllLocales`, so
  the screenshot targets match the sitemap URLs exactly (a wildcard/unreconstructible page → byLocale
  undefined → no jobs, same as sitemap/IndexNow skip). Manual metaImage per-locale is read from the
  page row's `meta_image` JSON map (parseImageMap) — a locale with a manual image is NEVER autogen'd
  AND isn't even R2-probed. R2 existence check uses `storage.get(key)` (the Storage port has NO
  head/list — only put/get/delete), so a page-DELETE cleanup DERIVES the keys from the configured
  content locales, NOT a listing. Screenshots run SEQUENTIALLY (Browser Rendering concurrency is a
  scarce account resource — never parallelize the screenshot loop). Everything best-effort under
  `ctx.waitUntil` (mirrors indexnow-notify/purge-edge) — a missing origin/binding/R2 error NEVER
  fails or delays the publish/delete. NO-OP without the BROWSER binding: `screenshotPageToR2` returns
  no-binding (Free plan / local dev / pre-`npm i @cloudflare/puppeteer`), so on real Free/Pro sites
  the publish hook harmlessly finds no binding and writes nothing. If you add a THIRD write path that
  should autogen (e.g. an AI publish tool), call `generateOgImagesForPage` there too — but note the AI
  hooks are deliberately lighter (see the AI write-path caveat); OG autogen is a fine addition since
  it's best-effort. The REGENERATE BUTTON (item 4/4, next) must reuse `screenshotPageToR2` +
  `ogImageKey` but FORCE (skip the existing-key idempotency probe) — it's the explicit "refresh after
  redesign" path; expose a per-locale API action + a manual/auto badge in the SEO tab, EN/FI/ET.

- (2026-07-07) OG REGENERATE button (OG track item 4/4 — track CLOSED): `regenerateOgImageForPage(id,
  locale)` (og-image-notify.ts) is the SYNCHRONOUS twin of the publish hook — the operator is waiting,
  so it does NOT use `waitUntilOrInline`; it returns an `OgRegenerateResult` with a stable `code`. It
  DELIBERATELY skips the existing-key probe (unlike `generateOgImagesForPage`) — regenerate ALWAYS
  overwrites `og/<id>.<loc>.png` in place (same R2 key → no orphan). It REFUSES when a manual per-locale
  metaImage exists (`manualWins`) because an upload always wins in `resolveOgImageUrl`, so a screenshot
  would be dead bytes; the SEO-tab button is ALSO disabled when manual is set (belt+braces). Route
  `api/pages/[id]/og-image`: POST regenerates + purges `pageCacheTag(id)` on success (so
  generateMetadata reshoots the fallback via its autoExists probe); 503 for noBinding/noOrigin (this is
  a DEPLOY-ONLY feature — local dev has no BROWSER binding, so the button will 503 `ogErrNoBinding`
  here, which is CORRECT, not a bug), 400 otherwise. GET `?locale=` powers the manual/auto/none badge
  with ONE R2 probe (only when no manual) — mirrors the generateMetadata autoExists probe; keep the two
  in sync if the key scheme changes. i18n: OG_ERR_KEY in seo-form.tsx maps every server code → a
  `pageBuilder.ogErr*` key; `og-regenerate.test.mjs` FAILS if a code has no message in en/fi/et — add
  the key in ALL THREE files when you add a code. Live screenshot round-trip stays HITL (paid plan +
  `@cloudflare/puppeteer` + BROWSER binding + deployed R2).
- (2026-07-07) Per-site rate-limit THRESHOLD (rate-limit 2/2): the wrangler `unsafe.bindings`
  rate limiter is FIXED at deploy time (100/60s) — you CANNOT reprogram its period/limit at runtime.
  So the per-site D1 knob (`rate_limit_preset`, settings key) only does what a single fixed binding
  allows WITHOUT a second counter: `off` (worker skips `limiter.limit()` entirely), `normal`
  (binding as-is), `strict` (binding PLUS an in-isolate sliding counter at STRICT_LIMIT=40/60s per
  key). There is NO "relaxed/looser than 100" preset — the binding is the ceiling, you can only tune
  DOWN or OFF; a truly-lower cross-isolate cap would need a Durable Object / KV counter (not worth it
  for bot defence). The strict counter (`strictHits` Map, module scope in worker.ts,
  `strictCounterOverLimit` in rate-limit-config.ts) is PER-ISOLATE + resets on isolate recycle — a
  best-effort TIGHTENING on top of the real (cross-isolate) binding, NEVER the sole gate; don't rely
  on it as a hard limit. Pure config lives in `lib/render/rate-limit-config.ts` (normalize/
  usesBindingLimiter/strictCounterOverLimit), NOT edge-cache.ts.
- (2026-07-07) worker.ts reads the preset via `getRateLimitPresetCached(cfDb(env.DB))` — a 30s
  in-isolate TTL cache (`rateLimitPresetCache` module var in settings-store.ts), so a bot storming a
  site triggers AT MOST one D1 read per 30s per isolate (the edge-cache "extra D1 only on cache miss"
  precedent — NOT a per-request read on the render gate). `setRateLimitPreset` invalidates the cache
  in THIS isolate immediately; a write in ANOTHER isolate propagates within the TTL (a ≤30s stale
  window on the coarse bot knob is acceptable). `getRateLimitPresetCached` FAILS SAFE to `normal` on
  any D1 error and does NOT poison the cache. The D1 read is placed INSIDE the existing
  `isRateLimitCandidate && !isVerifiedCrawler` guard, so non-page/system/verified-crawler traffic
  never pays it. RELEASE-GATED (worker.ts, r-*) — the off-skip/strict behaviour is invisible on
  deployed Sites until a release cut; live 429 tuning is HITL (deployed Site + paid plan for the
  binding). If you raise the STRICT_LIMIT or the binding cap, keep RATE_LIMIT_RETRY_AFTER (=period)
  and the UI help text (messages.rateLimit.preset.*.help, ~100 / ~40) in sync.

- (2026-07-07) The impeccable design hook flags `broken-image` on ANY literal `<img>` substring —
  including one inside a tool DESCRIPTION/hint string (e.g. audit_alt's guidance mentions "<img> with
  no alt="). These are prose, not rendered markup → FALSE POSITIVES; leave them, don't add ignore
  comments (they don't suppress and pollute code). If a run ever needs it silenced permanently, that's
  a user-confirmed `/impeccable hooks ignore-file` — not a code edit.
- (2026-07-07) `audit_alt` is a no-arg READ tool paired with `set_block_props`/`update_component` as
  its writers (like audit_meta↔set_page_meta). It deep-scans via `buildComponentSeoIndex(listComponents())`
  so component-internal images ARE flagged — but the missingAlt finding only carries {slug, src}, NOT
  which fix path applies (block prop vs component markup). That's deliberate: the AI runs get_page /
  get_component to locate the image and picks the writer. The `pages` scope lacks update_component, so
  there the AI can only fix block-prop images (its guide line says component images need the builder).
