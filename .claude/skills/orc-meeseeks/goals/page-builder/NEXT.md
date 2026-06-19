# Note to the next Meeseeks (page-builder)

**THIS run (KEYSTONE — shared LOCALE SELECTOR):** DONE. Built reusable
`CMS/src/components/page-builder/locale-picker.tsx` — `useLocalePicker(locales)` (active-locale state,
defaults to Site-default/first locale, falls back if the active locale leaves the set) + `<LocalePicker>`
control (renders nothing for 1 locale, TABS ≤4 locales, `<select>` beyond). Storage UNCHANGED — still
`{en,fi,…}` maps; the picker is just a VIEW over ONE locale. Refactored the two builder forms in
`page-builder-shell.tsx` (`SeoForm`, `ComponentSettings`) to show only the active locale instead of
stacking all. i18n `localePickerLabel` in EN/FI/ET. Test: `node --test scripts/locale-picker.test.mjs` 4/4.

**CHECK BUGS FIRST:** ALL bugs in BACKLOG `## Bugs` are DONE. If a fresh human bug appears, take it first.

**BUILD CAVEAT (still live this session):** `npx opennextjs-cloudflare build` currently FAILS on the
AI-ASSISTANT loop's WIP `src/app/api/chat/route.ts` (5 tsc errors there, `M`/`??` in git status — NOT a
page-builder file). It halts before reaching any page-builder code. Don't touch their file. Verify YOUR
work with `npx tsc --noEmit 2>&1 | grep <your-paths>` (must be empty) + node tests. Once their loop fixes
chat/route.ts, the full build should pass again.

**Top queued tasks** (bugs clear) — pick the highest:
- **Adopt `<LocalePicker>` in C2** — `pages-manager.tsx` + `pages/block-editor.tsx` still stack locales;
  swap them to `useLocalePicker`/`<LocalePicker>` for full app-wide consistency (the keystone now exists).
- **SEO: per-locale META IMAGE (OG image)** — new field on the SEO tab; renders through the LocalePicker.
- **Page tab — publish/unpublish + delete page** (fill the empty Page tab).
- **Responsive Section columns — auto-stack when there isn't room** (`repeat(auto-fit, minmax(...))`).

Gate: CMS `npx tsc --noEmit` (filter to your files) → relevant `scripts/*.test.mjs` →
`npx opennextjs-cloudflare build` (dev STOPPED, port 3601 free) — expect it to fail ONLY on chat/route.ts
until ai-assistant fixes it. Stage ONLY CMS files + `goals/page-builder/*` by EXPLICIT PATH — NO
`git add -A`. Do NOT touch cms-bundle.generated.js (PM predeploy auto-regens) or other loops' files
(custom-domains/, router/, ProjectManager/, the AI-assistant chat files).
