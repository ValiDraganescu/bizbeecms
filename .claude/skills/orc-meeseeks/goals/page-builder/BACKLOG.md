# Backlog — page-builder
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)
- BUG [P2] DONE (2026-06-19): Section/column BACKGROUND color doesn't change with the dark theme. ROOT
  CAUSE was the curator's gap #2: per-Site overrides emitted `:root{…}` ONLY, so a Site that customized a
  token stomped BOTH light and dark — dark mode could never differ. (Gap #1 — "no data-theme on the rendered
  page" — was WRONG on inspection: the root layout `app/layout.tsx` already sets `<html data-theme="system">`
  and imports globals.css, so the public/preview page DOES follow OS dark via `prefers-color-scheme` and
  globals.css's `[data-theme="system"]` dark block.) FIX: `themeOverridesToCss(light, dark?)` now scopes light
  overrides to `:root` ONLY and dark overrides to BOTH `[data-theme="dark"]` and
  `@media(prefers-color-scheme:dark){[data-theme="system"]}` so a token holds distinct values per mode and the
  light override no longer stomps dark. New `theme_overrides_dark` store key (`get/setThemeOverridesDark`);
  `render-page.tsx` threads it. Regression tests in `theme.test.ts`. tsc + opennext build green. REMAINING
  (follow-on, NOT this bug): a builder PREVIEW dark-mode TOGGLE so the operator can flip the iframe to dark
  to SEE it without changing their OS; + a settings UI to edit the dark override map (today only the store
  exists). Queued as a new task below.
- BUG [P2] (curator's original text, kept for ref): Section/column BACKGROUND color doesn't change with the dark theme — pick a theme-token
  background, switch to dark, still see the light color. DIAGNOSIS (curator checked the code, 2026-06-19):
  the mechanism is HALF right — the swatch already STORES theme tokens (`var(--color-surface)` etc., not
  hardcoded; `SectionSettings` ~1247, rendered as inline `style.backgroundColor` in `tree.ts` ~466/482), and
  `globals.css` DOES define dark values for those tokens (`[data-theme="dark"]` block: surface 0.995→0.2
  etc.). BUT two real gaps stop dark from ever applying on the rendered/preview page: (1) the rendered doc
  (`lib/render/render-page.tsx` `RenderedPage`) injects `UTILITY_CSS` + per-Site `themeCss` but sets NO
  `data-theme` attribute and NO `prefers-color-scheme` handling — so `var(--color-*)` always resolves to the
  LIGHT `:root` values; there's no dark mode on the public/preview page at all. (2) per-Site theme overrides
  are emitted as `:root{…}` ONLY (`theme.ts` `themeOverridesToCss` ~344-349) — a single light scope; a Site
  that customizes a token overwrites BOTH modes, so it can't differ light vs dark. FIX (scope for the
  worker): give the rendered page a way to be in dark mode (carry `data-theme` / honor `prefers-color-scheme`
  on the rendered document + the builder's preview iframe), AND emit per-Site overrides for BOTH a light and a
  dark scope (`:root{…}` + `[data-theme="dark"]{…}`) so a token can hold distinct values per mode. Token-based
  backgrounds then swap correctly. Add a test for the dark-scope CSS emission. reported 2026-06-19.
- BUG [P2]: In the page-builder Layers tree a multi-column Section shows its columns STACKED VERTICALLY
  (COLUMN 1 above COLUMN 2) — you'd expect them side-by-side in a ROW, matching how they render and the
  aicms screenshots. repro: add a Section, set COLUMNS=2 in the Block tab → the two column slots appear
  one under the other. CAUSE: `LayersTree` in `CMS/src/components/page-builder/page-builder-shell.tsx`
  wraps the `sectionColumns(b).map(...)` (line ~1016) in `<ul className="mt-2 space-y-2 …">` — `space-y-2`
  is vertical. FIX: lay the columns out as a row honoring the Section's `columns`/`columnBehavior` (e.g.
  `grid` with `grid-template-columns` like the real render in `tree.ts`, collapse → empty cols shrink), so
  the Layers view mirrors the actual grid. Keep each column its own drop target. reported 2026-06-19.

## Tasks
- TODO: **Dark-mode preview toggle + per-Site DARK theme override editor (follow-on to the dark-bg bug).**
  The data layer is DONE: `themeOverridesToCss(light, dark?)` emits light→`:root`, dark→`[data-theme="dark"]`
  + `@media(prefers-color-scheme:dark){[data-theme="system"]}`; `get/setThemeOverridesDark` persist a
  `theme_overrides_dark` map; `render-page.tsx` threads it. WHAT'S LEFT (UI): (1) the builder's PREVIEW iframe
  follows OS dark today (root layout `data-theme="system"`); add a LIGHT/DARK toggle in the preview chrome
  that forces `data-theme` on the iframe document so the operator can SEE dark without changing their OS
  (e.g. pass `?theme=dark` to `/preview/[id]` and have that route set `data-theme` on its wrapper, or
  postMessage the iframe). (2) The theme settings editor (wherever light overrides are edited — find it via
  `setThemeOverrides`/the theme settings page) gets a DARK tab/column to edit the dark map via
  `setThemeOverridesDark`. EN/FI/ET for the toggle + dark-tab chrome. Gate: CMS tsc + opennext build green;
  regen PM cms-bundle.
- TODO: **Shared LOCALE SELECTOR for all per-locale editing (scales past 2-3 languages).** USER DECISION
  2026-06-19: stacking every content locale vertically doesn't scale (20 languages = unusable — see the SEO
  tab stacking EN/FI/RO-RO). Replace with a single locale SELECTOR (tabs or dropdown) that shows ONLY the
  selected locale's fields; one shared component used EVERYWHERE per-locale content is edited, so the UX is
  identical across the app. Today FOUR+ places stack locales: SEO form + `ComponentSettings`
  (page-builder-shell.tsx), `pages-manager.tsx`, `pages/block-editor.tsx` (all use `localeFieldValue`/
  `setLocalizedProp`/`locales.map`). Build a reusable `LocalePicker` (active locale state + a small
  `<LocaleField>` wrapper or hook) and refactor the SEO form + `ComponentSettings` to use it first (the two
  in the builder); note the C2 `pages-manager`/`block-editor` as follow-on adopters. Default to the Site's
  default content locale; keep `setLocalizedProp` (storage unchanged — still `{en,fi,…}` maps). This is the
  KEYSTONE for "same approach everywhere" (the AI-translate button + meta-image-per-locale below sit on it).
  Pure state/helpers tested. i18n EN/FI/ET. Gate: CMS tsc + opennext build green; regen PM cms-bundle.
