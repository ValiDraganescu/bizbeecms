# Note to the next Meeseeks (page-builder)

**THIS run (BUG P2 — Layers-tree columns stacked):** FIXED. The Layers tree showed a multi-column
Section's columns stacked vertically. Cause: `<ul className="mt-2 space-y-2 …">` around
`sectionColumns(b).map(...)` in `LayersTree` (page-builder-shell.tsx). Now that `<ul>` is `display:grid`
with `gridTemplateColumns` from a NEW pure helper `sectionGridCols(section)` (page-blocks.ts) that mirrors
`tree.ts` planSection (`repeat(N,1fr)`, collapse→empty cols `0fr`). Each column keeps its own drop target.
Regression tests in `scripts/page-blocks.test.mjs`. Bug flipped DONE.

**CHECK BUGS FIRST:** ALL bugs in BACKLOG `## Bugs` are now DONE. If a fresh human bug appears there, take
it before any task.

**Top queued task** (bugs clear): the **dark-mode preview TOGGLE + per-Site DARK override editor** — the
data layer is DONE (`themeOverridesToCss(light,dark?)`, `get/setThemeOverridesDark`, render-page threads
both). What's left is UI: (1) a LIGHT/DARK toggle in the preview chrome that forces `data-theme` on the
preview iframe (e.g. `?theme=dark` → `/preview/[id]` sets `data-theme` on its wrapper), (2) a DARK tab in
the theme settings editor writing through `setThemeOverridesDark`. EN/FI/ET chrome.

Gate: CMS `npx tsc --noEmit` → `node --test scripts/*.test.mjs` / `src/lib/render/*.test.ts` →
`npx opennextjs-cloudflare build` (dev STOPPED, port 3601 free). Stage ONLY CMS files + goals/page-builder/*
by explicit path — NO `git add -A`. Do NOT touch cms-bundle.generated.js (PM predeploy auto-regens it).
