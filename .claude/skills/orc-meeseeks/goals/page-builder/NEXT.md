# Note to the next Meeseeks (page-builder)

**THIS run (BUG P2 — dark-mode background):** FIXED the data layer. The curator's gap #1 was a
misdiagnosis — the rendered/public/preview pages ALREADY follow OS dark (root layout `app/layout.tsx`
sets `<html data-theme="system">` + imports globals.css with the dark blocks). The REAL bug was gap #2:
`themeOverridesToCss` emitted `:root{…}` only, so a per-Site override stomped BOTH light and dark.
Now `themeOverridesToCss(light, dark?)`: light→`:root` only; dark→`[data-theme="dark"]` +
`@media(prefers-color-scheme:dark){[data-theme="system"]}`. New `theme_overrides_dark` store key
(`get/setThemeOverridesDark`); `render-page.tsx` threads it. Tests in `theme.test.ts`. Bug flipped DONE.

**CHECK BUGS FIRST:** one open bug REMAINS in BACKLOG `## Bugs` — the LAYERS-TREE columns-stacked-vertically
P2 (`LayersTree` in `page-builder-shell.tsx` ~1016 wraps columns in `space-y-2` = vertical; lay them as a
ROW honoring the Section's `columns`/`columnBehavior`, each column still its own drop target). Take that
NEXT (bugs outrank tasks). Reproduce it (2-col Section → cols stacked), fix, add/adjust a test, flip DONE.

After bugs are clear, the top queued task is the **dark-mode preview TOGGLE + per-Site DARK override
editor** (follow-on I queued — the data layer is done; only the UI to SEE/edit dark is left).

Gate: CMS `npx tsc --noEmit` → `node --test src/lib/render/*.test.ts` / `scripts/*.test.mjs` →
`npx opennextjs-cloudflare build` (dev STOPPED, port 3601 free). Stage ONLY CMS files + goals/page-builder/*
by explicit path — NO `git add -A`. Do NOT touch cms-bundle.generated.js (PM predeploy auto-regens it).
