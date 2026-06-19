# Note to the next Meeseeks (page-builder)

**THIS run (Versioning slice 3 — debounced draft auto-save + Save + Publish):** DONE.
Shell now writes DRAFTS via NEW REST routes (NO server actions): `/api/pages/[id]/draft` (GET=getDraft
create-if-absent, PUT=saveDraftBlocks) + `/api/pages/[id]/publish` (POST=publishDraft). On page-select the
shell loads the DRAFT (not page.blocks). Every block edit auto-saves on a 600ms debounce (reuses the slice-2
effect → now `void saveDraft()`, then bumps previewNonce). Top bar = [Save][Publish]: Save forces an immediate
draft save (ALWAYS draft, never publishes); Publish saves the draft if dirty then snapshots. Status badge from
PURE `lib/pages/draft-status.ts` (Saving…/Saved/Published/Unsaved/Save failed), i18n EN/FI/ET. tsc 0,
draft-status+page-version tests 15/15, opennext build green (both routes in the route map). See CAVEATS
"VERSIONING slice 3 LANDED".

**CHECK BUGS FIRST:** ALL bugs in BACKLOG `## Bugs` are DONE. If a fresh human bug appears, take it first.

**USER MUST APPLY MIGRATION 0006** (`0006_robust_wendell_rand.sql`) before versioning is live
(`wrangler d1 migrations apply <db>` remote / `--local` dev). NOT auto-run by build. Until then getDraft/
publishDraft hit empty version rows; the public route falls back to page.blocks (slice 2 `pickRenderBlocks`).
NOTE: builder edits now go to the DRAFT — so they're INVISIBLE on the public page until Publish. Intended.

**Top queued task — Versioning slice 4** (version history UI + restore/republish): a history list (top bar
or a right-rail tab) from `listVersions(pageId)`; restore = `newDraftFromVersion(pageId, versionId)` → makes a
new draft copied from that version (source untouched). Needs a new route, e.g. `GET /api/pages/[id]/versions`
(listVersions) + `POST /api/pages/[id]/restore {versionId}` (newDraftFromVersion). After restore, refetch the
draft into the shell (re-run the load effect / bump selected) so the editor shows the restored blocks. i18n
EN/FI/ET. Show version_no + createdAt + which is currently published.

Other queued: Adopt `<LocalePicker>` in C2 (pages-manager.tsx + pages/block-editor.tsx still stack locales);
Schema field types DATE/TIME (native pickers in ComponentSettings); dark-mode preview toggle follow-on UI.

Gate: CMS `npx tsc --noEmit` → `node --test scripts/*.test.mjs` → `npx opennextjs-cloudflare build` (dev
STOPPED, 3601 free). Stage ONLY CMS files + `goals/page-builder/*` by EXPLICIT PATH — NO `git add -A`. Do
NOT touch cms-bundle.generated.js (PM predeploy auto-regens) or other loops' files.

NOTE: the impeccable hook still flags `MetaImagePicker`'s `<img src={value}>` (broken-image) — a real
user-supplied OG-image URL, a FALSE POSITIVE, pre-existing. Ignore it / don't "fix" it.
