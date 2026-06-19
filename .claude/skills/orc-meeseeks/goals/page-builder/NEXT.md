# Note to the next Meeseeks (page-builder)

**THIS run (SEO per-locale META IMAGE / OG image):** DONE. New `metaImage` JSON-map column on `page`
(migration `0004_past_drax.sql`, mirrors meta_title) threaded through the SAME meta path — NOT forked:
`validatePageMeta`/`buildSeoMetaBody` (now 4-arg) + `upsertPageMeta` (insert+update). SEO form got
`MetaImagePicker` (page-builder-shell.tsx) — per-ACTIVE-locale, browses `GET /api/assets` (R2 lib, same
source as media-gallery) in a thumbnail grid, set/remove. `app/[[...slug]]/page.tsx generateMetadata`
emits `openGraph.images:[{url}]` from the locale-resolved map (omitted when empty). C2 pages-manager Draft
round-trips metaImage (no editor there) so a C2 metadata edit doesn't wipe a builder-set image.
REMINDER: apply migration 0004 via `wrangler d1 migrations apply` before this ships to a Site.

**CHECK BUGS FIRST:** ALL bugs in BACKLOG `## Bugs` are DONE. If a fresh human bug appears, take it first.

**BUILD IS GREEN AGAIN:** `npx tsc --noEmit` and `npx opennextjs-cloudflare build` both pass fully (the
ai-assistant chat/route.ts that used to break the build now type-checks). No more "build halts on their
file" caveat — if a build fails on a non-page-builder file, re-check, but it's clean as of 20:44.

**Top queued tasks** (bugs clear) — pick the highest:
- **Adopt `<LocalePicker>` in C2** — `pages-manager.tsx` + `pages/block-editor.tsx` still stack locales;
  swap to `useLocalePicker`/`<LocalePicker>` for app-wide consistency (keystone exists). NOTE
  pages-manager now also carries `metaImage` in its Draft — if you add a LocalePicker there, you COULD
  surface a per-locale OG image editor too (today it only round-trips).
- **Page tab — publish/unpublish + delete page** (fill the empty Page tab).
- **Responsive Section columns — auto-stack when there isn't room** (`repeat(auto-fit, minmax(...))`).

Gate: CMS `npx tsc --noEmit` → relevant `scripts/*.test.mjs` + `src/lib/**/*.test.ts` →
`npx opennextjs-cloudflare build` (dev STOPPED, port 3601 free). Stage ONLY CMS files +
`goals/page-builder/*` by EXPLICIT PATH — NO `git add -A`. Do NOT touch cms-bundle.generated.js (PM
predeploy auto-regens) or other loops' files (custom-domains/, router/, ProjectManager/, the ai-assistant
chat files — note chat/route.ts shows `M` but is NOT yours).
