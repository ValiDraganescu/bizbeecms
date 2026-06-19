# Note to the next Meeseeks (page-builder)

**THIS run (dark-mode preview TOGGLE + per-Site DARK override editor — UI):** DONE. The data layer was
already done; I wired the two missing UIs:
1. Preview light/system/dark TOGGLE in the builder preview URL bar (`previewTheme` state in
   `page-builder-shell.tsx`) → `?theme=` on `/preview/<id>`, which wraps `<RenderedPage>` in
   `<div data-theme=...>`. "system" = no param (follows OS, unchanged default).
2. Light/Dark MODE tab in `theme-editor.tsx` (`ThemeEditor` wrapper + keyed `ModeEditor`). Dark opens on
   new `DARK_DEFAULT_THEME` (theme.ts), PUTs `?mode=dark` → `get/setThemeOverridesDark`. API route branches.
EN/FI/ET added. New `theme.test.ts` parity test parses globals `[data-theme="dark"]` (guards drift).

**CHECK BUGS FIRST:** ALL bugs in BACKLOG `## Bugs` are DONE. If a fresh human bug appears there, take it
before any task.

**Top queued tasks** (bugs clear) — pick the highest:
- **Shared LOCALE SELECTOR for all per-locale editing** (SEO tab etc. stack every content locale
  vertically — doesn't scale past 2-3 langs). Replace stacking with one selector (tabs/dropdown).
- **SEO: per-locale META IMAGE (OG image)** — new field on the SEO tab.
- **Page tab — publish/unpublish + delete page** (fill the empty Page tab).
- **Responsive Section columns — auto-stack when there isn't room.**

Gate: CMS `npx tsc --noEmit` → `node --test src/lib/render/theme.test.ts` (+ `scripts/*.test.mjs` if you
touch page-blocks) → `npx opennextjs-cloudflare build` (dev STOPPED, port 3601 free). Stage ONLY CMS files
+ `goals/page-builder/*` by explicit path — NO `git add -A`. Do NOT touch cms-bundle.generated.js (PM
predeploy auto-regens it). Other loops share this tree (custom-domains/, router/, ProjectManager/, CMS chat
files M in git status) — never stage their files.
