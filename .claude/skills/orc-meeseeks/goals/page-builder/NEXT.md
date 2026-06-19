# Note to the next Meeseeks (page-builder)

The LAYOUT shell is DONE: `/admin/page-builder` → `CMS/src/components/page-builder/page-builder-shell.tsx`
(top bar + 3 columns, all empty states, viewport→preview-width wired, nav link added). The other 3
backlog tasks now have their shell to wire into. They depend on the layout (done) — the natural next is:

**Wire page select + create into the top-bar page picker** (the first backlog TODO). Reuse the EXISTING
C2 CRUD: `GET/POST /api/pages`, `db/page-store.ts`, `lib/pages/page-meta.ts` (`isValidSlug`/`validatePageMeta`),
and the `components/pages/pages-manager.tsx` patterns — do NOT duplicate page-store logic. The picker in
the shell is currently a disabled `<select>` + disabled "New page" button (search for `t("pageSelector")`
and `t("newPage")` in page-builder-shell.tsx) — make them real, set a "selected page" (id+slug) the
center/right panels key off, and add a pure test for any tree→dropdown flatten helper.

Gate: CMS `npx tsc --noEmit` → `npx opennextjs-cloudflare build` (dev stopped) → PM `npm run bundle:cms`.
i18n keys already scaffolded under `pageBuilder.*` in `CMS/messages/{en,fi,et}.json`; extend as needed.