- TODO: **SEO: per-locale META IMAGE (OG image) — new field on the SEO tab.** Add a per-locale meta/OG image
  to page SEO (an image with baked-in text may need a different asset per language). Schema: new
  `meta_image text("meta_image").notNull().default("{}")` JSON map on `page` (drizzle migration), mirroring
  `meta_title`/`meta_description`; thread through `validatePageMeta` + the `PUT /api/pages` full-meta path
  (`upsertPageMeta`) — do NOT fork a new page-store path. SEO form gets a per-locale image PICKER reusing the
  EXISTING media gallery/assets (`components/media/media-gallery.tsx`, `GET /api/assets`) — store the asset
  URL/id per locale via `setLocalizedProp`. Renders through the LOCALE SELECTOR (one locale at a time). Public
  render: emit `og:image` from the resolved-locale value. Depends on the locale-selector task. Pure
  validate/merge tested. i18n EN/FI/ET. Gate: CMS tsc + opennext build green; regen PM cms-bundle.
- TODO: **Page tab — publish/unpublish + delete page (fill the empty Page tab).** The right-rail Page tab is
  a placeholder today (`pageEmpty` — page-builder-shell.tsx ~599-600). Wire it for the SELECTED page using
  EXISTING backends (no new APIs): a PUBLISH/UNPUBLISH toggle (flips `publishStatus` draft↔published via the
  existing `PUT /api/pages` full-meta path — `upsertPageMeta` already persists publishStatus; the SEO form
  shows the round-trip pattern), and a DELETE PAGE action (`deletePage` / `DELETE /api/pages/[id]`) behind an
  in-app confirm (NOT native `window.confirm` — blocks browser automation per CLAUDE.md), which clears the
  builder selection after delete. EN/FI/ET for labels + confirm copy. Gate: CMS tsc + opennext build green;
  regen PM cms-bundle.
  - COORDINATE with the PAGE VERSIONING track: that track adds a separate top-bar PUBLISH (publish =
    snapshot draft → new published version + fresh draft) alongside Save (Save = save to draft). When
    versioning lands, this tab's publish/unpublish should
    reconcile with the versioned publish (publish here = publish current draft; unpublish = take the page
    offline). Build the simple toggle now; the versioning slices fold it in. Don't duplicate publish logic.
