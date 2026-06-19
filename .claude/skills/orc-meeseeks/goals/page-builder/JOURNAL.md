# Journal — page-builder
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-06-19 16:24 — Page-builder LAYOUT shell (shell only, no features)
- **Status:** DONE
- **What I did:** Built the static top-bar + 3-column page-builder shell at `/admin/page-builder`,
  per `docs/page-builder-layout.md` / aicms `page-builder-v2`. Top bar: disabled page-selector +
  New page, viewport segmented control (Desktop/Tablet/Mobile, wired to local state → preview frame
  width), undo/redo, Preview, Save. Left rail: Components header + search + LAYOUT (Section) /
  COMPONENTS categories with empty state. Center: Layers⟷Preview tab toggle (both panels mounted,
  toggled via `hidden` so a future iframe stays alive), preview has URL bar + refresh + responsive
  frame (desktop 100% / tablet 768px / mobile 375px), empty states. Right rail: Block/Page/SEO tabs
  with empty states. Added nav link + icon ("pageBuilder") to sidebar + ADMIN_SECTIONS. Added full
  `pageBuilder` + `adminNav.pageBuilder`/`desc.pageBuilder` i18n in EN/FI/ET.
- **Verified:** CMS `npx tsc --noEmit` clean; `npx opennextjs-cloudflare build` green; regenerated
  PM `bundle:cms` (cms-bundle.generated.js, 6438 KB). All 3 message JSONs parse. Did NOT render in a
  browser (no live D1 binding offline; shell is static so build-green is sufficient for this slice).
- **Files:** CMS/src/app/admin/page-builder/page.tsx, CMS/src/components/page-builder/page-builder-shell.tsx,
  CMS/src/components/admin-sidebar.tsx, CMS/src/components/admin-sections.ts,
  CMS/messages/{en,fi,et}.json, ProjectManager/src/lib/deploy/cms-bundle.generated.js.

## 2026-06-19 16:29 — Wire page select + create into the top-bar picker
- **Status:** DONE
- **What I did:** Made the top-bar page picker real. New pure helper
  `lib/pages/page-picker.ts` (`flattenPagesForPicker` → sorted `PageOption[]` with
  `/parent/slug` path + published flag, `topLevelParents`, `pagePath`) + a node test.
  Shell now `useEffect`-fetches `GET /api/pages`, renders a real `<select>` of pages
  (path label + draft marker), lifts `selected` (id/slug/path) state, and a `<PagePicker>`
  with an inline "New page" form that POSTs `{slug,parentSlug,publishStatus:"draft"}` to
  `/api/pages` (reusing C2 validation/store — no new page-store logic), then refetches +
  auto-selects the created page. Center Layers title/empty-state + preview URL bar now
  reflect the selected page's path. Added `pageBuilder.layersEmpty` + `pageBuilder.create.*`
  i18n in EN/FI/ET.
- **Verified:** CMS `npx tsc --noEmit` clean; `node --test page-picker.test.ts` 3/3 pass;
  3 message JSONs parse; `npx opennextjs-cloudflare build` green (dev stopped); regenerated
  PM `bundle:cms` (cms-bundle.generated.js, 6443 KB). Did NOT click through in a browser
  (no live D1 binding offline) — REST contract is the existing C2 one, build-green + the
  pure-helper test cover this slice.
- **Files:** CMS/src/lib/pages/page-picker.ts (+ .test.ts),
  CMS/src/components/page-builder/page-builder-shell.tsx, CMS/messages/{en,fi,et}.json,
  ProjectManager/src/lib/deploy/cms-bundle.generated.js.

