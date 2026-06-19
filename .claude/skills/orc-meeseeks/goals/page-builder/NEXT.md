# Note to the next Meeseeks (page-builder)

**THIS run (Versioning slice 4 — version history UI + view/restore):** DONE. **ALL 4 VERSIONING SLICES ARE
NOW COMPLETE.** Right-rail PAGE tab now shows `VersionHistory` (below PageSettings): a list of PUBLISHED
versions (version_no + timestamp, "Live" badge on the current one) from NEW `GET /api/pages/[id]/versions`
(PURE `buildHistory` in lib/pages/version-history.ts). Per version: **View** (renders it read-only in the
preview iframe via `/preview/<id>?version=<vid>` — route guards page ownership; shell switches center tab to
preview + shows a "back to draft" banner) and **Create draft** (in-app confirm → NEW
`POST /api/pages/[id]/restore {versionId}` → `newDraftFromVersion` copies the version into a fresh draft,
source untouched, then the editor reloads the draft via a new `draftReloadNonce`). REST+fetch only, NO server
actions. i18n EN/FI/ET `pageBuilder.versions.*`. tsc 0, version-history 4/4 + page-version 10/10, opennext
build green (both routes in the map). See CAVEATS "VERSIONING slice 4 DONE".

**CHECK BUGS FIRST:** ALL bugs in BACKLOG `## Bugs` are DONE. If a fresh human bug appears, take it first.

**USER MUST APPLY MIGRATION 0006** (`0006_robust_wendell_rand.sql`) before versioning is live end-to-end
(`wrangler d1 migrations apply <db>` remote / `--local` dev). NOT auto-run by build. Until applied, getDraft/
publishDraft/listVersions hit empty version rows; public falls back to page.blocks (slice 2 pickRenderBlocks).
All versioning is BUILD-VERIFIED ONLY — needs a real D1 binding + the migration to exercise live (HITL).

**Top queued tasks now (no more versioning slices):**
- Adopt `<LocalePicker>`/`useLocalePicker` in C2 `pages-manager.tsx` + `pages/block-editor.tsx` (they still
  STACK all content locales; the builder forms already use the shared picker — full app-wide consistency).
- Schema field types DATE/TIME — native `<input type=date/time>` in ComponentSettings (parse+validate in
  page-blocks.ts; migrate BlogPostHeader.date etc. to `type:"date"`; node tests). Full spec in BACKLOG.
- Component "AI translate" button — BLOCKED until the ai-assistant goal ships `POST /api/translate`. Skip
  until then.
- Polish: the History list shows version_no + raw `toLocaleString()` timestamp; could group/relative-time if
  the user wants. Low priority.

Gate: CMS `npx tsc --noEmit` → `node --test scripts/*.test.mjs` → `npx opennextjs-cloudflare build` (dev
STOPPED, 3601 free). Stage ONLY CMS files + `goals/page-builder/*` by EXPLICIT PATH — NO `git add -A`. Do
NOT touch cms-bundle.generated.js (PM predeploy auto-regens) or other loops' files.

NOTE: the impeccable hook still flags `MetaImagePicker`'s `<img src={value}>` (broken-image) — a real
user-supplied OG-image URL, a FALSE POSITIVE, pre-existing. Ignore it / don't "fix" it.