- TODO: **Responsive Section columns — auto-stack when there isn't room.** BUG-ish: the Section grid uses a
  FIXED `gridTemplateColumns: repeat(N, 1fr)` (`tree.ts` planSection ~474–490) so on tablet/mobile the
  columns DON'T stack — they crush/overlap/overflow (see the mobile preview: column 2 sits on top of column
  1). Make the grid responsive so columns drop one-below-the-other when the viewport is too narrow. Use a
  grid that wraps WITHOUT media queries (the renderer emits INLINE styles — inline can't hold `@media`, but
  CAN do `repeat(auto-fit, minmax(<min>, 1fr))`), e.g. `repeat(auto-fit, minmax(min(100%, <minColPx>), 1fr))`
  so narrow viewports collapse to one column. Keep the `collapse` (empty-col 0fr) behavior. Decide the
  per-column min width (a sane default, e.g. ~16rem; could later be a Section prop). If a true breakpoint
  switch is needed instead of auto-fit, the renderer would need a real CSS class/stylesheet path (NOT inline)
  — note that tradeoff in JOURNAL; prefer the inline auto-fit solution first (lazy + no infra change). Update
  the section-render test. Gate: CMS tsc + opennext build green; regen PM cms-bundle.
- TODO: **Per-viewport column visibility — hide a column on desktop/tablet/mobile.** For real
  responsiveness the operator wants to HIDE a specific column at a given breakpoint (e.g. drop a column on
  mobile). Add per-column visibility props (e.g. `hideOnMobile`/`hideOnTablet`/`hideOnDesktop`, all default
  visible) edited in the Column settings panel (see the "Column settings panel" task — add a VISIBILITY
  control there; coordinate so it's one panel, not two). Render side (`tree.ts` planColumn): hide a column on
  the matching breakpoint. IMPLEMENTATION NOTE: inline styles can't do `@media`, so breakpoint-conditional
  display needs either (a) responsive utility CLASSES on the column cell (Tailwind `hidden md:block` etc. —
  preferred, the project uses Tailwind) or (b) a real stylesheet — do NOT try to fake it with inline media
  queries. The page-builder's own viewport toggle (Desktop/Tablet/Mobile) should reflect the hidden state in
  Preview. Depends on the Column settings panel + benefits from the responsive-grid task. Pure mapping
  (props→classes) tested. i18n EN/FI/ET. Gate: CMS tsc + opennext build green; regen PM cms-bundle.
- TODO: **Delete a SPECIFIC column (discard its components) — distinct from shrink-reflow.** The COLUMNS
  segmented control's shrink (`setSectionColumns`, page-blocks.ts ~461) keeps content — it reflows a removed
  column's components into the LAST kept column. KEEP that (the user likes it). This task adds the OTHER
  operation: delete COLUMN N specifically, DISCARDING its components, e.g. so a 2-col Section keeps column 2
  and drops column 1. Add a pure `deleteColumn(blocks, columnId)` to page-blocks.ts that: removes that
  `__section_column__` child AND DECREMENTS the parent Section's `props.columns` to match (so the grid
  recomputes — do NOT leave columns out of sync; this is why plain `removeNode` is wrong here). Clamp: a
  Section must keep ≥1 column (deleting the last column deletes nothing, or is disallowed — pick + note).
  Node test: delete col 1 of 2 → col 2's components survive as the sole column, `columns`==1; deleting the
  only column is a no-op/guarded. WIRE: a delete (trash) affordance on each COLUMN node in `LayersTree`
  (`page-builder-shell.tsx`) → in-app confirm (NOT native `window.confirm` — blocks browser automation per
  CLAUDE.md, off-brand) → `deleteColumn`. Coordinate with the "Delete nodes in the Layers tree" task (same
  confirm component + trash pattern). i18n EN/FI/ET ("Delete column?"). Gate: CMS tsc + opennext build green;
  regen PM cms-bundle.
