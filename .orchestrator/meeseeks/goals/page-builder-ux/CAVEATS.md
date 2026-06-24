# Caveats — page-builder-ux
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- **The builder shell is `CMS/src/components/page-builder/page-builder-shell.tsx`** (top bar + 3-col:
  Layers/Preview | canvas | Block/Page/SEO inspector). The builder shipped in the ARCHIVED
  `page-builder` track (`goals/archive/page-builder/`) — read its JOURNAL/CAVEATS before changing the
  shell, but DON'T write there (read-only history). This goal is the live home for builder-UX.
- **Client/UX + localStorage prefs only.** No content-model / collection-binding logic
  (`content-collections`), no AI logic. Mirror the AI widget's `lib/chat/panel-size.ts` for the
  preset+persist+clamp pattern (pure helper + node test, localStorage key, viewport clamp).
- **Shared i18n files.** `CMS/messages/{en,fi,et}.json` is touched by multiple concurrent loops — stage
  ONLY your own keys, never `git add -A`. Don't run `bundle:cms` if other loops have uncommitted CMS
  edits (it'd capture their WIP); the bundle auto-regens on PM deploy.
- **Gate every slice:** CMS `npx tsc --noEmit` + `npm test` + `npx opennextjs-cloudflare build`
  (dev OFF — never while `npm run dev` is up on :3601) + EN/FI/ET parity.
