# Caveats — page-builder
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- RESOLVED (the two Section caveats lower down are now obsolete): the reserved Section IS handled.
  `SECTION_COMPONENT` lives in `lib/render/tree.ts` (re-exported from `page-blocks.ts` — import from
  EITHER, they're the same constant). `validateBlocks` deletes "Section" from `componentNames` so the
  block PUT route never 409s on it, and `planPage` renders a Section block as a `<div data-section=id>`
  nesting its `children`. Don't re-add a D1 "Section" component or special-case it again.
- Concurrency: multiple goal loops share this working tree. NEVER `git add -A`. Stage CMS page-builder
  files + your own `goals/page-builder/*` by explicit path only. `ProjectManager/src/lib/deploy/
  cms-bundle.generated.js` is frequently mid-edit by other loops — do NOT run `npm run bundle:cms` or
  stage that file unless your task owns it; defer the regen and note it in NEXT.md.

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

- CMS `messages/{en,fi,et}.json` use **2-space** indent (NOT tabs) and a trailing newline. If you
  add keys with a script, write `json.dump(..., indent=2)` + `f.write("\n")` — `indent="\t"` reformats
  the WHOLE file (600+ line phantom diff) and stomps other loops' in-flight message edits.
- The page-builder shell takes a `contentLocales: string[]` prop (resolved server-side in
  `app/admin/page-builder/page.tsx` via `getContentLocales()` w/ `defaultContentLocales()` fallback —
  D1 unbound offline). The SEO tab edits one metaTitle+metaDescription per content locale and PUTs the
  FULL page meta to the existing `/api/pages` (body `{id,slug,parentSlug,publishStatus,metaTitle,
  metaDescription}` — slug/parent/publish kept as-is). NOTE: NEXT.md said "PUT /api/pages/[id]" but the
  real route is `PUT /api/pages` with `id` IN the body — there is no `[id]/route.ts` (only `[id]/blocks`).
- SEO-form pure helpers live in `lib/pages/page-meta.ts`: `setLocaleValue` (immutable locale-map set,
  drops cleared keys — the C2 pages-manager now imports it too, don't re-add a private copy) +
  `buildSeoMetaBody`. Tested in `page-meta.test.ts` (relative `.ts` import, `node --test`).

- Public + preview render share ONE core: `lib/render/render-page.tsx` exports `buildPlanFromPage(pageRow)`
  (page row → {plan, locale}) + `RenderedPage({plan})` (the SSR'd <style>+tree+scripts JSX). Both
  `app/[[...slug]]/page.tsx` (published-leaf lookup) and `app/preview/[id]/page.tsx` (by-id, no publish
  gate, admin-guarded) call them. NEVER inline a second render path — change render behavior in ONE place.
- `render-page.tsx` is server-only (imports `getDb`, `next-intl/server`) so `node --test` CANNOT import it.
  Pure, node-testable render helpers must live in the dep-free `tree.ts` (e.g. `collectComponentNames`).
- The draft-preview route is `/preview/<pageId>` and is gated by `checkAdminFromHeaders` (same guard as
  the rest of /admin) → returns `notFound()` if not an authed admin, so drafts never leak publicly. The
  builder iframe keys on `${id}-${previewNonce}`; bump `previewNonce` to force a reload (refresh btn +
  after a successful Save).

- `npm run bundle:cms` runs a FULL OpenNext `next build` over CMS/ then esbuild-bundles
  `.open-next/worker.js` into the committed `cms-bundle.generated.js` (~6.9MB minified). It reads
  CURRENT CMS source from disk — including UNCOMMITTED CMS edits — so the bundle can capture another
  loop's in-flight work. Only regen when your task owns the bundle OR the user explicitly approves
  overwriting a contended/abandoned bundle. Verify a regen with grep against the generated file
  (`RenderedPage`/`buildPlanFromPage`/`data-section`/`metaTitle`/`preview/[id]`) and a `node -e import()`
  smoke (exports `{builtAt,files,mainModule}`, mainModule=worker.js). The minified bundle writes
  `builtAt = "..."` (spaces, no colon) — grep `builtAt` not `builtAt:`.

- DnD is native HTML5 (NO dnd dependency — neither CMS nor aicms ships one; do not add one). The
  shared payload layer lives in `page-builder-shell.tsx`: MIME `application/x-page-builder`, a
  `DragPayload` union, and `setDragPayload`/`readDragPayload`. REUSE these for slices 2/3 — don't
  invent a second payload format. GOTCHAS: a drop target MUST `e.preventDefault()` in `onDragOver`
  or the browser won't fire `onDrop`; clear hover state in `onDragLeave` only when
  `!e.currentTarget.contains(e.relatedTarget)` (else child elements flicker the indicator off).
  `dataTransfer.getData(MIME)` returns "" during dragover in some browsers — read the payload in
  `onDrop`, gate the indicator on a boolean state set in dragover instead.
- HEADS-UP (backlog reordered mid-2026-06-19): the USER adopted the aicms Section→Columns model.
  Future Section work seeds `__section_column__` children and components drop into a COLUMN, not the
  Section directly. DnD slice 1 (this one) only drags the Section primitive into Layers (append), so
  it's model-agnostic and unaffected. Slice 2 will need `addComponentToColumn` (replacing the
  section-direct `addComponentToSection`) per the new backlog. The column model migration is the
  prerequisite task above slices 2/3.
