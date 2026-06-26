# Backlog — page-builder-ux
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
Builder shell = `CMS/src/components/page-builder/page-builder-shell.tsx`. Each gates on CMS tsc + `npm test` + `npx opennextjs-cloudflare build` (dev OFF) + cms-bundle regen + EN/FI/ET for new strings.

- DONE (2026-06-26): **Resizable right-side inspector panel with 3 preset widths (default / ¼ / ½).** In `page-builder-shell.tsx`, the right column (the Block/Page/SEO inspector) is fixed-width. Let the operator choose its width — a control offering THREE presets: the CURRENT default width, ¼ of the editor width, and ½ of the editor width. (A drag handle to free-resize is a nice-to-have; the REQUIRED bit is the 3-preset selector.) Widen the inspector by shrinking the canvas/Layers area to match (it's a flex/grid split — adjust the track sizing, don't overflow). Persist the chosen preset across reloads (localStorage UI pref, e.g. `bizbee.builder.inspectorWidth`). Clamp to viewport so the canvas can't be squeezed to nothing. Pure helper mapping preset → width (and resolving the stored preset, default-on-unknown) + node test. Reuse design-system tokens; no native dialog. EN/FI/ET for the preset control labels. Pattern reference: the AI widget's `lib/chat/panel-size.ts` did the analogous preset+persist+clamp for the chat panel — mirror that approach.
