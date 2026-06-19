# Note to the next Meeseeks (page-builder)

**THIS run (Versioning slice 1 — schema + pure version store, NO UI):** DONE. New `page_version`
table + `page.draft_version_id`/`published_version_id` (migration `0006_robust_wendell_rand.sql`,
additive). Pure algebra `lib/pages/page-version.ts` + store wrappers `db/page-version-store.ts`
(getDraft/saveDraftBlocks/publishDraft/listVersions/newDraftFromVersion). `page.blocks`/
`publishStatus` UNTOUCHED on purpose. Tests: page-version 6/6, page-store 5/5, schema-migration
4/4. tsc 0 + opennext build green. See CAVEATS "PAGE VERSIONING slice 1 LANDED".

**USER MUST APPLY THE MIGRATION** before slices 2-4 work against a live DB:
`cd CMS && wrangler d1 migrations apply <db-name>` (remote) or `--local` for dev. NOT auto-run by build.

**CHECK BUGS FIRST:** ALL bugs in BACKLOG `## Bugs` are DONE. If a fresh human bug appears, take it first.

**BUILD IS GREEN** as of 21:29 (tsc 0 + opennext build complete). If a future build fails on a
non-page-builder file, re-check (other loops share the tree — see CAVEATS).

**Top queued tasks** — pick the highest:
- **Versioning slice 2** — public route (`app/[[...slug]]`) renders `published_version_id` (fallback
  `page.blocks` for un-migrated pages); `/preview/[id]` renders the DRAFT version (fallback published).
  Reuse `render-page.tsx` — only the block SOURCE changes. Auto-refresh the preview iframe on draft change.
  Use the store wrappers from this run; do NOT inline version logic.
- **Versioning slice 3** — debounced auto-save to draft + manual Save (both → `saveDraftBlocks`) +
  separate Publish (`publishDraft`). Top bar = [Save] [Publish]. Opening a page w/ no draft = `getDraft`.
- **Adopt `<LocalePicker>` in C2** (`pages-manager.tsx` + `pages/block-editor.tsx` still stack locales).
- **Schema field types DATE/TIME** (native date/time pickers in ComponentSettings).

Gate: CMS `npx tsc --noEmit` → relevant node tests (`node --test scripts/*.test.mjs`) →
`npx opennextjs-cloudflare build` (dev STOPPED, port 3601 free). Stage ONLY CMS files + `goals/page-builder/*`
by EXPLICIT PATH — NO `git add -A`. Do NOT touch cms-bundle.generated.js (PM predeploy auto-regens) or other
loops' files (custom-domains/, router/, ProjectManager deploy bundle, ai-assistant api/chat).

NOTE: the impeccable design hook keeps flagging `MetaImagePicker`'s `<img src={value}>` (broken-image) —
it's a real user-supplied OG-image URL, a FALSE POSITIVE, pre-existing. Ignore it / don't "fix" it.
