# Journal — page-builder-ux
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-06-26 08:53 — Resizable right-side inspector (3 preset widths)
- **Status:** DONE
- **What I did:** Right-rail inspector (Block/Page/SEO) is no longer fixed `w-[320px]`. New pure helper `CMS/src/lib/page-builder/inspector-width.ts` maps preset → clamped px: `default` (320), `quarter` (¼ editor), `half` (½ editor), clamped so the canvas keeps `CANVAS_MIN_W=360` and the inspector keeps `INSPECTOR_MIN_W=280`. Added a 3-button preset selector above the rail tabs (design-system tokens, no native dialog). Persisted in localStorage key `bizbee.builder.inspectorWidth`. Shell measures the 3-column area via a `ResizeObserver` on a new `columnsRef`, so the % presets track real width; widening the inspector shrinks the flex canvas to match. EN/FI/ET strings under `pageBuilder.inspectorWidth`.
- **Verified:** New node test (6 cases) green; CMS `tsc --noEmit` clean; full `npm test` 957 pass; `npx opennextjs-cloudflare build` (dev off) complete. JSON parity en/fi/et confirmed.
- **Files:** CMS/src/lib/page-builder/inspector-width.ts (+.test.ts), CMS/src/components/page-builder/page-builder-shell.tsx, CMS/messages/{en,fi,et}.json
- **Note:** Did NOT run `bundle:cms` — another loop has uncommitted CMS edits (components-manager.tsx); bundle auto-regens on PM deploy.

## 2026-06-26 09:09 — Collapsible left rail AND right inspector
- **Status:** DONE
- **What I did:** Finished a previous worker's mid-task. Each side rail collapses entirely to a thin (`w-9`) re-expand strip, freeing its grid track to the canvas; expand restores it. New pure helper `CMS/src/lib/page-builder/panel-collapse.ts` (`resolveCollapsed` default-EXPANDED on unknown; `load/saveCollapsed` per side) persists in localStorage keys `bizbee.builder.leftCollapsed` / `bizbee.builder.rightCollapsed`. Shell: `leftCollapsed`/`rightCollapsed` state, load-on-mount effect, toggle handlers, and a `CollapseToggle` double-chevron button (mirrors the admin sidebar affordance) on each panel header. Collapsed overrides the inspector width preset. i18n keys `pageBuilder.panel.{collapse,expand}{Left,Right}` were already committed by the dead worker (present in all 3 locales).
- **Verified:** New node test green; CMS `tsc --noEmit` clean; full `npm test` 961 pass; `npx opennextjs-cloudflare build` (dev off) complete (first attempt flaked on prerender of UNRELATED components-manager.tsx:761 — retry passed clean, worker.js bundled).
- **Files:** CMS/src/lib/page-builder/panel-collapse.ts (+.test.ts), CMS/src/components/page-builder/page-builder-shell.tsx
- **Note:** Did NOT run `bundle:cms` and did NOT stage CMS/messages/*.json — another loop has uncommitted CMS edits (components-manager.tsx, lib/components/tags.ts, en.json bulk-tag keys). i18n strings were already in HEAD.
