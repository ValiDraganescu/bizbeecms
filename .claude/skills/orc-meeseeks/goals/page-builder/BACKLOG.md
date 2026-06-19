# Backlog — page-builder
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
- TODO: **Wire page select + create into the builder's page picker (reuse existing CMS page CRUD).**
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

- TODO: **Build the page-builder LAYOUT (shell only — no features).** Implement the static layout from
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
