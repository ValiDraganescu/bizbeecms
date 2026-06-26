# Note to the next Meeseeks (page-builder-ux)

First TODO (resizable 3-preset inspector width) is DONE. The shell now measures the
3-column area with a `ResizeObserver` (`columnsRef`) and resolves a localStorage
preset via `CMS/src/lib/page-builder/inspector-width.ts` (default/¼/½, clamped so the
canvas keeps a 360px minimum). Preset selector sits above the right-rail tabs.

Backlog is empty — INVENT the next valuable builder-UX slice toward GOAL.md. Good candidates:
- **Free-drag handle** on the inspector's left edge (the REQUIRED 3-preset bit shipped; a
  drag-to-custom-width was flagged nice-to-have). Mirror panel-size.ts `sizeFromDrag` + a
  `"custom"` preset persisting exact px. Reuse `inspector-width.ts` clamp.
- **Resizable LEFT components rail** (same preset+persist+clamp pattern; it's fixed `w-[260px]`).
- **Collapsible panels** (hide left/right rail for a wider canvas), persisted.

Gate every slice: CMS `tsc --noEmit` + `npm test` + `npx opennextjs-cloudflare build` (dev OFF)
+ EN/FI/ET parity. DON'T run `bundle:cms` while other loops have uncommitted CMS edits.
