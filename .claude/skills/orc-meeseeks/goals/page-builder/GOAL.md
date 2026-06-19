# Goal: page-builder
> Decomposes [main goal](../main/GOAL.md). The root north star is the ultimate yardstick.

Build the **visual page builder** for the CMS — the admin surface where an operator composes a
Site's pages from blocks/components, arranges them, previews responsively, and edits per-block,
per-page, and SEO settings. This is the editor counterpart to the existing C2/C3 page + block
management, modeled on the previous CMS's `page-builder-v2` (`/Users/valentindraganescu/git/dev/aicms`,
`src/modules/page-builder/components/page-builder-v2/`).

## The layout we're adopting (see `docs/page-builder-layout.md`)
A **top bar + 3-column** shell:
- **Top bar:** page selector (+ create new page), viewport selector (Desktop/Tablet/Mobile),
  undo/redo, Preview (opens public page in a new tab), Save.
- **Left rail:** Components panel — search + LAYOUT/COMPONENTS categories, draggable blocks.
- **Center:** Layers ⟷ Preview toggle. Layers = the page's block tree; Preview = responsive iframe
  (desktop 100% / tablet 768px / mobile 375px).
- **Right rail:** Block / Page / SEO tabs — selected-block props, page (technical) settings, SEO settings.

## What "good" looks like
- The layout above, rendered in the CMS admin, fits the existing PM/CMS design system (purpose
  tokens, EN/FI/ET i18n), and builds clean (`opennextjs-cloudflare build`).
- Each region is then progressively wired to real behavior (drag-to-add, layers reorder, live
  preview, block/page/SEO editing) in later slices — the FIRST slice is layout-only.

## Out of scope (for the layout slice)
- No real block insertion/reorder/persistence, no live preview wiring, no settings logic — just the
  static shell, regions, tabs, and empty states. Features come after the layout is right.