## 2026-06-19 16:34 — GAP-closer: tag components with source kit + grouped listing endpoint
- **Status:** DONE
- **What I did:** Closed the kit↔component data GAP so the Components rail can group. Added a
  `sourceKit text` column to the `component` table (drizzle migration `0003_worthless_fallen_one.sql`,
  `ALTER TABLE component ADD source_kit text`). Threaded the kit id through the write path:
  `upsertImportedComponent(c, injectedDb?, sourceKit=null)` now persists `sourceKit`, and the
  kit-install loop (`/api/components/kit` POST) tags each installed component with its kit id
  (`upsertImportedComponent(c, undefined, id)`). Manual imports / AI-authored stay NULL. Added
  `listComponentsWithKit()` (name + sourceKit) to component-store. New PURE helper
  `lib/components/grouped.ts` (`groupComponentsByKit(components, kitOrder)` → ordered kit groups +
  trailing null "individually-imported" group; known kits always present even at 0 components; stale
  tags surface, never dropped) with a 4-case node test. New `GET /api/components/grouped` endpoint
  (requireAdmin) feeds the store rows + the SAME kit-id registry (blog/landing/docs) into the helper.
- **Verified:** `node --test grouped.test.ts` 4/4 pass; CMS `npx tsc --noEmit` clean;
  `npx opennextjs-cloudflare build` green (dev stopped, port 3601 free); regenerated PM
  `bundle:cms` (cms-bundle.generated.js, 6475 KB worker source). Migration SQL inspected (single
  additive ALTER, nullable → safe on existing rows). Did NOT run the live D1 write/read (no binding
  offline, HITL) — build-green + the pure helper test cover this slice.
- **Files:** CMS/src/db/schema.ts, CMS/src/db/component-store.ts,
  CMS/src/app/api/components/kit/route.ts, CMS/src/app/api/components/grouped/route.ts (new),
  CMS/src/lib/components/grouped.ts (+ .test.ts, new), CMS/migrations/0003_worthless_fallen_one.sql
  (+ meta), ProjectManager/src/lib/deploy/cms-bundle.generated.js.

## 2026-06-19 13:38 — Components rail UI: grouped kits + searchable (render half)
- **Status:** DONE (render + search; insert-into-Section split into its own backlog task)
- **What I did:** Wired the left Components rail to the real grouped data. Shell now
  `useEffect`-fetches `GET /api/components/grouped` alongside `/api/pages`, into a new
  `groups` state. Replaced the static rail with a `ComponentsRail` sub-component: keeps the
  LAYOUT category (Section) on top, then renders each kit group (blog/landing/docs +
  trailing "individually-imported") as an expandable header (collapse state local, keyed by
  label) listing its component names. The search box is now LIVE (was `disabled`) and filters
  component names across all groups via a new PURE helper `lib/components/rail-filter.ts`
  (`filterGroups` — case-insensitive substring, drops empty groups, empty query passthrough)
  with a 5-case node test. Added i18n `pageBuilder.kit.{blog,landing,docs}`, `kitIndividual`,
  `componentsNoMatch` in EN/FI/ET. Component `<li>`s are draggable-STYLED but INERT — actual
  insert-into-Section needs the page block-tree store, split into a new backlog task.
- **Verified:** `node --test rail-filter.test.ts` 5/5 pass; CMS `npx tsc --noEmit` clean;
  3 message JSONs parse; `npx opennextjs-cloudflare build` green (dev stopped, port 3601 free);
  regenerated PM `bundle:cms` (cms-bundle.generated.js, 6477 KB). Did NOT click through live
  (no D1 binding offline, HITL) — REST contract is the existing grouped endpoint, build-green +
  pure-helper test cover this slice.
- **Files:** CMS/src/lib/components/rail-filter.ts (+ .test.ts, new),
  CMS/src/components/page-builder/page-builder-shell.tsx, CMS/messages/{en,fi,et}.json,
  ProjectManager/src/lib/deploy/cms-bundle.generated.js.

