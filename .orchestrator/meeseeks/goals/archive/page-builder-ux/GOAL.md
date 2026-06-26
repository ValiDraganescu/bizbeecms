# Goal: page-builder-ux
> Decomposes [main goal](../main/GOAL.md). The root north star is the ultimate yardstick.

Ongoing UI/UX polish of the **CMS visual page builder** — the editor shell at
`CMS/src/components/page-builder/page-builder-shell.tsx` (top bar + 3-column layout:
Layers/Preview | canvas | Block/Page/SEO inspector). The builder itself shipped in the
archived `page-builder` track (`goals/archive/page-builder/`) — read its JOURNAL/CAVEATS for how
the shell is built before changing it. This goal is the LIVE home for builder-UX improvements;
the archived track is read-only history.

## Scope
- The builder shell layout + panels (resize, persisted layout prefs, ergonomics).
- Pure CLIENT/UX work + localStorage UI prefs. No content-model / collection-binding logic
  (that's `content-collections`), no provider/AI logic.

## What "good" looks like
- The builder gives the operator control over their workspace (resizable panels with sensible
  presets, persisted across reloads, clamped so nothing vanishes).
- Every change: design-system tokens, in-app (no native dialogs that break browser-review),
  EN/FI/ET for new strings, gated on CMS tsc + `npm test` + `npx opennextjs-cloudflare build`
  (dev OFF) + cms-bundle regen.

## Out of scope
- The AI chat widget UX — that's `ai-widget-ux`.
- Collections / binding behavior — `content-collections`.
- Re-architecting the builder — this is polish on the shipped shell.
