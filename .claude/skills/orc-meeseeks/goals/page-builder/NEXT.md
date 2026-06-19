# Note to the next Meeseeks (page-builder)

**THIS run (Versioning slice 2 — render routes read the right version + preview auto-refresh seam):** DONE.
Public route renders the PUBLISHED version's blocks (`getVersion(page.publishedVersionId)`, fallback
`page.blocks` for legacy pages); preview renders DRAFT → else PUBLISHED → else legacy. Block-SOURCE choice
is the pure node-tested `pickRenderBlocks(version, fallbackVersion, legacyBlocks)` (page-version.ts); routes
resolve the pointer via the NEW public `getVersion(id|null,db?)` (page-version-store.ts, NO create).
`buildPlanFromPage(pageRow, blocksOverride?)` — optional 2nd arg, absent = legacy `page.blocks`. Shell:
debounced (600ms) `previewNonce` bump on `blocks` change = the slice-3 auto-save seam. page-version 10/10,
tsc 0, opennext build green. See CAVEATS "VERSIONING slice 2 LANDED" + "PREVIEW AUTO-REFRESH SEAM".

**CHECK BUGS FIRST:** ALL bugs in BACKLOG `## Bugs` are DONE. If a fresh human bug appears, take it first.

**USER MUST APPLY MIGRATION 0006** (`wrangler d1 migrations apply <db>` remote / `--local` dev) before any
versioning behavior is live. NOT auto-run by build. Until then (and until slice 3 wires saveDraftBlocks) the
render routes fall back to `page.blocks` — they're READY but the draft/published version rows are unpopulated.

**BUILD GREEN** as of 21:33 (tsc 0 over whole CMS + opennext build complete, dev stopped/3601 free).

**Top queued task — Versioning slice 3** (the natural next): in `page-builder-shell.tsx`,
- REPLACE the slice-2 nonce-bump effect's body (the debounced effect above the pages/groups load) with the
  real debounced auto-save: call `saveDraftBlocks(pageId, {blocks,meta})` THEN bump `previewNonce`. Don't add
  a second debounce — reuse that one effect. Keep `onSave()` (forces an immediate draft save, no debounce).
- Add a separate top-bar **Publish** button → `publishDraft(pageId)` (snapshot + auto-draft, slice 1). Top
  bar = [Save] [Publish]. Opening a page with no draft = `getDraft` (create-if-absent). NOTE: the store
  wrappers run server-side (D1) — the shell is `"use client"`, so you'll need API ROUTES wrapping
  `saveDraftBlocks`/`publishDraft`/`getDraft` (the shell currently PUTs blocks via `/api/pages/[id]/blocks`
  → `setPageBlocks`, which writes `page.blocks` NOT a version; slice 3 must route draft writes to
  `saveDraftBlocks` instead — decide: new `/api/pages/[id]/draft` + `/publish`, or extend the blocks route).
  Show draft status (saving…/saved/published). EN/FI/ET (Save, Publish, saving, saved, published).
- Then **slice 4** (version history UI + restore via `newDraftFromVersion`/`listVersions`).

Other queued: Adopt `<LocalePicker>` in C2 (pages-manager.tsx + pages/block-editor.tsx still stack locales);
Schema field types DATE/TIME (native pickers in ComponentSettings).

Gate: CMS `npx tsc --noEmit` → `node --test scripts/*.test.mjs` → `npx opennextjs-cloudflare build` (dev
STOPPED, 3601 free). Stage ONLY CMS files + `goals/page-builder/*` by EXPLICIT PATH — NO `git add -A`. Do
NOT touch cms-bundle.generated.js (PM predeploy auto-regens) or other loops' files.

NOTE: the impeccable hook still flags `MetaImagePicker`'s `<img src={value}>` (broken-image, L~1373) — a real
user-supplied OG-image URL, a FALSE POSITIVE, pre-existing. Ignore it / don't "fix" it.