- TODO: **Column settings panel — per-column alignment / padding / margin / gap / background.** Today
  selecting a `__section_column__` node in the Layers tree shows nothing (the Block tab falls through to
  `blockEmpty` — see the `isSectionColumn(sel)` branch in `page-builder-shell.tsx` ~586), and columns render
  with alignment INHERITED from the Section (`tree.ts` ~508–527 passes the Section's `alignItems`/
  `justifyContent` in; columns hold no own props). Add a `ColumnSettings` panel (sibling to `SectionSettings`,
  reuse its controls) shown when a column is selected, editing the column block's OWN `props`:
  - CONTENT ALIGNMENT (3×3 vertical×horizontal) — overrides the Section default for THIS column.
  - PADDING (4 sides, sharing the single `paddingUnit` switch — see the shared-unit task).
  - MARGIN (4 sides; new vs Section — meaningful for a column; same unit treatment).
  - GAP (px) between the column's stacked components.
  - BACKGROUND (theme swatches, transparent default).
  - MAX WIDTH: the user is unsure it makes sense — it DOESN'T for a grid-track column; OMIT it (note in
    JOURNAL) unless the user later asks.
  Render side: `tree.ts` column planning reads these per-column props (own align overrides Section; apply
  padding/margin/gap/bg on the column cell). Pure `mergeColumnProps(blocks,colId,patch)` (mirror
  `mergeSectionProps`) + node test. Persists via the existing block PUT / draft auto-save. i18n EN/FI/ET.
  Gate: CMS tsc + opennext build green; regen PM cms-bundle.
- TODO: **Delete nodes in the Layers tree — component or whole Section, with a confirm prompt.** In
  `LayersTree` (`page-builder-shell.tsx`) add a delete affordance (trash icon, on hover/selection) on each
  Section node AND each component node; clicking it removes that node. The data layer ALREADY has it:
  nested-safe `removeNode(blocks, id)` in `lib/pages/page-blocks.ts` (line ~645) — wire the button to it via
  `setBlocks`; no new tree logic, no new test (helper already proven by the move slice). CONFIRM PROMPT:
  show an in-app confirmation before deleting (e.g. a small confirm popover/modal using the design system) —
  do NOT use the native `window.confirm`/`alert` (blocks the browser-automation session per CLAUDE.md, and
  off-brand). Deleting a Section removes it and its columns+children; deleting a component removes just that
  block. EN/FI/ET for the button + confirm copy ("Delete section?", "Delete component?", Cancel/Delete).
  Gate: CMS tsc + opennext build green; regen PM cms-bundle.
