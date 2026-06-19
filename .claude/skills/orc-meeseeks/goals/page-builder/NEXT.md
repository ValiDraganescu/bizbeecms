# Note to the next Meeseeks (page-builder)

**THIS run (Delete nodes in Layers tree):** DONE. Exported the existing pure `removeNode(blocks, id)`
from `page-blocks.ts` (was private; nested-safe + immutable — deleting a Section drops its
columns+components, deleting a component leaf drops just it). Shell got `onDeleteNode` (setBlocks ∘
removeNode, clears selection if deleted node was selected, marks dirty) threaded into `LayersTree`, and
a new local `DeleteNodeControl` (trash icon + inline confirm popover) rendered on each Section node AND
each component leaf — reuses the SAME in-app confirm pattern as deleteColumn (NOT native
window.confirm). EN/FI/ET `pageBuilder.deleteNode` (action/section/component/confirmSection/
confirmComponent/cancel). Column-delete (#30) still separate, untouched. 4 tests added (3 removeNode
behavior + 1 catalog parity). tsc 0 (fully clean) + opennext build green.

**CHECK BUGS FIRST:** ALL bugs in BACKLOG `## Bugs` are DONE. If a fresh human bug appears, take it first.

**BUILD IS GREEN** as of 21:18: `npx tsc --noEmit` exit 0 + `npx opennextjs-cloudflare build` complete.
If a future build fails on a non-page-builder file, re-check (other loops share the tree — see CAVEATS).

**Top queued tasks** (bugs clear) — pick the highest:
- **Section padding — ONE shared rem/px unit switch** (replace per-side units; migrate existing per-side).
- **Builder PREVIEW dark-mode TOGGLE** (flip the iframe to dark to SEE token bgs without changing OS) +
  a settings UI to edit the dark override map (today only the `theme_overrides_dark` store exists).
- **Adopt `<LocalePicker>` in C2** (`pages-manager.tsx` + `pages/block-editor.tsx` still stack locales).
- **Page VERSIONING slice 1** (schema + version store) gates the whole versioning track.
- **Schema field types DATE/TIME** (native date/time pickers in ComponentSettings).

Gate: CMS `npx tsc --noEmit` → relevant node tests (`node --test scripts/*.test.mjs`) →
`npx opennextjs-cloudflare build` (dev STOPPED, port 3601 free). Stage ONLY CMS files + `goals/page-builder/*`
by EXPLICIT PATH — NO `git add -A`. Do NOT touch cms-bundle.generated.js (PM predeploy auto-regens) or other
loops' files (custom-domains/, router/, ProjectManager deploy bundle, ai-assistant api/chat).

NOTE: the impeccable design hook keeps flagging `MetaImagePicker`'s `<img src={value}>` (broken-image) —
it's a real user-supplied OG-image URL, a FALSE POSITIVE, pre-existing. Ignore it / don't "fix" it.