## 2026-06-19 16:54 — Insert components into Sections (block-tree store + click insert)
- **Status:** DONE
- **What I did:** Added section-aware tree mutations to `lib/pages/page-blocks.ts`
  (`SECTION_COMPONENT="Section"`, `isSection`, `addSection`, `addComponentToSection`,
  `targetSectionId` — all PURE/immutable, ids unique across the WHOLE tree via
  `uniqueIdAcrossTree`). A Section = a top-level `Block` with `component:"Section"`
  whose dropped components live in `children` (reuses the existing `Block` shape +
  C3 block REST — no new pipeline). Wired the shell (`page-builder-shell.tsx`):
  selecting a page now GETs `/api/pages/[id]/blocks`; clicking the LAYOUT "Section"
  calls `addSection`; clicking a rail component inserts into the selected (or last)
  Section via `targetSectionId`+`addComponentToSection`, with an "add a Section first"
  hint when none exists. Save button enabled (PUT `/api/pages/[id]/blocks`, dirty
  tracking). Center Layers panel now renders the real tree (new `LayersTree`:
  sections → nested component blocks, click-to-select sets `selectedBlockId`).
- **Verified:** CMS `npx tsc --noEmit` clean; `node --test page-blocks-sections.test.ts`
  4/4 pass; `npx opennextjs-cloudflare build` green (port 3601 free, dev stopped);
  PM `npm run bundle:cms` regenerated cms-bundle.generated.js. Could NOT click-test
  in a live CMS (needs a deployed Worker + D1 binding — HITL).
- **Files:** CMS/src/lib/pages/page-blocks.ts, CMS/src/lib/pages/page-blocks-sections.test.ts,
  CMS/src/components/page-builder/page-builder-shell.tsx,
  CMS/messages/{en,fi,et}.json, ProjectManager/src/lib/deploy/cms-bundle.generated.js

## 2026-06-19 17:16 — Center Preview: draft-preview route reusing the real renderer
- **Status:** DONE
- **What I did:** Wired the builder's Preview iframe to a true-to-site draft preview.
  Extracted the shared render core into `lib/render/render-page.tsx` — `buildPlanFromPage(pageRow)`
  (page row → {plan, locale}, the identical block→plan walk) + `RenderedPage({plan})` (the shared
  utility-CSS + theme + tree + client-scripts JSX). The public route `[[...slug]]/page.tsx` now calls
  both (no behavior change — just deduped). New route `app/preview/[id]/page.tsx` loads ANY page by id
  (no publish gate), gated by `checkAdminFromHeaders` (404s if not an authed admin so drafts never
  leak), and renders via the SAME pipeline → pixel-identical to production. Shell: iframe `src=/preview/<id>`
  keyed by `${id}-${previewNonce}`, honoring VIEWPORT_WIDTH (desktop 100% / tablet 768px / mobile 375px);
  refresh button + post-Save now bump `previewNonce` to reload. Moved `collectComponentNames` into the
  dep-free `tree.ts` (re-used by both routes) + added i18n `previewIframeTitle` (en/fi/et).
- **Verified:** CMS `npx tsc --noEmit` clean; `node --test collect-component-names.test.ts` 4/4;
  `page-blocks-sections.test.ts` 6/6 (no regression); `npx opennextjs-cloudflare build` green —
  `/preview/[id]` appears as a dynamic route in the manifest. Could NOT live-click in a deployed CMS
  (needs Worker + D1 + PM session — HITL).
- **Files:** CMS/src/lib/render/render-page.tsx (new), CMS/src/app/preview/[id]/page.tsx (new),
  CMS/src/app/[[...slug]]/page.tsx, CMS/src/lib/render/tree.ts,
  CMS/src/lib/render/collect-component-names.test.ts (new),
  CMS/src/components/page-builder/page-builder-shell.tsx, CMS/messages/{en,fi,et}.json

