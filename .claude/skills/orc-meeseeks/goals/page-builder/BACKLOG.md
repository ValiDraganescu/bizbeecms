# Backlog — page-builder
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
- DONE (2026-06-19): **Make Save PERSIST — register reserved Section as a renderer primitive.**
  `SECTION_COMPONENT` now lives in `lib/render/tree.ts` (single source); `validateBlocks` deletes it
  from `componentNames` so the block PUT route's `missingComponents` no longer 409s on a page with
  Sections; `planPage` renders a Section block as a `<div data-section=...>` nesting its `children`.
  6/6 tests pass (`page-blocks-sections.test.ts`). NOTE: PM `npm run bundle:cms` regen deferred — the
  generated bundle file was being edited concurrently by another goal loop.

- DONE: **Wire page select + create into the builder's page picker (reuse existing CMS page CRUD).**
  Make the top-bar page picker actually load the Site's pages and let the operator pick one OR create a
  new page — reusing the EXISTING C2 page CRUD, not a new one. What already exists in `CMS/`:
  `GET/POST/PUT/DELETE /api/pages` (+ `/api/pages/[id]`), `db/page-store.ts`
  (`listPages`/`getPageById`/`upsertPageMeta`/`deletePage`), `lib/pages/page-meta.ts`
  (`validatePageMeta`/`isValidSlug`), and the `components/pages/pages-manager.tsx` UI.
  Scope this slice:
  - Page picker fetches `GET /api/pages` and lists them (slug + publish status); selecting one sets the
    builder's "selected page" (id + slug) — which the Layers/Preview/right-rail panels key off.
  - A "create new page" action in the picker → `POST /api/pages` (slug + title + parent, via the existing
    `upsertPageMeta` path / validate with `isValidSlug`), then auto-selects the new page.
  - Reuse the existing validation + REST; do NOT duplicate page-store logic. Keep it CF-native (REST +
    fetch, no server actions — see main CAVEATS) and localized EN/FI/ET.
  Out of scope here: block editing, live preview, page/SEO settings forms (later slices). Depends on the
  layout task below (the picker shell must exist first). Gate: CMS tsc + opennextjs build green; regen PM
  cms-bundle. Add/extend a pure test for any new picker helper (e.g. tree→dropdown flattening).

- DONE: **GAP-closer for the Components rail: tag components with their source kit + grouped listing
  endpoint.** First slice of the Components-rail task below — close the data GAP so the rail can group.
  Add a `sourceKit` column to the `component` table (drizzle migration), thread the kit id through the
  kit-install write path so installed kit components are tagged with their kit id, and expose
  `GET /api/components/grouped` (kits-with-their-components + an "ungrouped/individually-imported" group)
  backed by a PURE grouping helper (with a node test). The rail-UI rendering (groups, search, insert into
  section) stays in the task below. Reuse `upsertImportedComponent` + the kit registry — no second pipeline.

- DONE (render+search + insert both DONE 2026-06-19): **Components rail: show
  imported starter kits + their components, searchable, add into Sections (like aicms).**
  Make the builder's left Components rail the real component source, mirroring how aicms
  composes (`src/modules/page-builder/components/page-builder-v2/left_rail_components.tsx`): the operator
  adds **Sections**, and into a Section drops **components**. What this slice covers:
  - Render the Site's **starter kits** as expandable groups, each expanding to its components; plus a
    flat list / group of any individually-imported components. **Search components by name** (filter box).
  - Adding a component (drag or click) inserts it into the selected Section on the canvas; "Section" is a
    LAYOUT primitive that holds components (same model as aicms).
  - **GAP to close first:** today components are stored FLAT (`db/component-store.ts` `listComponents` has
    no `kit` field) and kits are 3 STATIC predefined kits (`GET /api/components/kit` → blog/landing/docs)
    that copy components in on install — there is NO per-Site record of "which kits are imported" or which
    component came from which kit. So this task must add kit↔component grouping: either tag imported
    components with their source kit id (extend `upsertImportedComponent` + a `kit` column/field, drizzle
    migration) OR expose an endpoint that returns installed kits grouped with their component names. Reuse
    the existing import gate (`parsePortableComponent`) + kit registry; do NOT fork a second component
    pipeline. The existing import/export of components (`/api/components`, `lib/components/portable.ts`)
    and kit install (`/api/components/kit`) stay as the way kits/components ENTER the Site — this task is
    about SURFACING them in the builder, grouped, and inserting them into sections.
  CF-native (REST + fetch), EN/FI/ET. Depends on the LAYOUT task (rail shell) and benefits from the
  page-select task (a selected page to insert into). Add pure tests for any grouping/flatten helper +
  search filter. Gate: CMS tsc + opennextjs build green; regen PM cms-bundle.
  STATUS: render + search DONE (rail-filter.ts/.test.ts, ComponentsRail in page-builder-shell.tsx). The
  remaining INSERT half is the task right below.