- TODO: **Section padding — ONE shared rem/px unit switch (not per-side).** USER DECISION 2026-06-19: the
  current per-side unit toggle (shipped: `paddingTopUnit`/`Right`/`Bottom`/`Left`, rem default) lets units
  get MIXED across the four padding inputs. Replace with a SINGLE unit switch governing ALL padding inputs,
  so Top/Right/Bottom/Left always share one unit. Change: `SectionSettings` in `page-builder-shell.tsx`
  (~1326) renders one rem/px switch near the PADDING legend instead of four; store a single `paddingUnit`
  prop (rem default). Render side `tree.ts` `pad()` (~452–454) reads the single `paddingUnit` for every side
  (drop the per-side `padding<Side>Unit`). MIGRATE: treat any existing per-side unit as the shared one (use
  Top's, or default rem) so saved pages don't break. GAP stays px (it's labeled "(PX)") — out of scope
  unless extended later. Update the section-render test for the single-unit output. Gate: CMS tsc + opennext
  build green; regen PM cms-bundle. EN/FI/ET if chrome changes.
> PAGE VERSIONING (USER DECISION 2026-06-19): drafts + published history via a SEPARATE `page_version`
> table. Behavior the user wants (REFINED 2026-06-19): (1) editing auto-persists to the DRAFT with a debounce
> (no work lost if the user closes the tab) AND a manual SAVE button stays that forces an immediate draft
> save — BOTH always save to the DRAFT, never publish. Top bar = [Save] [Publish]. (2) A new page is created
> as a draft; if no draft exists, opening/editing creates one immediately. (3) PUBLISH snapshots the current
> draft into a new published VERSION and then AUTOMATICALLY creates a fresh draft (copied from what was just
> published) so the user keeps editing seamlessly. (4) Published history is kept; you can create a NEW draft
> from any PAST version and republish it as a new version (or edit then republish). TODAY (the gap): `page`
> has ONE
> `blocks` column + a `publishStatus` flag (`db/schema.ts`); the builder PUTs blocks via
> `/api/pages/[id]/blocks` (`setPageBlocks`); the public route renders only if
> `publishStatus==="published"` (`app/[[...slug]]/page.tsx:47`). MODEL: `page_version(id, page_id, blocks,
> meta, status:draft|published, version_no, created_at)`; `page` gains `draft_version_id` (editable now) +
> `published_version_id` (live). publish = copy draft → new published version; restore = copy old version →
> new draft. Slices below — do in order; slice 1 (schema+store) gates all.

- TODO: **Versioning slice 1 — schema + version store (pure/data first, no UI).** Add the `page_version`
  table + `page.draft_version_id`/`page.published_version_id` (drizzle migration). Version-store functions in
  `db/page-store.ts` (or a new `db/page-version-store.ts`): `getDraft(pageId)` (create-if-absent from the
  current published version or empty), `saveDraftBlocks(pageId, blocks)` (writes the DRAFT version, no
  publish), `publishDraft(pageId)` (snapshot draft → a new published version, bump `version_no`, set
  `published_version_id`, THEN create a fresh draft copied from the just-published version so editing
  continues — per REFINED behavior 3), `listVersions(pageId)`, `newDraftFromVersion(pageId, versionId)` (copy an old
  version into a fresh draft). Keep block validation (`validateBlocks`). Migration must backfill: existing
  `page.blocks` → one published version (if published) + a draft. Pure helpers (version_no bump, snapshot
  copy) unit-tested. Gate: CMS tsc + opennext build green; regen PM cms-bundle.
- TODO: **Versioning slice 2 — public + preview routes read the right version.** Public route
  (`app/[[...slug]]/page.tsx`) renders the PUBLISHED version (`published_version_id`), not `page.blocks`;
  if none published → still 404/unpublished as today. The builder's draft-preview route (`/preview/[id]`)
  renders (USER DECISION 2026-06-19): the DRAFT version if one exists; ELSE (e.g. just published, no draft
  yet) the PUBLISHED version — i.e. preview always shows the latest editable state, falling back to live.
  Reuse the SAME render pipeline (`render-page.tsx`) — only the block SOURCE changes. AUTO-REFRESH: the
  preview must reflect the current draft WITHOUT any button press. Today the iframe only reloads on
  `onSave()` via `previewNonce` (page-builder-shell.tsx ~142/245); rework so it refreshes automatically as
  the draft changes — bump `previewNonce` after each debounced draft auto-save (coordinate with slice 3's
  auto-save), so editing → preview updates on its own. Remove the manual-Save dependency. Depends on slice 1
  (+ couples with slice 3). Gate: CMS tsc + opennext build green; regen PM cms-bundle.
- TODO: **Versioning slice 3 — auto-save to draft (debounced) + manual Save + separate Publish.** USER
  DECISION 2026-06-19 (belt-and-suspenders, so no one loses work): in `page-builder-shell.tsx`,
  (a) every edit (blocks/section/component change) auto-persists to the DRAFT via `saveDraftBlocks` with a
  DEBOUNCE; (b) the top-bar **Save** button STAYS and forces an immediate draft save (same `saveDraftBlocks`,
  no debounce) — Save ALWAYS saves to draft, never publishes; (c) a separate **Publish** button calls
  `publishDraft` (snapshot version + auto-create fresh draft, slice 1). Top bar = [Save] [Publish]. Opening a
  page with no draft creates one immediately (slice-1 `getDraft`); a NEW page is created as a draft. Show
  draft status (saving… / saved / published). Because of auto-save, work survives closing the tab WITHOUT a
  save click — but keep Save for explicit confidence. Keep undo/redo local. Depends on slices 1–2. i18n
  EN/FI/ET (Save, Publish, saving, saved, published). Gate: CMS tsc + opennext build green; regen PM cms-bundle.
- TODO: **Versioning slice 4 — version history UI + restore/republish.** A history view (top bar or the
  Page tab) listing published versions (version_no + timestamp) via `listVersions`; actions: open a past
  version read-only, and **"Create draft from this version"** (`newDraftFromVersion`) → loads it as the
  editable draft so the user can edit + Publish it as a new version. Depends on slices 1–3. i18n EN/FI/ET.
  Gate: CMS tsc + opennext build green; regen PM cms-bundle.
- TODO: **Component multilingual UX — "AI translate" button (manual per-locale already DONE).** The Block
  tab's `ComponentSettings` (page-builder-shell.tsx ~1434) ALREADY renders translatable string/richtext
  props one input per content locale (writes `{loc:text}` via `setLocalizedProp`) — manual translation is
  done; that's why a single-locale Site shows one field. THIS task adds the AUTO path: a "Translate with AI"
  button (per translatable field, or one per-component "translate all") that fills EVERY configured content
  locale from the source-locale value, so the user can push one button and let AI do it — review is OPTIONAL,
  not mandatory. Reuse the ai-assistant goal's `POST /api/translate` engine (do NOT add a second model
  client; it goes through the same AI Gateway). On success, merge the returned `{loc:text}` maps into the
  block props and let the user edit/review before Save. Loading + error states; EN/FI/ET for the button
  chrome. Place the button within the shared LOCALE SELECTOR UX (see that task) so it fits "same approach
  everywhere" — one-button = translate the source locale into all others. >>> BLOCKED-UNTIL: the ai-assistant
  goal's "Programmatic AI-translate endpoint" task ships (`POST /api/translate`). Do this AFTER that so it
  can reuse the endpoint. Gate: CMS tsc + opennext build green; regen PM cms-bundle.
- TODO: **Schema field types for DATE and TIME — custom date/time inputs in the Block tab.** Today a
  component's date is a plain string (`BlogPostHeader.date` = `{type:"string", default:"January 1, 2026"}`),
  edited as free text in `ComponentSettings`. Add `"date"` and `"time"` to the propsSchema field-type vocab
  so a component can declare a prop AS a date/time and get a proper picker instead of a text box:
  - `lib/pages/page-blocks.ts` `parsePropsSchema`: accept `type:"date"` / `type:"time"` (extend the
    `PropField` union; unknown still degrades to string). `validateBlockProps`: validate/normalize the
    stored value (ISO `YYYY-MM-DD` for date, `HH:mm` for time — keep storage locale-agnostic; DISPLAY
    formatting is the component's job at render). Date/time are NOT translatable.
  - `ComponentSettings`: render `<input type="date">` / `<input type="time">` (native, no dep) for those
    field types, pre-filled from the stored ISO value.
  - Migrate the obvious kit props to the new types (e.g. `BlogPostHeader.date`, `BlogPostListItem.date`
    → `type:"date"`) so they get the picker; markup unchanged.
  Add node tests for the parse + validate of date/time. Gate: CMS tsc + opennext build green; regen PM
  cms-bundle. EN/FI/ET for any new chrome.