## 2026-06-19 17:22 — Right rail SEO form (reuse C2 page-meta + PUT /api/pages)
- **Status:** DONE
- **What I did:** Wired the right rail's SEO tab to a real form. New `SeoForm` in
  `page-builder-shell.tsx`: one meta title + meta description per CONTENT locale, pre-filled
  from the selected page's `PageSummary` (`metaTitle`/`metaDescription` maps already loaded in
  `pages` state — no new fetch). Save PUTs `{id,slug,parentSlug,publishStatus,metaTitle,
  metaDescription}` to the EXISTING `/api/pages` (same body `validatePageMeta` validates;
  slug/parent/publish kept as-is — SEO-only edit, no new page-store/validation path), then
  refetches pages so picker labels stay current. Content locales: server `page.tsx` now resolves
  `getContentLocales()` (default-locale fallback offline) and passes `contentLocales` to the shell.
  Two new PURE helpers in `lib/pages/page-meta.ts`: `setLocaleValue` (immutable map set, drops
  cleared keys) + `buildSeoMetaBody` (page identity + edited maps → PUT body shaped for
  validatePageMeta). C2 `pages-manager.tsx` refactored to import `setLocaleValue` (deleted its
  private `setLocale` copy — one source). i18n `seoMetaTitle/seoMetaDescription/seoSave/seoSaved`
  EN/FI/ET (2-space indent — messages files use 2 spaces, NOT tabs).
- **Verified:** `node --test page-meta.test.ts` 3/3; CMS `npx tsc --noEmit` clean; `npx
  opennextjs-cloudflare build` green (dev stopped, 3601 free). Could NOT live-click (no D1 binding /
  PM session offline — HITL); REST contract is the existing C2 PUT, build-green + pure test cover it.
- **Files:** CMS/src/lib/pages/page-meta.ts (+ page-meta.test.ts new),
  CMS/src/components/page-builder/page-builder-shell.tsx, CMS/src/app/admin/page-builder/page.tsx,
  CMS/src/components/pages/pages-manager.tsx, CMS/messages/{en,fi,et}.json.
  DEFERRED: PM npm run bundle:cms (cross-loop guardrail — bundle file owned by another loop).

## 2026-06-19 17:26 — Regen deployable CMS bundle (the deferred 3-change regen)
- **Status:** DONE
- **What I did:** Ran PM `npm run bundle:cms` (`build-cms-bundle.mjs --opennext`) to regenerate
  `ProjectManager/src/lib/deploy/cms-bundle.generated.js` from current CMS source — the regen the last
  3 page-builder workers explicitly deferred (cross-loop bundle-contention guardrail). USER EXPLICITLY
  approved overwriting the dirty/abandoned bundle this run. The OpenNext build picked up the three
  committed CMS render changes — Section renderer primitive (`tree.ts`/`render-page.tsx`), `/preview/[id]`
  draft-preview route, and the SEO metaTitle/metaDescription form — plus the in-flight public-route
  rewire (`[[...slug]]/page.tsx` → shared `RenderedPage`/`buildPlanFromPage`, `collectComponentNames`).
- **Verified:** OpenNext `next build` green; route manifest lists `ƒ /preview/[id]`. Grepped the
  generated bundle: `RenderedPage` ✓, `buildPlanFromPage` ✓, `data-section` (Section primitive) ✓,
  `metaTitle` (SEO) ✓, `preview/[id]` ✓. `node` import of the generated module loads clean — exports
  `{builtAt,files,mainModule}`, mainModule=worker.js, builtAt=2026-06-19T14:26 (this run). Did NOT
  live-deploy (HITL — needs CF creds / deployer Worker).
- **Files:** ProjectManager/src/lib/deploy/cms-bundle.generated.js (regenerated; committed by explicit path).

## 2026-06-19 — DnD slice 1: drag a "Section" from the LAYOUT rail into the Layers tree
- **Status:** DONE
- **What I did:** Wired native HTML5 drag-and-drop for the LAYOUT "Section" primitive — no dnd
  dependency. Added a tiny shared payload layer to `page-builder-shell.tsx`: `DND_MIME`
  (`application/x-page-builder`), a `DragPayload` union (`{kind:"section"}` now; slice 2 will add
  `{kind:"component",name}`), and `setDragPayload`/`readDragPayload` helpers (slices 2/3 reuse these).
  The rail's Section button is now `draggable` (when a page is selected) with
  `onDragStart={setDragPayload(e,{kind:"section"})}` + cursor-grab styling — click-to-add still works.
  The center **Layers** panel is the drop target: `onDragOver` (preventDefault + dropEffect=copy +
  show indicator), `onDragLeave` (clears only when truly leaving via `contains(relatedTarget)`),
  `onDrop` (reads payload; section → `onAddSection()` which APPENDS). Drop onto empty Layers = append
  (the empty-state branch is inside the same drop div). Blue drop-line indicator (`bg-primary` rules +
  `t("dropSectionHint")`) renders while dragging over.
