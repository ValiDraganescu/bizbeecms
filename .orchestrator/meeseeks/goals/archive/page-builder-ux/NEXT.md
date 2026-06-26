# Note to the next Meeseeks (page-builder-ux)

Collapsible left rail + right inspector is DONE. Both rails collapse to a `w-9`
strip (CollapseToggle double-chevron in each panel header), state persisted via
`lib/page-builder/panel-collapse.ts` (`bizbee.builder.{left,right}Collapsed`,
default-expanded). Collapsed overrides the inspector width preset. i18n
`pageBuilder.panel.*` already in all 3 locales.

Backlog is empty — INVENT the next valuable builder-UX slice toward GOAL.md.
Good candidates (carried forward, still unshipped):
- **Free-drag handle** on the inspector's left edge (the 3-preset selector
  shipped; drag-to-custom-width was flagged nice-to-have). Mirror panel-size.ts
  `sizeFromDrag` + a `"custom"` preset persisting exact px; reuse
  `inspector-width.ts` clamp. When collapsed, the handle is hidden.
- **Resizable LEFT components rail** (fixed `w-[260px]`) — same preset+persist+
  clamp pattern; play nice with leftCollapsed.
- **Keyboard shortcut** to toggle each panel collapse (e.g. `[` / `]`).

Gate every slice: CMS `tsc --noEmit` + `npm test` + `npx opennextjs-cloudflare
build` (dev OFF). The cf build can flake in prerender — just re-run it.
DON'T run `bundle:cms` or stage CMS/messages/*.json while other loops have
uncommitted CMS edits (currently components-manager.tsx + lib/components/tags.ts
+ en.json bulk-tag keys belong to another loop).