- DONE (2026-06-19): **Insert components into Sections — page block-tree store + drag/click insert.** The rail now
  renders kit groups + searchable component names, but the items are INERT (clicking a component does
  nothing — `ComponentsRail` in `page-builder-shell.tsx` has the `<li>`s draggable-styled only). This
  slice adds the editor's block tree: the selected page holds **Sections**, each Section holds
  **components** (aicms `page-builder-v2` section model). Make a "Section" added from the LAYOUT category,
  and a rail component click/drag insert into the SELECTED Section. Persist via the existing C2/C3 block
  REST — do NOT fork a new block pipeline. Add a pure tree-mutation helper + test (add-section,
  add-component-to-section, mirroring `page-picker`/`grouped` test style — relative `.ts` imports, node
  can't resolve `@/`). This is ALSO the prerequisite for the Center Layers tree (it renders the same tree).
  Gate: CMS tsc + opennext build green; regen PM cms-bundle. EN/FI/ET.

- TODO: **Center: Layers ⟷ Preview toggle — layers tree of sections+components, and a true-to-site
  preview.** Wire the center column's Layers/Preview tab (shell from the LAYOUT task) to real content,
  mirroring aicms `center_canvas.tsx` (both panels mounted, toggled by CSS so the iframe stays alive).
  - **Layers:** render the selected page's structure as a tree — all **Sections** and, nested under each,
    the **components** in that section (same model as the components-rail task / aicms `LeftRailLayers` +
    `page_structure_diagram`). Selecting a node sets the builder's selected block (drives the right rail);
    later slices add reorder/visibility — this slice is the tree + selection.
  - **Preview:** show the page rendered EXACTLY as the live website would — i.e. load the REAL public
    render route in an iframe (aicms points the iframe at the actual public URL, so it's pixel-identical
    because it IS the real renderer), honoring the viewport widths (desktop 100% / tablet 768px /
    mobile 375px) + a URL bar + refresh.
  - **GAP to close:** the bizbeecms public route `CMS/src/app/[[...slug]]/page.tsx` returns nothing unless
    `publishStatus === "published"` (line ~61), so an iframe of the real URL would be BLANK for the draft
    page being built. Add a preview/draft path so the builder can render an unpublished page exactly like
    production WITHOUT publishing it (e.g. a `?preview=<token>`/draft-allowed param the public route honors
    for an authed admin, or a dedicated `/preview/<id>` route that reuses the SAME render pipeline — do NOT
    fork a second renderer; true-to-site means reusing the real one).
  CF-native (REST + fetch), EN/FI/ET. Depends on the LAYOUT + page-select tasks. Add a pure test for any
  tree-build/flatten helper. Gate: CMS tsc + opennextjs build green; regen PM cms-bundle.

- TODO: **Right rail: page SEO settings form (reuse existing per-locale page SEO).** Fill the right
  rail's **SEO** tab (shell exists from the LAYOUT task) with a real form that edits the SELECTED page's
  SEO and saves it. Reuse what C2 already stores — do NOT invent new SEO fields/storage:
  - Fields: per-locale `metaTitle` + `metaDescription` (JSON maps on the `page` row, `db/schema.ts`
    `meta_title`/`meta_description`), validated by `lib/pages/page-meta.ts` `validatePageMeta`. The same
    pair is edited today in `components/pages/pages-manager.tsx` (the C2 SEO legend) and persisted via
    `PUT /api/pages/[id]`.
  - In the builder: when a page is selected, the SEO tab shows a per-content-locale title + description
    editor (locales come from the content-locale settings, like C2), pre-filled from the loaded page, and
    Save `PUT`s the full page meta back through the EXISTING route — no new page-store/validation path.
  - CF-native (REST + fetch); localize the field LABELS EN/FI/ET (the VALUES are per-content-locale
    content). Depends on the page-select task (needs a selected page) + the LAYOUT task (tab shell).
  - Richer SEO (canonical, OG image, noindex) is a SEPARATE later task + schema add — this slice is
    title + description, matching what exists. Gate: CMS tsc + opennextjs build green; regen PM cms-bundle.

- DONE: **Build the page-builder LAYOUT (shell only — no features).** Implement the static layout from
  `docs/page-builder-layout.md` in the CMS admin (e.g. `/admin/page-builder`), modeled on aicms
  `src/modules/page-builder/components/page-builder-v2/`. Deliver the **top bar + 3-column** shell:
  - **Top bar:** page-picker dropdown (lists pages, includes a "create new page" affordance) +
    viewport selector (Desktop / Tablet / Mobile, segmented) + undo/redo buttons + **Preview** button
    (opens the public site in a NEW tab) + **Save** button.
  - **Left rail (~260px):** Components panel — "Components" header, search input, LAYOUT + COMPONENTS
    category labels, a list of draggable component items (static placeholder list is fine this slice).
  - **Center (flex):** a **Layers | Preview** tab toggle. Layers = placeholder for the page block tree;
    Preview = responsive frame area honoring the viewport widths (desktop 100% / tablet 768px /
    mobile 375px). Show the empty state ("Select a page from the top bar to start editing").
  - **Right rail (~320px):** **Block | Page | SEO** tabs — Block = selected-block settings (empty
    state "Select a block in the Layers panel to edit its properties."), Page = page (technical)
    settings, SEO = SEO settings. Static panels this slice.
  LAYOUT ONLY: no real page loading, no drag-to-insert, no reorder, no live preview wiring, no settings
  logic — just the regions, tabs, empty states, and responsive frame sizing. Use this project's design
  system (purpose tokens, `src/components/ui`) and localize labels EN/FI/ET. Gate: CMS tsc +
  `opennextjs-cloudflare build` green; regen PM cms-bundle.