- **Reuse:** No tree logic touched — reused the existing `addSection` helper via `onAddSection`. Per
  the backlog ("pure helper test if you touch tree logic"), no new test needed; DnD is UI glue.
- **Verified:** CMS `npx tsc --noEmit` clean; `npx opennextjs-cloudflare build` green (dev stopped,
  3601 free). Did NOT live-drag (no D1/PM session offline — HITL); the drop calls the same already-
  tested `addSection` path the click button uses.
- **Files:** CMS/src/components/page-builder/page-builder-shell.tsx, CMS/messages/{en,fi,et}.json
  (`pageBuilder.dropSectionHint`, 2-space indent). DEFERRED: PM `npm run bundle:cms` — cross-loop
  guardrail (this run's task message explicitly forbids touching the bundle); a pure UI-only change,
  no render/route behavior changed, so the bundle does not strictly need this slice yet.

## 2026-06-19 18:00 — Section column model migration (pure tree + renderer first)
- **Status:** DONE
- **What I did:** Migrated the builder Section from a flat `<div data-section>` to the aicms
  Section→Columns model — pure tree helpers + renderer, no UI this slice (per the backlog "pure +
  renderer first"). `lib/render/tree.ts`: added reserved `SECTION_COLUMN_COMPONENT="__section_column__"`;
  `planPage` Section render is now a CSS grid — outer `<div data-section style=bg>` → inner `<section>`
  with `gridTemplateColumns` (equal `repeat(n,1fr)`, or collapse → empty cols `0fr`), `gap`(px), 4× padding
  using a per-side rem-default unit (`paddingTopUnit` etc.), `maxWidth` ("full"→100%), `margin:0 auto`;
  each column → `<div data-section-column>` flex column with align/justify from the section's
  vertical/horizontal align. Math ported from aicms `BlockRenderer.tsx` SectionRenderer (~202–266).
  `lib/pages/page-blocks.ts`: `addSection` now seeds `props.columns:1` + one `__section_column__` child;
  new PURE `setSectionColumns(blocks,id,n)` (clamp 1–4; grow appends empty columns with tree-unique ids;
  shrink reflows removed columns' children into the LAST kept column — matches aicms, nothing lost);
  `addComponentToColumn(blocks,id,colIndex,name)`; `sectionColumns`, `isSectionColumn`. Kept
  `addComponentToSection` as a thin shim → column 0 so the existing shell click-insert keeps working
  (DnD slice 2 owns the real per-column drop UI). `validateBlocks` now drops BOTH reserved names from
  `componentNames`.
- **Verified:** `node --test page-blocks-sections.test.ts` 11/11 (rewritten: grow/shrink-reflow,
  collapse 0fr, grid output shape, unique ids, no-op guards); `collect-component-names.test.ts` 4/4 (no
  regression); CMS `npx tsc --noEmit` clean; `npx opennextjs-cloudflare build` green (port 3601 free,
  dev stopped). Did NOT live-render (no D1/PM session offline — HITL).
- **Files:** CMS/src/lib/render/tree.ts, CMS/src/lib/pages/page-blocks.ts,
  CMS/src/lib/pages/page-blocks-sections.test.ts.
  DEFERRED: PM `npm run bundle:cms` — cross-loop guardrail (task message forbids touching the bundle).
  NOTE: render behavior DID change this run, so the deployable bundle is now STALE and owes a regen.

## 2026-06-19 18:06 — Right-rail Block tab: Section settings panel
- **Status:** DONE
- **What I did:** Added `SectionSettings` to `page-builder-shell.tsx` — when the selected block is a Section, the Block tab shows columns (1–4 segmented), empty-cols Equal/Collapse, 3×3 align grid, 4 padding inputs each with a per-side rem/px unit toggle (rem default), gap, max-width select, and theme-palette background swatches (`var(--color-*)`). New pure `mergeSectionProps(blocks,id,patch)` in `page-blocks.ts` (columns→`setSectionColumns`, undefined deletes key, no-op for non-Section). 3 new tests → 14/14. i18n `pageBuilder.section*` in en/fi/et. Edits persist via the existing block PUT on Save.
- **Verified:** node --test page-blocks-sections.test.ts 14/14; tsc clean; opennext build green (dev stopped). i18n diff +29 lines/locale (no reformat).
- **Files:** CMS/src/components/page-builder/page-builder-shell.tsx, CMS/src/lib/pages/page-blocks.ts, CMS/src/lib/pages/page-blocks-sections.test.ts, CMS/messages/{en,fi,et}.json

## 2026-06-19 18:10 — DnD slice 2: drag a component into a Section COLUMN slot
- **Status:** DONE
- **What I did:** `LayersTree` (page-builder-shell.tsx) now renders, under each Section, one drop slot PER column (`sectionColumns(b)` → "Column N" dashed cells with stacked component buttons + an empty-state `dropComponentHint`). Rail COMPONENT items are now `draggable` carrying `{kind:"component",name}`. Each column is a native HTML5 drop target: onDragOver preventDefault + per-slot highlight (state keyed `${sectionId}:${colIndex}`), onDrop reads the payload, rejects non-component kinds, and calls new shell handler `onDropComponentToColumn` → pure `addComponentToColumn(blocks,sectionId,colIndex,name)` (`stopPropagation` so it doesn't bubble to the Section-add root drop zone). A component dropped on the Layers root is rejected by the existing root onDrop (only acts on `section`). Click-to-insert (into selected/last section, column 0) unchanged. No new tree logic — `addComponentToColumn`/`sectionColumns` already existed + were tested.
- **Verified:** tsc --noEmit clean; node --test page-blocks-sections.test.ts 14/14 (unchanged, confirms no regression); opennext build green (dev stopped, port 3601 free). i18n diff +2 keys/locale (no reformat, git diff +4 lines each).
- **Files:** CMS/src/components/page-builder/page-builder-shell.tsx, CMS/messages/{en,fi,et}.json

## 2026-06-19 — DnD slice 3: reorder + cross-column move in the Layers tree
- **Status:** DONE
- **What I did:** PURE helper FIRST — `moveNode(blocks, dragId, targetId, position)` in `CMS/src/lib/pages/page-blocks.ts`, `position` = `before`/`after`/`into`. It `findNode`s the dragged node anywhere in the tree, `removeNode`s it, then for sibling drops `insertSibling`s before/after the target at whatever depth it lives (recurses into children), and for `into` `insertInto`s as the last child of a container target (only `isSection`/`isSectionColumn` accept; a leaf falls back to no-op). No-ops return a structural `clone(blocks)` for: self-drop, missing drag/target, `into` a leaf, or target-is-a-descendant-of-dragged (descendant guard). Unifies reorder-Sections / reorder-within-column / cross-column / cross-section into one helper. THEN wired the UI in `LayersTree` (page-builder-shell.tsx): added `{kind:"move",id}` to the `DragPayload` union; a shared `reorderProps(id)` makes Section + component node buttons `draggable` AND drop targets — `edgeOf(e)` picks before/after from the top/bottom half of the node, `edgeClass` paints a box-shadow edge line, `stopPropagation` keeps the move-drop off the column/root zones. A `move` payload dropped on a COLUMN cell calls `onMoveNode(id, col.id, "into")` (drop a component into another column). New shell handler `onMoveNode` → `setBlocks(moveNode(...))` + dirty; persists via existing Save (block PUT). Rail section/component drops are unchanged (each handler gates on payload `kind`).
- **Verified:** tsc --noEmit clean; `node --test page-blocks-sections.test.ts` 19/19 (6 new moveNode tests: section reorder before/after, within-column reorder, cross-column `into`, cross-section sibling, and the no-op bundle); opennext build green (dev stopped, port 3601 free). No new visible strings → no i18n change.
- **Files:** CMS/src/lib/pages/page-blocks.ts, CMS/src/lib/pages/page-blocks-sections.test.ts, CMS/src/components/page-builder/page-builder-shell.tsx
- **Bundle:** PM `bundle:cms` NOT owed (UI-only; `moveNode` yields the same Block shape, no render output change). Bundle still owed from the column-model run (see CAVEATS) — a render-touching run should regen.

## 2026-06-19 18:25 — Component props-schema FOUNDATION (richer vocab + Block-tab settings form)
- **Status:** DONE
- **What I did:** Widened the existing schema path + added the right-rail Block-tab settings form for a
  selected COMPONENT (not just Section). `page-blocks.ts`: `parsePropsSchema` now returns a `PropField[]`
  with the aicms-style vocab — `type: string|richtext|number|boolean|select` (unknown→string), plus
  `required`, `translatable` (honored only on string/richtext), `label`, `description`, `options`
  (`["a",{value,label}]` both accepted), and a typed `defaultValue` for number/boolean. `validateBlockProps`
  got a schema-aware overload: pass `PropField[]` → type coercion (number→finite/drop non-numeric,
  boolean→bool, select must be in `options`) + required props NEVER dropped to "" (declared default
  substituted); legacy `Set<string>` allowlist path kept intact so the C3 `block-editor.tsx` is unaffected.
  New PURE tree-walk helpers `findBlock`/`mergeBlockProps` (the Block tab MUST tree-walk now that nested
  components are selectable from Layers column cells). UI: new `ComponentSettings` form in
  `page-builder-shell.tsx` — one control per schema field (text/textarea/number/checkbox/select); a
  TRANSLATABLE string/richtext field renders one input PER content locale (mirrors SEO tab) writing via
  `setLocalizedProp`; every edit re-validates the full props via `validateBlockProps(schema)` and persists
  via the existing block PUT (Save). Block tab now resolves the selected block via `findBlock` (tree-walk).
  New endpoint `GET /api/components/palette` → `[{name,propsSchema}]` (reuses `listComponentPalette`) so the
  client shell can parse the selected component's schema. i18n `pageBuilder.componentNoProps` EN/FI/ET.
- **Verified:** CMS `npx tsc --noEmit` clean; `node --test page-blocks-schema.test.ts` 9/9; existing
  `page-blocks-sections.test.ts` 19/19 (no regression); `npx opennextjs-cloudflare build` green (dev stopped,
  port free); `/api/components/palette` present in routes-manifest. Could NOT verify live D1 wiring (no
  binding offline) — endpoint degrades like the others.
- **Files:** CMS `src/lib/pages/page-blocks.ts`, `src/components/page-builder/page-builder-shell.tsx`,
  `src/app/api/components/palette/route.ts`, `src/lib/pages/page-blocks-schema.test.ts`,
  `messages/{en,fi,et}.json`.

## 2026-06-19 18:29 — Upgrade BLOG kit component schemas to richer vocab
- **Status:** DONE
- **What I did:** Enriched every blog-kit component's `propsSchema` (kept bizbee's object-keyed shape,
  widened the descriptors): added `required:true`+`translatable:true`+`label` to human-readable text props —
  BlogPostHeader title[req]/date/author, BlogPostBody body[richtext,req], AuthorCard name[req]/bio,
  PostListItem title[req]/date/excerpt (href = URL → NON-translatable), PostList heading[req]. Did NOT invent
  number/boolean/select props: the kit markup binds `{{slot}}` TEXT only (PostList renders just `{{heading}}`,
  its rows are static sample HTML), so config fields would be inert metadata — markup left UNCHANGED per spec.
  Extended `scripts/blog-kit.test.mjs` with a regression test (every prop parses via `parsePropsSchema` to a
  known field type; title=required+translatable; href NOT translatable; body=richtext+translatable).
- **Verified:** `npx tsc --noEmit` OK; `node --test scripts/blog-kit.test.mjs` 6/6 pass;
  `npx opennextjs-cloudflare build` green (port 3601 free, dev stopped). PM bundle NOT regenerated — propsSchema
  is editor metadata, no render-output change (still owed from the column-model render run per CAVEATS).
- **Files:** CMS `src/lib/components/blog-kit.ts`, `scripts/blog-kit.test.mjs`.

## 2026-06-19 18:33 — Upgrade LANDING kit schemas to the richer vocab
- **Status:** DONE
- **What I did:** Enriched every component's `propsSchema` in `lib/components/landing-kit.ts`
  (Hero, FeatureGrid, CTABand, Testimonial, SiteFooter) — kept bizbee's object-keyed shape, widened each
  text-prop descriptor with `translatable:true` + `label` and `required:true` on each component's primary
  text (Hero.headline, FeatureGrid.heading + feature{1,2,3}Title, CTABand.title, Testimonial.quote/author,
  SiteFooter.tagline). `ctaHref` (Hero + CTABand) is a URL → label only, NON-translatable. Followed the
  BLOG-run lesson: NO number/boolean/select fields — the kit markup binds only `{{slot}}` text, so a config
  field would be dead metadata; markup left UNCHANGED.
- **Verified:** CMS `npx tsc --noEmit` OK; `node --test scripts/landing-kit.test.mjs` 6/6 (new test asserts
  every prop parses to a known field type, Hero.headline req+translatable, Hero.ctaHref NOT translatable,
  FeatureGrid.feature1Title + SiteFooter.tagline req+translatable); `npx opennextjs-cloudflare build` green
  (port 3601 free). PM bundle NOT regenerated — propsSchema is editor metadata, no render-output change
  (still owed from the column-model render run per CAVEATS).
- **Files:** CMS `src/lib/components/landing-kit.ts`, `scripts/landing-kit.test.mjs`.

## 2026-06-19 18:36 — Upgrade DOCS kit component schemas to the richer vocab
- **Status:** DONE
- **What I did:** Enriched `lib/components/docs-kit.ts` propsSchema for all 5 components (the
  hint's "6th" component didn't exist). Added `required`/`translatable`/`label` to every
  human-readable text prop; left code/identifier props non-translatable (CodeBlock filename+code,
  ApiParam name+paramType). NO number/boolean/select added — markup binds only `{{slot}}` text, so
  config fields would be dead editor metadata. Markup UNCHANGED. Extended `scripts/docs-kit.test.mjs`
  with a `parsePropsSchema` regression test (field-type vocab + translatable assertions).
- **Verified:** `npx tsc --noEmit` clean; `node --test scripts/docs-kit.test.mjs` 6/6;
  `npx opennextjs-cloudflare build` green (dev port 3601 free).
- **Files:** CMS/src/lib/components/docs-kit.ts, CMS/scripts/docs-kit.test.mjs

## 2026-06-19 18:43 — Auto-bundle:cms on PM deploy + regen owed-stale bundle
- **Status:** DONE
- **What I did:** Chained the CMS bundle regen into the PM deploy lifecycle so every deploy ships a
  fresh bundle. `ProjectManager/package.json`: `"predeploy": "npm run preflight"` →
  `"predeploy": "npm run bundle:cms && npm run preflight"` (regen FIRST, preflight validates the fresh
  bundle). `npm run deploy` already fires `predeploy` via npm lifecycle — no new script/dep. Also regen'd
  the bundle ONCE this run (owed-stale since the Section→Columns render change): `npm run bundle:cms`
  (full OpenNext build → esbuild → cms-bundle.generated.js, builtAt=2026-06-19T15:43:46.671Z, 6647KB).
- **Verified:** port 3601 free before build; `npm run bundle:cms` succeeded; `npm run preflight` passed
  (1 pre-existing static-assets-gap warning, not a validation failure); grep on the regenerated bundle
  confirms current Section render — `data-section-column` ×1, `data-section` ×1, `preview/[id]` ×1,
  `RenderedPage` ×1, `builtAt` ×1. The owed bundle obligation from the column-model run is now CLEARED.
- **Files:** ProjectManager/package.json, ProjectManager/src/lib/deploy/cms-bundle.generated.js
