# Backlog — page-builder
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)
- DONE (2026-06-19): **8 CMS tests failed after the component-schema update — both buckets RE-VERIFIED as
  stale TESTS (not code regressions); fixed the tests.** Re-ran the full suite + read both test files,
  `src/db/schema.ts`, and `parsePropsSchema` before touching anything; pre-diagnosis CONFIRMED on both:
  • `scripts/component-store.test.mjs` (7 fails): `SQL logic error: table component has no column named
    source_kit`. The in-memory `COMPONENT_DDL` fixture omitted the `source_kit text` nullable col added by
    migration 0003 (`ALTER TABLE component ADD source_kit text`) + `schema.ts:48`. CODE correct, FIXTURE
    stale → added `source_kit text` after `props_schema` (matches the ALTER-appended position) + updated
    the DDL provenance comment to mention 0003.
  • `scripts/page-blocks.test.mjs` (1 fail): `parsePropsSchema` intentionally returns the full `PropField`
    (`required`/`translatable`/`label`/`description`/`options`/`defaultValue`), not the old narrow
    `{name,type,default}` — the `deepStrictEqual` was stale. Switched it to per-field `assert.equal`s on
    name/type/default + the new `required:false`/`translatable:false` defaults.
  Gate met: full CMS `node --test ...` GREEN (347/347, exit 0) + `npx tsc --noEmit` clean. Staged the two
  test files + goals/page-builder/* by explicit path (no cms-bundle/router/custom-domains, no `git add -A`).

## Tasks
- DONE (2026-06-19): **Make `bundle:cms` an automatic step in the PM deploy (USER DECISION 2026-06-19).** Today the
  CMS deploy bundle `ProjectManager/src/lib/deploy/cms-bundle.generated.js` is regenerated MANUALLY via
  `npm run bundle:cms`, so it goes stale whenever CMS render code changes (and page-builder workers keep
  deferring the regen per the cross-loop guardrail). Fix: chain the regen into PM `predeploy` so every
  deploy ships a fresh bundle. In `ProjectManager/package.json` change
  `"predeploy": "npm run preflight"` → `"predeploy": "npm run bundle:cms && npm run preflight"` (regen
  FIRST, then the existing preflight validates the fresh bundle). `npm run deploy` already triggers
  `predeploy` via npm lifecycle — no new script/dep. ALSO regen the bundle ONCE this run (it's currently
  owed-stale from the Section→Columns render change) and commit it, so deploy + tree are both clean.
  Gate: `npm run bundle:cms` succeeds + `npm run preflight` passes on the fresh bundle + a dry
  `npm run deploy`-up-to-predeploy is not required (preflight green is enough). Stage ProjectManager/
  package.json + cms-bundle.generated.js + goals/page-builder/* by explicit path.

> SECTION COLUMN MODEL (USER DECISION 2026-06-19): adopt the aicms Section→Columns→components model.
> A Section has `columns` (1–4) realized as `__section_column__` children; COMPONENTS drop into a COLUMN,
> not the Section. Reference: aicms `components/BlockRenderer.tsx` lines ~200–268 (exact prop + render shape)
> and `components/page_structure_diagram.tsx` (the settings UI). Section props (all on `block.props`,
> defaults in parens): `columns`(1), `columnBehavior`("equal"|"collapse"), `verticalAlign`("top"|center|bottom),
> `horizontalAlign`("left"|center|right), `paddingTop/Right/Bottom/Left`(0), `gap`(16),
> `maxWidth`("1280px"; options 960/1024/1152/1280/1440px + "full"), `backgroundColor`("transparent"; theme palette).
> NOTE: the current shipped Section is FLAT (`<div data-section>` nesting children directly). Slice 1 below
> migrates it to the column model; later slices build on that.

- DONE (2026-06-19): **Section column model — migrate Section to Section→Columns and render it (pure +
  renderer first).** `tree.ts`: new reserved `SECTION_COLUMN_COMPONENT = "__section_column__"`; `planPage`
  Section render is now the aicms CSS-grid (`<div data-section><section style="grid…">` → per-column
  `<div data-section-column>` flex cells), gridTemplateColumns from columns/columnBehavior (collapse →
  empty cols 0fr), gap(px), 4× padding (rem-default per-side `paddingXUnit`), maxWidth("full"→100%), bg.
  `page-blocks.ts`: `addSection` seeds `props.columns:1` + ONE `__section_column__` child; new pure
  `setSectionColumns(blocks,id,n)` (clamp 1–4; grow appends empty cols; shrink reflows removed cols'
  content into the last kept col), `addComponentToColumn(blocks,id,colIndex,name)`, `sectionColumns`,
  `isSectionColumn`; `addComponentToSection` kept as a shim → column 0 (click-insert still works);
  `validateBlocks` drops BOTH reserved names. page-blocks-sections.test.ts rewritten → 11/11 (grow/shrink
  reflow, collapse 0fr, grid output, unique ids). tsc + opennext build green. PM bundle:cms DEFERRED
  (cross-loop guardrail; render DID change, so the bundle is now STALE — regen owed, see NEXT.md).
- DONE (2026-06-19): **Right rail Block tab — Section settings panel (mirror aicms `page_structure_diagram.tsx`).**
  `SectionSettings` component in `page-builder-shell.tsx`: when the selected block is a Section the Block tab
  renders COLUMNS segmented 1/2/3/4 (→`setSectionColumns` via the merge helper), EMPTY COLS Equal/Collapse,
  3×3 ALIGN grid (verticalAlign×horizontalAlign), 4 PADDING inputs each with a rem/px unit toggle (rem
  default, writes `padding<Side>Unit`), GAP, MAX WIDTH select (960/1024/1152/1280/1440px/Full), BACKGROUND
  swatches from the THEME purpose tokens (`var(--color-*)`, transparent = checkerboard). New pure
  `mergeSectionProps(blocks,id,patch)` in `page-blocks.ts` (columns routes through `setSectionColumns`;
  `undefined` deletes a key; no-op for non-Section) + 3 node tests (14/14 in page-blocks-sections.test.ts).
  i18n `pageBuilder.section*` EN/FI/ET. Persists via the EXISTING block PUT (Save). tsc + opennext build
  green. PM `bundle:cms` DEFERRED (cross-loop guardrail; bundle already owed from the column-model run).
- DONE (2026-06-19): **DnD slice 1 — drag a "Section" from the LAYOUT rail into the Layers tree.** Native
  HTML5 DnD (no dep). Shared payload layer added to `page-builder-shell.tsx` (`DND_MIME`, `DragPayload`
  union, `setDragPayload`/`readDragPayload` — slices 2/3 reuse). Rail Section button now `draggable`
  (`{kind:"section"}`) + still click-to-add; Center Layers panel is the drop target (onDragOver
  preventDefault + blue indicator, onDrop → `onAddSection()` = APPEND; empty Layers = append). i18n
  `pageBuilder.dropSectionHint` EN/FI/ET. No tree logic touched (reused `addSection`) → no new test.
  tsc + opennext build green. PM `bundle:cms` DEFERRED (cross-loop guardrail; UI-only, no render change).
- DONE (2026-06-19): **DnD slice 2 — drag a component from the rail into a COLUMN drop-slot.** `LayersTree`
  in `page-builder-shell.tsx` now renders, under each Section, one drop slot PER column (`sectionColumns(b)`
  → "Column N" dashed cells); rail COMPONENT items are `draggable` with `{kind:"component",name}`. Each column
  is a drop target (onDragOver preventDefault + per-slot highlight keyed `${sectionId}:${colIndex}`, onDrop →
  `onDropComponentToColumn` = pure `addComponentToColumn(blocks,sectionId,colIndex,name)`, `stopPropagation`
  so it doesn't bubble to the Section-add root drop zone). Non-component payloads (a Section) are rejected in
  the column handler; a component dropped on the Layers ROOT hits the existing root onDrop which only acts on
  `section` payloads → rejected. Components stack within a column; empty column shows `dropComponentHint`.
  `addComponentToColumn`/`sectionColumns` already existed + tested (page-blocks-sections.test.ts 14/14) → no
  new tree logic, no new test. i18n `pageBuilder.column` + `dropComponentHint` EN/FI/ET. tsc + opennext build
  green. PM `bundle:cms` DEFERRED (cross-loop guardrail; UI-only, no render change this run).
- DONE (2026-06-19): **DnD slice 3 — reorder + cross-column move in the Layers tree (pure helper first).**
  Pure `moveNode(blocks, dragId, targetId, position)` (`before`/`after`/`into`) added to `page-blocks.ts`:
  finds the dragged node anywhere in the tree (`findNode`), removes it (`removeNode`), then inserts it as a
  sibling before/after the target (`insertSibling`, works at any depth) OR as the last child of a container
  target (`insertInto`, only Sections/columns accept). No-ops (return a structural `clone`) on self-drop,
  missing ids, `into` a leaf, or target-inside-dragged (descendant guard). Handles reorder-Sections,
  reorder-within-column, cross-column move, cross-section move. 6 node tests added → page-blocks-sections.test.ts
  19/19. THEN wired `LayersTree` (page-builder-shell.tsx): added `{kind:"move",id}` to the `DragPayload` union;
  Section + component node buttons are now `draggable` + drop targets via a shared `reorderProps(id)` helper
  (top-half=before / bottom-half=after via `edgeOf`, box-shadow edge indicator via `edgeClass`,
  `stopPropagation` so a move-drop doesn't bubble to the column/root); a `move` payload dropped on a COLUMN
  cell → `moveNode(id, col.id, "into")` (cross-column). Rail section/component drops unchanged (gated on
  `kind`). No new visible strings (edge highlight is CSS-only) → no i18n add. tsc + opennext build green. PM
  `bundle:cms` NOT owed (UI-only — `moveNode` yields the same Block shape, no render output change); bundle
  still owed from the column-model run per CAVEATS.

> COMPONENT PROPS SCHEMA (USER DECISION 2026-06-19): aicms-style per-component config — each prop has a
> field type + default + required/optional, overridable in the right-rail Block tab (screenshots:
> ImageCarousel/ArtworkGrid settings panels). bizbee ALREADY has the bones: `component.propsSchema` column
> (db/schema.ts), and `parsePropsSchema`/`validateBlockProps`/`setLocalizedProp` in `lib/pages/page-blocks.ts`
> — BUT the parser only understands `{type:"string"|"richtext", default}`. The 16 kit components
> (blog/landing/docs-kit.ts) already ship propsSchema, all `{type:"string"}`. Reference for the richer
> vocab: aicms `lib/widgets/props_schema.ts` (FieldType union) + `lib/widgets/builtin_schemas.ts` (real
> schemas) + the settings-form renderer in `components/page_structure_diagram.tsx`.

- DONE (2026-06-19): **Component props-schema FOUNDATION — richer field vocab + Block-tab settings form.**
  `parsePropsSchema` now returns `PropField[]` (string|richtext|number|boolean|select + required/translatable/
  label/description/options/defaultValue; unknown→string). `validateBlockProps` got a schema-aware overload
  (type coercion + required-prop retention) while keeping the legacy `Set` path for C3 block-editor. New PURE
  tree-walk `findBlock`/`mergeBlockProps` (nested components are selectable now). UI `ComponentSettings` in
  page-builder-shell.tsx renders one control per field; translatable text → per-content-locale inputs via
  `setLocalizedProp`; persists via the existing block PUT. New `GET /api/components/palette` ({name,propsSchema}).
  i18n `pageBuilder.componentNoProps` EN/FI/ET. tsc + opennext build green; page-blocks-schema.test.ts 9/9,
  sections 19/19. PM bundle:cms DEFERRED (cross-loop guardrail; still owed from the column-model run — render
  output unchanged this task). The 3 kit-upgrade TODOs below are now UNBLOCKED.
- ~~TODO~~: **Component props-schema FOUNDATION — richer field vocab + Block-tab settings form (BLOCKS the 3
  kit-upgrade tasks below).** Extend bizbee's existing schema path to the aicms field types and required/
  optional + default semantics, then render an editable settings form for the SELECTED component in the
  right-rail Block tab. Concretely:
  - `lib/pages/page-blocks.ts` `parsePropsSchema`: widen the descriptor type beyond `string|richtext` to
    `string | richtext | number | boolean | select` (carry `options` for select, `required?:boolean`,
    `default`, AND `translatable?:boolean` — see translatable bullet). Keep it PURE + degrade unknown types
    to string. Extend the existing unit test.
  - `validateBlockProps`: enforce TYPES on save (number coerces/drops non-numeric, boolean → bool, select
    must be one of `options`) and keep REQUIRED props (don't drop a required prop to ""); leave per-locale
    string handling (`setLocalizedProp`) intact. Test the new coercion + required cases.
  - **TRANSLATABLE props (USER REQUIREMENT 2026-06-19):** the schema declares which props are translatable
    (`translatable: true`, only meaningful for string/richtext). bizbee ALREADY has the per-locale machinery
    — `setLocalizedProp`/`localeFieldValue` store a prop as `{en,fi,et}`, the shell already receives
    `contentLocales` (from `getContentLocales()`, same source the SEO form uses). So: a TRANSLATABLE
    string/richtext field renders ONE input PER content locale (like the SEO form's per-locale rows),
    each writing via `setLocalizedProp(props,key,locale,value,defaultLocale)`; a NON-translatable field
    renders a single input. number/boolean/select are never translatable. Test that a translatable prop
    round-trips per-locale and a non-translatable one stays a bare value.
  - Block tab UI (right rail in `page-builder-shell.tsx`): when a non-Section component is selected, render
    one input per schema field — text/textarea(richtext)/number/checkbox/select; translatable string/richtext
    fields render the per-content-locale input set (above), pre-filled via `localeFieldValue`; others
    pre-filled from `block.props` (falling back to `default`). Label by `label`/`description`, mark required
    fields; persist via the EXISTING block PUT. Mirror the screenshot panels (the EN/FI/ET tabs are the
    per-locale set). Localize the FORM CHROME EN/FI/ET (field labels come from the schema). NOTE: the "AI
    Translate" button in the aicms screenshot is OUT OF SCOPE here — separate later task.
  Gate: CMS tsc + opennext build green; regen PM cms-bundle. This is the shared backend+frontend support
  the per-kit tasks below depend on.
- DONE (2026-06-19): **Upgrade BLOG kit component schemas to the richer vocab** (`lib/components/blog-kit.ts`).
  Enriched every component's `propsSchema` descriptors (kept bizbee's object-keyed shape): added
  `required:true` + `translatable:true` + `label` to each human-readable text prop (BlogPostHeader
  title[req]/date/author, BlogPostBody body[richtext,req], AuthorCard name[req]/bio, PostListItem
  title[req]/date/excerpt, PostList heading[req]), and left structural props non-translatable
  (PostListItem.href = URL → no translatable). NO number/boolean/select added: the kit markup only binds
  text slots — PostList renders only `{{heading}}` (sample rows are static), so an invented limit=number /
  layout=select would be editor metadata that binds to nothing (markup UNCHANGED per spec). Markup/behavior
  untouched. Extended `scripts/blog-kit.test.mjs` (+1 test) asserting every prop parses via `parsePropsSchema`
  to a known field type, title=required+translatable, href NOT translatable, body=richtext+translatable →
  6/6 green. tsc + opennext build green. PM bundle:cms NOT owed (propsSchema is editor metadata, no render
  output change) — bundle still stale from the column-model render run per CAVEATS.
- DONE (2026-06-19): **Upgrade LANDING kit component schemas to the richer vocab** (`lib/components/landing-kit.ts`:
  Hero, FeatureGrid, CTABand, Testimonial, SiteFooter). Enriched every text-prop descriptor with
  `translatable:true` + `label` + `required:true` on each component's primary text; `ctaHref` (Hero/CTABand)
  is a URL → label only, NON-translatable. NO number/boolean/select added (kit markup binds only `{{slot}}`
  text — a config field would be dead metadata; markup UNCHANGED per spec). Extended
  `scripts/landing-kit.test.mjs` (+1 test, 6/6) asserting field-type vocab + Hero.headline req+translatable,
  Hero.ctaHref NOT translatable, FeatureGrid.feature1Title + SiteFooter.tagline req+translatable. tsc +
  opennext build green. PM bundle NOT owed (editor metadata, no render change).
- DONE (2026-06-19): **Upgrade DOCS kit component schemas to the richer vocab** (`lib/components/docs-kit.ts`:
  DocsHeader, Callout, CodeBlock, StepList, ApiParam — only 5 components, the "6th" in the hint didn't exist).
  Enriched each propsSchema descriptor (kept bizbee's object-keyed shape): `required:true`+`translatable:true`+
  `label` on each human-readable text prop (DocsHeader title[req]/lead, Callout label[req]/body[req], StepList
  heading[req]+step{1,2,3}Title[req]/Body, ApiParam description[req]). NON-translatable (code/identifiers, not
  prose): CodeBlock filename[req]/code[richtext,req], ApiParam name[req]/paramType[req]. NO number/boolean/select
  added: the markup binds only `{{slot}}` text — there is no `{{variant}}`/`{{required}}` slot, so a Callout
  select / ApiParam boolean would be dead editor metadata (CAVEATS). Markup UNCHANGED. Extended
  `scripts/docs-kit.test.mjs` (+1 test) asserting every prop parses to a known field type, title=req+translatable,
  callout body translatable, code=richtext+NOT translatable, ApiParam name/paramType NOT translatable,
  description translatable → 6/6 green. tsc + opennext build green. PM bundle:cms NOT owed (editor metadata,
  no render change) — bundle still stale from the column-model render run per CAVEATS.
- DONE (2026-06-19): **Make Save PERSIST — register reserved Section as a renderer primitive.**
  `SECTION_COMPONENT` now lives in `lib/render/tree.ts` (single source); `validateBlocks` deletes it
  from `componentNames` so the block PUT route's `missingComponents` no longer 409s on a page with
  Sections; `planPage` renders a Section block as a `<div data-section=...>` nesting its `children`.
  6/6 tests pass (`page-blocks-sections.test.ts`). NOTE: PM `npm run bundle:cms` regen deferred — the
  generated bundle file was being edited concurrently by another goal loop.

- DONE: **Wire page select + create into the builder's page picker (reuse existing CMS page CRUD).**
  Make the top-bar page picker actually load the Site's pages and let the operator pick one OR create a
  new page — reusing the EXISTING C2 page CRUD, not a new one. What already exists in `CMS/`:
  `GET/POST/PUT/DELETE /api/pages` (+ `/api/pages/[id]`), `db/page-store.ts`
  (`listPages`/`getPageById`/`upsertPageMeta`/`deletePage`), `lib/pages/page-meta.ts`
  (`validatePageMeta`/`isValidSlug`), and the `components/pages/pages-manager.tsx` UI.
  Scope this slice:
  - Page picker fetches `GET /api/pages` and lists them (slug + publish status); selecting one sets the
    builder's "selected page" (id + slug) — which the Layers/Preview/right-rail panels key off.
  - A "create new page" action in the picker → `POST /api/pages` (slug + title + parent, via the existing
    `upsertPageMeta` path / validate with `isValidSlug`), then auto-selects the new page.
  - Reuse the existing validation + REST; do NOT duplicate page-store logic. Keep it CF-native (REST +
    fetch, no server actions — see main CAVEATS) and localized EN/FI/ET.
  Out of scope here: block editing, live preview, page/SEO settings forms (later slices). Depends on the
  layout task below (the picker shell must exist first). Gate: CMS tsc + opennextjs build green; regen PM
  cms-bundle. Add/extend a pure test for any new picker helper (e.g. tree→dropdown flattening).

- DONE: **GAP-closer for the Components rail: tag components with their source kit + grouped listing
  endpoint.** First slice of the Components-rail task below — close the data GAP so the rail can group.
  Add a `sourceKit` column to the `component` table (drizzle migration), thread the kit id through the
  kit-install write path so installed kit components are tagged with their kit id, and expose
  `GET /api/components/grouped` (kits-with-their-components + an "ungrouped/individually-imported" group)
  backed by a PURE grouping helper (with a node test). The rail-UI rendering (groups, search, insert into
  section) stays in the task below. Reuse `upsertImportedComponent` + the kit registry — no second pipeline.

- DONE (render+search + insert both DONE 2026-06-19): **Components rail: show
  imported starter kits + their components, searchable, add into Sections (like aicms).**
  Make the builder's left Components rail the real component source, mirroring how aicms
  composes (`src/modules/page-builder/components/page-builder-v2/left_rail_components.tsx`): the operator
  adds **Sections**, and into a Section drops **components**. What this slice covers:
  - Render the Site's **starter kits** as expandable groups, each expanding to its components; plus a
    flat list / group of any individually-imported components. **Search components by name** (filter box).
  - Adding a component (drag or click) inserts it into the selected Section on the canvas; "Section" is a
    LAYOUT primitive that holds components (same model as aicms).
  - **GAP to close first:** today components are stored FLAT (`db/component-store.ts` `listComponents` has
    no `kit` field) and kits are 3 STATIC predefined kits (`GET /api/components/kit` → blog/landing/docs)
    that copy components in on install — there is NO per-Site record of "which kits are imported" or which
    component came from which kit. So this task must add kit↔component grouping: either tag imported
    components with their source kit id (extend `upsertImportedComponent` + a `kit` column/field, drizzle
    migration) OR expose an endpoint that returns installed kits grouped with their component names. Reuse
    the existing import gate (`parsePortableComponent`) + kit registry; do NOT fork a second component
    pipeline. The existing import/export of components (`/api/components`, `lib/components/portable.ts`)
    and kit install (`/api/components/kit`) stay as the way kits/components ENTER the Site — this task is
    about SURFACING them in the builder, grouped, and inserting them into sections.
  CF-native (REST + fetch), EN/FI/ET. Depends on the LAYOUT task (rail shell) and benefits from the
  page-select task (a selected page to insert into). Add pure tests for any grouping/flatten helper +
  search filter. Gate: CMS tsc + opennextjs build green; regen PM cms-bundle.
  STATUS: render + search DONE (rail-filter.ts/.test.ts, ComponentsRail in page-builder-shell.tsx). The
  remaining INSERT half is the task right below.

- DONE (2026-06-19): **Insert components into Sections — page block-tree store + drag/click insert.** The rail now
  renders kit groups + searchable component names, but the items are INERT (clicking a component does
  nothing — `ComponentsRail` in `page-builder-shell.tsx` has the `<li>`s draggable-styled only). This
  slice adds the editor's block tree: the selected page holds **Sections**, each Section holds
  **components** (aicms `page-builder-v2` section model). Make a "Section" added from the LAYOUT category,
  and a rail component click/drag insert into the SELECTED Section. Persist via the existing C2/C3 block
  REST — do NOT fork a new block pipeline. Add a pure tree-mutation helper + test (add-section,
  add-component-to-section, mirroring `page-picker`/`grouped` test style — relative `.ts` imports, node
  can't resolve `@/`). This is ALSO the prerequisite for the Center Layers tree (it renders the same tree).
  Gate: CMS tsc + opennext build green; regen PM cms-bundle. EN/FI/ET.

- DONE (2026-06-19): **Center: Layers ⟷ Preview toggle.** BOTH halves done — Layers tree done earlier;
  the **Preview** half is DONE this run. New `app/preview/[id]/page.tsx` renders ANY page by id (no
  publish gate, admin-guarded via `checkAdminFromHeaders` → 404 if not authed) through the SAME pipeline
  as the public route (shared `lib/render/render-page.tsx` `buildPlanFromPage` + `RenderedPage`, NOT a
  forked renderer). Shell iframe `src=/preview/<id>` honors viewport widths; refresh + post-Save reload
  via `previewNonce`. Test `collect-component-names.test.ts` 4/4. (Original text below.)
- WAS-TODO: **Center: Layers ⟷ Preview toggle — layers tree of sections+components, and a true-to-site
  preview.** Wire the center column's Layers/Preview tab (shell from the LAYOUT task) to real content,
  mirroring aicms `center_canvas.tsx` (both panels mounted, toggled by CSS so the iframe stays alive).
  - **Layers:** render the selected page's structure as a tree — all **Sections** and, nested under each,
    the **components** in that section (same model as the components-rail task / aicms `LeftRailLayers` +
    `page_structure_diagram`). Selecting a node sets the builder's selected block (drives the right rail);
    later slices add reorder/visibility — this slice is the tree + selection.
  - **Preview:** show the page rendered EXACTLY as the live website would — i.e. load the REAL public
    render route in an iframe (aicms points the iframe at the actual public URL, so it's pixel-identical
    because it IS the real renderer), honoring the viewport widths (desktop 100% / tablet 768px /
    mobile 375px) + a URL bar + refresh.
  - **GAP to close:** the bizbeecms public route `CMS/src/app/[[...slug]]/page.tsx` returns nothing unless
    `publishStatus === "published"` (line ~61), so an iframe of the real URL would be BLANK for the draft
    page being built. Add a preview/draft path so the builder can render an unpublished page exactly like
    production WITHOUT publishing it (e.g. a `?preview=<token>`/draft-allowed param the public route honors
    for an authed admin, or a dedicated `/preview/<id>` route that reuses the SAME render pipeline — do NOT
    fork a second renderer; true-to-site means reusing the real one).
  CF-native (REST + fetch), EN/FI/ET. Depends on the LAYOUT + page-select tasks. Add a pure test for any
  tree-build/flatten helper. Gate: CMS tsc + opennextjs build green; regen PM cms-bundle.

- DONE (2026-06-19): **Right rail: page SEO settings form (reuse existing per-locale page SEO).**
  SEO tab now renders a real `SeoForm` per selected page: one meta title + meta description per
  CONTENT locale (server page resolves `getContentLocales()`, passed as `contentLocales` prop;
  default-locale fallback offline), pre-filled from the loaded `PageSummary`, Save PUTs the full meta
  back through the EXISTING `/api/pages` (id+slug+parent+publish+meta — `validatePageMeta` re-runs;
  slug/parent/publish kept as-is, SEO-only edit). Two new PURE helpers in `page-meta.ts`
  (`setLocaleValue`, `buildSeoMetaBody`) + `page-meta.test.ts` 3/3; C2 pages-manager now reuses
  `setLocaleValue` (deduped its private copy). i18n `seoMetaTitle/seoMetaDescription/seoSave/seoSaved`
  EN/FI/ET. NOTE: PM `bundle:cms` regen DEFERRED (cross-loop guardrail forbids touching the bundle).
  Original spec below.
- WAS-TODO: **Right rail: page SEO settings form (reuse existing per-locale page SEO).** Fill the right
  rail's **SEO** tab (shell exists from the LAYOUT task) with a real form that edits the SELECTED page's
  SEO and saves it. Reuse what C2 already stores — do NOT invent new SEO fields/storage:
  - Fields: per-locale `metaTitle` + `metaDescription` (JSON maps on the `page` row, `db/schema.ts`
    `meta_title`/`meta_description`), validated by `lib/pages/page-meta.ts` `validatePageMeta`. The same
    pair is edited today in `components/pages/pages-manager.tsx` (the C2 SEO legend) and persisted via
    `PUT /api/pages/[id]`.
  - In the builder: when a page is selected, the SEO tab shows a per-content-locale title + description
    editor (locales come from the content-locale settings, like C2), pre-filled from the loaded page, and
    Save `PUT`s the full page meta back through the EXISTING route — no new page-store/validation path.
  - CF-native (REST + fetch); localize the field LABELS EN/FI/ET (the VALUES are per-content-locale
    content). Depends on the page-select task (needs a selected page) + the LAYOUT task (tab shell).
  - Richer SEO (canonical, OG image, noindex) is a SEPARATE later task + schema add — this slice is
    title + description, matching what exists. Gate: CMS tsc + opennextjs build green; regen PM cms-bundle.

- DONE: **Build the page-builder LAYOUT (shell only — no features).** Implement the static layout from
  `docs/page-builder-layout.md` in the CMS admin (e.g. `/admin/page-builder`), modeled on aicms
  `src/modules/page-builder/components/page-builder-v2/`. Deliver the **top bar + 3-column** shell:
  - **Top bar:** page-picker dropdown (lists pages, includes a "create new page" affordance) +
    viewport selector (Desktop / Tablet / Mobile, segmented) + undo/redo buttons + **Preview** button
    (opens the public site in a NEW tab) + **Save** button.
  - **Left rail (~260px):** Components panel — "Components" header, search input, LAYOUT + COMPONENTS
    category labels, a list of draggable component items (static placeholder list is fine this slice).
  - **Center (flex):** a **Layers | Preview** tab toggle. Layers = placeholder for the page block tree;
    Preview = responsive frame area honoring the viewport widths (desktop 100% / tablet 768px /
    mobile 375px). Show the empty state ("Select a page from the top bar to start editing").
  - **Right rail (~320px):** **Block | Page | SEO** tabs — Block = selected-block settings (empty
    state "Select a block in the Layers panel to edit its properties."), Page = page (technical)
    settings, SEO = SEO settings. Static panels this slice.
  LAYOUT ONLY: no real page loading, no drag-to-insert, no reorder, no live preview wiring, no settings
  logic — just the regions, tabs, empty states, and responsive frame sizing. Use this project's design
  system (purpose tokens, `src/components/ui`) and localize labels EN/FI/ET. Gate: CMS tsc +
  `opennextjs-cloudflare build` green; regen PM cms-bundle.
