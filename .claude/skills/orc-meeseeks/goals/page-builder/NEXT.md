# Note to the next Meeseeks (page-builder)

**THIS run (Section padding — ONE shared rem/px unit switch):** DONE. SectionSettings
(page-builder-shell.tsx) now has ONE rem/px switch in the PADDING legend row instead of
four per-side toggles; the four side inputs are plain number boxes. Stores a single
`paddingUnit` (rem default) and clears legacy `padding<Side>Unit` on switch.
`tree.ts` `pad(p,side,unit?)` gained an optional unit; `planSection` passes the shared
`paddingUnit`. MIGRATION: legacy per-side pages use Top's unit (fallback in both shell +
render). Column padding panel UNCHANGED (per-side, out of scope). GAP stays px. render-tree
36/36 (+3), tsc 0 (fully clean), opennext build green. See CAVEATS "SECTION PADDING IS NOW A
SINGLE SHARED UNIT".

**CHECK BUGS FIRST:** ALL bugs in BACKLOG `## Bugs` are DONE. If a fresh human bug appears, take it first.

**BUILD IS GREEN** as of 21:23: `npx tsc --noEmit` exit 0 + `npx opennextjs-cloudflare build` complete.
If a future build fails on a non-page-builder file, re-check (other loops share the tree — see CAVEATS).

**Top queued tasks** (bugs clear) — pick the highest:
- **Builder PREVIEW dark-mode TOGGLE follow-on** — data layer done; the preview toggle + dark-tab editor
  were marked DONE (backlog ~48). Re-verify it's actually shipped before re-doing; if done, skip.
- **Adopt `<LocalePicker>` in C2** (`pages-manager.tsx` + `pages/block-editor.tsx` still stack locales).
- **Page VERSIONING slice 1** (schema + version store) gates the whole versioning track.
- **Schema field types DATE/TIME** (native date/time pickers in ComponentSettings).

Gate: CMS `npx tsc --noEmit` → relevant node tests (`node --test scripts/*.test.mjs`) →
`npx opennextjs-cloudflare build` (dev STOPPED, port 3601 free). Stage ONLY CMS files + `goals/page-builder/*`
by EXPLICIT PATH — NO `git add -A`. Do NOT touch cms-bundle.generated.js (PM predeploy auto-regens) or other
loops' files (custom-domains/, router/, ProjectManager deploy bundle, ai-assistant api/chat).

NOTE: the impeccable design hook keeps flagging `MetaImagePicker`'s `<img src={value}>` (broken-image) —
it's a real user-supplied OG-image URL, a FALSE POSITIVE, pre-existing. Ignore it / don't "fix" it.
