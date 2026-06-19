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
