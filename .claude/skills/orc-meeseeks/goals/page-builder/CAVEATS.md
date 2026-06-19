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
- SECTION→COLUMNS MODEL IS NOW LIVE (2026-06-19). A Section's `children` are `__section_column__` blocks
  (reserved `SECTION_COLUMN_COMPONENT` in `tree.ts`, re-exported from `page-blocks.ts`); the actual dropped
  components live in a COLUMN's `children`, NOT directly on the Section. aicms tags columns with
  `c.type === "__section_column__"` but bizbee Blocks have no `type` field — a column is a Block with
  `component: "__section_column__"`. Use the pure helpers: `addSection` (seeds 1 col), `setSectionColumns`
  (clamp 1–4, grow=append empty, shrink=reflow into last kept col), `addComponentToColumn(blocks,id,colIndex,name)`,
  `sectionColumns(section)`. `addComponentToSection` is now a SHIM → column 0 (don't add new direct-to-section
  inserts; DnD slice 2 owns per-column drop). `validateBlocks` drops BOTH `Section` + `__section_column__`
  from componentNames (neither is a D1 component).
- Section render math lives in `tree.ts` `planSection`/`planColumn` (ported from aicms BlockRenderer): outer
  `<div data-section style=bg>` → `<section style=grid>` → per-column `<div data-section-column style=flex>`.
  PADDING UNIT: per-side rem default — props are `paddingTop` + `paddingTopUnit` (default "rem"), etc. The
  Block-tab settings panel (next task) must thread these. Don't change render in two places — `planSection`
  is the one source (public + preview both go through `planPage`).
- HEADS-UP (backlog reordered mid-2026-06-19): the USER adopted the aicms Section→Columns model.
  Future Section work seeds `__section_column__` children and components drop into a COLUMN, not the
  Section directly. DnD slice 1 (this one) only drags the Section primitive into Layers (append), so
  it's model-agnostic and unaffected. Slice 2 will need `addComponentToColumn` (replacing the
  section-direct `addComponentToSection`) per the new backlog. The column model migration is the
  prerequisite task above slices 2/3.

- Section settings panel (Block tab) is the `SectionSettings` component in `page-builder-shell.tsx`; it
  edits a Section's props through the pure `mergeSectionProps(blocks,id,patch)` in `page-blocks.ts`.
  `columns` MUST go through that helper (it routes to `setSectionColumns` to reflow column children) — never
  stamp `columns` straight onto `props`. A patch value of `undefined` DELETES the key (reverts to render
  default). BG swatches use design-system purpose tokens (`var(--color-*)`), NOT hex — they resolve at
  render because the renderer writes `style.backgroundColor` inline. Padding stores a per-side unit
  (`padding<Side>Unit`, rem default) which `tree.ts` `pad()` already reads.
- DnD slice 2 DONE: rail COMPONENT items drag `{kind:"component",name}`; per-column drop slots live in
  `LayersTree` (page-builder-shell.tsx), keyed `${sectionId}:${colIndex}` for the hover highlight. A column's
  onDrop calls `stopPropagation()` so the drop does NOT also bubble to the CENTER Layers root drop zone (which
  appends a Section on a `section` payload). Keep that stopPropagation if you touch column drops, else a
  component-on-column would ALSO be ignored-then-bubble (harmless today since root rejects non-section, but
  don't rely on it). Component dropped on the Layers ROOT = rejected (root onDrop only acts on `section`).
  The root onDragOver still shows the blue "drop to add Section" line while dragging a COMPONENT over empty
  Layers space — cosmetically misleading but harmless (the drop is rejected). If it bugs you, gate the root
  indicator on `e.dataTransfer.types.includes(DND_MIME)` is NOT enough (value unreadable in dragover); you'd
  need a shell-level "what kind is being dragged" state set in onDragStart. Left as-is (ponytail).
- The Block tab only resolves the selected block at the TOP level (`blocks.find(b=>b.id===selectedBlockId)`)
  — fine today because only Sections are selectable from Layers. When component-blocks become selectable
  (deeper nesting), that lookup must walk children too.

- DnD slice 3 DONE: the `DragPayload` union now has a third variant `{kind:"move",id}` (existing-node
  reorder) alongside `{kind:"section"}` (rail) + `{kind:"component",name}` (rail). EVERY drop handler MUST
  gate on `payload.kind` so a move isn't mistaken for a rail insert and vice-versa — the column cell now
  branches: `component` → `onDropComponent` (new block), `move` → `onMoveNode(id,col.id,"into")`. The pure
  mover is `moveNode(blocks,dragId,targetId,position)` in `page-blocks.ts`; position before/after = SIBLING of
  the target (at any depth), `into` = last child of a CONTAINER target (Section/column only — leaf = no-op).
  Reorder UI lives in `LayersTree`'s `reorderProps(id)` (shared by Section + component buttons): top half of a
  node = before, bottom = after (`edgeOf`), `stopPropagation` on the move's onDragStart/onDrop keeps it off the
  column/root zones. KNOWN COSMETIC: hovering a component button inside a column fires BOTH the button's edge
  highlight AND the column's `hoverSlot` highlight (button onDragOver bubbles to the column) — harmless, left
  as-is (ponytail). If it ever matters, stopPropagation the reorder onDragOver, but then the column won't show
  its hover when dragging over a child — pick one.
- There is NO drop zone to move a Section INTO a column or a component OUT to the top level as a sibling of a
  Section yet — `moveNode` SUPPORTS it (drop a component before/after a Section button → it becomes a
  top-level sibling), but that produces a top-level non-Section block. `validateBlocks`/`planPage` tolerate it
  (renders the bare component at top level), so it's not broken, just unusual. The reorder UI only exposes
  before/after on existing buttons + `into` on columns; richer constraints (e.g. "components only inside
  columns") are not enforced in the UI — add a guard in `moveNode` or the drop handler if a future task wants it.

- PROPS-SCHEMA FOUNDATION DONE (2026-06-19): `parsePropsSchema` now returns `PropField[]` (NOT the old
  `{name,type:"string"|"richtext",default}[]`) — `type` widened to string|richtext|number|boolean|select
  (+ `required`,`translatable`,`label?`,`description?`,`options?`,`defaultValue?`). `validateBlockProps`
  is OVERLOADED: pass `Set<string>` for the legacy name-allowlist (C3 `block-editor.tsx` still does), or
  `PropField[]` for schema-aware TYPE COERCION (number/boolean/select) + required-prop retention. Don't
  collapse the two — block-editor relies on the Set path. `translatable` is ONLY honored on string/richtext
  (scalars are never per-locale). The kit-upgrade tasks just author `translatable:true` + real types in each
  kit's `propsSchema` JSON — the FOUNDATION already reads them; no parser change needed for those.
- The Block tab in `page-builder-shell.tsx` now resolves the selected node via PURE `findBlock` (tree-walk),
  NOT `blocks.find` — nested components in Section columns ARE selectable. Persist a component's edits with
  PURE `mergeBlockProps(blocks,id,props)` (tree-walk; `{}` drops the props key). Both live in page-blocks.ts.
- The client shell needs each component's raw propsSchema → new endpoint `GET /api/components/palette`
  ({name,propsSchema}) reusing `listComponentPalette` (same source the server-rendered C3 editor uses).
  `/api/components/grouped` returns NAMES ONLY — don't try to read propsSchema from it. The shell loads the
  palette into a `name→propsSchema` map in the same mount effect as groups.
