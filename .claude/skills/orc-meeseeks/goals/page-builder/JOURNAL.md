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
