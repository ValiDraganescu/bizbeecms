# Page Builder — layout reference

Documents the **layout** (shell/chrome) of the CMS page builder we're adopting. Modeled on the
previous CMS at `/Users/valentindraganescu/git/dev/aicms`
(`src/modules/page-builder/components/page-builder-v2/`). This file describes ONLY the layout —
the arrangement of regions and what each region contains — NOT the behavior/features behind them.

## Overall shell — top bar + 3 columns

```
┌─────────────────────────────────────────────────────────────────────────┐
│ TOP BAR                                                                   │
│  [Page selector ▾]      [Desktop|Tablet|Mobile] [↶ ↷]      [Preview][Save]│
├──────────────┬──────────────────────────────────────┬─────────────────────┤
│ LEFT RAIL    │ CENTER                                │ RIGHT RAIL          │
│ ~260px       │ flexible                              │ ~320px              │
│              │  ┌ [Layers | Preview] tab toggle ──┐  │  [Block|Page|SEO]   │
│ COMPONENTS   │  │                                  │  │                     │
│  search box  │  │  Layers: page block tree         │  │  Block: selected    │
│              │  │  Preview: responsive iframe      │  │    block's props     │
│  LAYOUT      │  │   (desktop 100% / tablet 768px / │  │  Page: page settings │
│   Section    │  │    mobile 375px), URL bar +      │  │    (technical)       │
│              │  │    refresh                       │  │  SEO: SEO settings   │
│  COMPONENTS  │  │                                  │  │                     │
│   (list,     │  └──────────────────────────────────┘  │                     │
│    draggable)│                                       │                     │
└──────────────┴──────────────────────────────────────┴─────────────────────┘
```

Root: `flex h-full flex-col`, bordered/rounded surface. Row 1 = top bar; row 2 = `flex flex-1`
three columns (left `w-[260px] shrink-0`, center `flex-1 min-w-0`, right `w-[320px] shrink-0`).

## Top bar
- **Left:** Page selector — a dropdown/combobox listing the site's pages (flattened tree, home =
  "(home)", others "/slug", with publish-status badges). Includes **Create new page** and per-page
  delete. (width ~`w-56`.)
- **Center:** Viewport selector — segmented `Desktop | Tablet | Mobile` (icons + labels) +
  **undo/redo** buttons.
- **Right:** **Preview** button (opens the live public page in a NEW tab) + **Save** button
  (accent, disabled when no page selected / while saving).

## Left rail — Components
- Header label "COMPONENTS" (mono, uppercase).
- **Search components** input.
- Two categories: **LAYOUT** (e.g. `Section`) and **COMPONENTS** (the full block/component list,
  e.g. Hero, Footer, ProductGrid, BlogList…). Each item is **draggable** onto the canvas.

## Center — Layers / Preview
- A **tab toggle: Layers | Preview** at the top of the center column.
- **Layers:** the page's block tree (page-structure diagram) — select / reorder / toggle
  block visibility. Empty state when no page selected ("Select a page to see its layers").
- **Preview:** responsive iframe of the live page. Width follows the viewport selector
  (**desktop 100% / tablet 768px / mobile 375px**); has a URL bar + refresh. Always mounted so the
  iframe stays alive; just shown/hidden by the tab.
- Empty state (no page): centered "Page Builder — Select a page from the top bar to start editing."

## Right rail — Block / Page / SEO tabs
- Tabbed: **Block | Page | SEO** (full-width tab list).
- **Block:** properties of the currently-selected block (empty state: "Select a block in the Layers
  panel to edit its properties.").
- **Page:** page settings — the page's technical/config settings (+ version history in the ref).
- **SEO:** the page's SEO settings.

## Reference file map (aicms)
- `page_builder_v2.tsx` — root 3-col shell
- `top_bar.tsx` — page selector + viewport + undo/redo + preview/save
- `page_selector.tsx`, `viewport_selector.tsx`
- `left_rail.tsx` → `left_rail_components.tsx` — components rail
- `center_canvas.tsx` — Layers/Preview tabs + responsive iframe; `left_rail_layers.tsx` (layers tree)
- `right_rail.tsx` → `right_rail_block_props.tsx` / `right_rail_page_settings.tsx` / `right_rail_seo.tsx`

> Note: in the reference, the **Layers** panel lives in the CENTER (toggled with Preview), and the
> LEFT rail is Components-only. The right rail is the Block/Page/SEO settings. This matches the
> requested layout.
