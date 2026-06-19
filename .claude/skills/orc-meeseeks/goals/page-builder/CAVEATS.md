# Caveats — page-builder
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- The reference impl lives in a SEPARATE repo (`/Users/valentindraganescu/git/dev/aicms`,
  `src/modules/page-builder/components/page-builder-v2/`). Read it for the layout, but DO NOT copy its
  imports/deps blindly — adapt to this project's design system (purpose tokens, `src/components/ui`,
  next-intl EN/FI/ET) and CF-native constraints (no server actions — REST + fetch; see main CAVEATS).
- In the reference, the **Layers** panel is in the CENTER (toggled with Preview), and the LEFT rail is
  Components-only. Keep that arrangement — it matches the requested layout.
- CMS i18n messages live in `CMS/messages/{en,fi,et}.json` (NOT `src/messages/`). There is NO
  `src/components/ui` in CMS — components live flat under `src/components/<area>/`. Purpose tokens
  confirmed in `src/app/globals.css`: surface, surface-raised, surface-muted, foreground,
  foreground-muted, border, primary, primary-foreground, primary-subtle. Use these only, never raw colors.
- The sidebar nav is data-driven: add a section to `src/components/admin-sections.ts` (key + href),
  then add a matching SVG case in `admin-sidebar.tsx`'s `NavIcon` AND extend the `IconKey` union, plus
  i18n `adminNav.<key>` + `adminNav.desc.<key>` in all 3 locales (the /admin index renders `desc.<key>`).
- Gate workflow that works: CMS `npx tsc --noEmit` → CMS `npx opennextjs-cloudflare build` → PM
  `npm run bundle:cms` (regenerates `ProjectManager/src/lib/deploy/cms-bundle.generated.js`). Run the
  opennext build only with dev stopped (port 3601) — see main CAVEATS.
- `node --test` does NOT resolve the `@/` tsconfig alias — pure-helper tests under
  `src/lib/...` must import the thing-under-test with a RELATIVE `.ts` path (the helper
  file itself can use `@/...` since it's only type-checked + bundled, never run by node).
  See `lib/pages/page-picker.test.ts` (imports `PageSummary` as `../../db/page-store.ts`).
- The page-builder shell is a `"use client"` component; the `/admin/page-builder/page.tsx` server route
  is a thin wrapper (force-dynamic) that just renders `<PageBuilderShell/>`. Keep feature wiring in the
  client shell (it already holds viewport/center-tab/right-tab chrome state).
