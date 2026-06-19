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
