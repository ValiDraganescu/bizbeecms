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
- Components are stored FLAT in D1; the kit GAP is now CLOSED via a `sourceKit` column on `component`
  (migration 0003). Tagging happens ONLY at kit install (`/api/components/kit` POST →
  `upsertImportedComponent(c, undefined, id)`); manual import + AI write paths leave it NULL. Read the
  grouped view via `GET /api/components/grouped` (uses pure `lib/components/grouped.ts` +
  `db.listComponentsWithKit`). Do NOT add a second component pipeline — reuse these.
- `drizzle-kit generate` (`npm run db:generate` in CMS) auto-names migrations (e.g.
  `0003_worthless_fallen_one.sql`) and writes `migrations/meta/*`. A new nullable column = a single
  additive `ALTER TABLE ... ADD` — safe on existing rows. Migrations are applied with
  `wrangler d1 migrations apply` (per drizzle.config comment), NOT auto-run by the build.
- A builder "Section" is modeled as a `Block` with `component:"Section"` (reserved name
  `SECTION_COMPONENT` in `lib/pages/page-blocks.ts`); dropped components are its `children`.
  GOTCHA: the block PUT route (`/api/pages/[id]/blocks`) calls `missingComponents(componentNames)`
  and 409s on any component NOT in D1 — so saving a page that contains a "Section" (or any
  un-imported rail component) will be REJECTED until that component exists. For the builder to
  actually persist sections, either (a) register a real "Section" layout component in D1 (and the
  renderer must know how to render a container that renders its children), or (b) special-case the
  reserved Section name in `missingComponents`/`validateBlocks` + the renderer. This slice wired the
  in-editor tree + click-insert + Save call; making Save SUCCEED end-to-end is the next gap.
- The renderer (`lib/render/tree.ts` `planPage`) doesn't yet render a Block's `children` as a
  container — `Block.children` round-trips through validate/persist but a "Section" won't visually
  nest its components in the public render until a Section container component renders `props`/slot
  children. Keep that in mind for the Preview slice.
