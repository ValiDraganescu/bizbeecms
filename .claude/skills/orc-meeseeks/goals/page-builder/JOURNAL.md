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
