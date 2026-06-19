# Note to the next Meeseeks (page-builder)

**THIS run (Page tab — publish/unpublish + delete page):** DONE. Right-rail Page tab now renders
`PageSettings` (page-builder-shell.tsx). Publish/unpublish = pure `buildPublishToggleBody(page)` (page-meta.ts)
→ full-meta `PUT /api/pages` (SEO maps untouched). Delete = `DELETE /api/pages?id=<id>` (NOTE: `id` is a QUERY
PARAM, there is NO `[id]/route.ts` for pages — only `[id]/blocks`) behind an IN-APP confirm (state-driven,
never native window.confirm) that clears selection on success. EN/FI/ET under `pageBuilder.page.*`.
COORDINATE: the page-versioning track will add a TOP-BAR publish (snapshot draft→version) — this tab stays a
simple draft↔published toggle; when versioning lands, reconcile (publish here = publish current draft,
unpublish = take offline). Don't duplicate publish logic.

Also flipped the SEO META IMAGE (OG) backlog TODO to DONE — it was already shipped in commit 21a3874
(schema.ts metaImage, MetaImagePicker, og:image), the line just wasn't marked.

**CHECK BUGS FIRST:** ALL bugs in BACKLOG `## Bugs` are DONE. If a fresh human bug appears, take it first.

**BUILD IS GREEN:** `npx tsc --noEmit` exit 0 (FULLY clean now — no ai-assistant chat/route.ts errors) and
`npx opennextjs-cloudflare build` complete as of 20:52. If a future build fails on a non-page-builder file,
re-check, but it's clean.

**Top queued tasks** (bugs clear) — pick the highest:
- **Adopt `<LocalePicker>` in C2** — `pages-manager.tsx` + `pages/block-editor.tsx` still stack locales;
  swap to `useLocalePicker`/`<LocalePicker>` for app-wide consistency (keystone exists).
- **Responsive Section columns — auto-stack** (`repeat(auto-fit, minmax(min(100%,~16rem),1fr))` in
  `tree.ts` planSection; keep the `collapse`/0fr behavior). Update section-render test.
- **Delete nodes in the Layers tree** (component or whole Section) — `removeNode` exists; wire a trash
  affordance + reuse the SAME in-app confirm pattern as PageSettings (NOT native window.confirm).
- **Column settings panel** / **Section padding single-unit switch** / **per-viewport column visibility**.
- **Page VERSIONING slice 1** (schema + version store) gates the whole versioning track.

Gate: CMS `npx tsc --noEmit` → relevant node tests (`node --test src/lib/**/*.test.ts` +
`scripts/*.test.mjs`) → `npx opennextjs-cloudflare build` (dev STOPPED, port 3601 free). Stage ONLY CMS files
+ `goals/page-builder/*` by EXPLICIT PATH — NO `git add -A`. Do NOT touch cms-bundle.generated.js (PM
predeploy auto-regens) or other loops' files.
