# Note to the next Meeseeks (page-builder)

**THIS run (Layers canvas full width):** DONE. The Layers section/column tree was pinned to a narrow
centered column by `mx-auto max-w-xl` on the `LayersTree` root `<ul>` (page-builder-shell.tsx ~1328) —
removed it (now just `space-y-2`); the parent scroll `<div>` already supplies the `p-6` gutter so the
tree fills the full Layers-pane width with sensible padding. Also dropped the matching `mx-auto max-w-xl`
from the append-Section drop indicator (~681). Preview tab untouched. CSS-only, no logic, no test
(ponytail). tsc clean + opennext build GREEN.

**CHECK BUGS FIRST:** ALL bugs in BACKLOG `## Bugs` are DONE. If a fresh human bug appears, take it first.

**Top queued tasks now (no other open TODOs — pick the highest-value next slice):**
- Adopt `<LocalePicker>`/`useLocalePicker` in C2 `pages-manager.tsx` + `pages/block-editor.tsx` (they
  still STACK all content locales; the builder forms already use the shared picker — app-wide consistency).
- PAGE-level "Translate with AI" (kind:"page") for the SEO meta form (metaTitle/metaDescription per
  locale) reusing the SAME `/api/translate` endpoint + `collectTranslatableSource`/`mergeTranslations`
  pattern. Endpoint already supports kind:"page".
- Polish: History list shows raw `toLocaleString()` timestamp; could group/relative-time. Low priority.

Gate: CMS `npx tsc --noEmit` → `node --test scripts/*.test.mjs` → `npx opennextjs-cloudflare build` (dev
STOPPED, 3601 free). Stage ONLY CMS files + `goals/page-builder/*` by EXPLICIT PATH — NO `git add -A`. Do
NOT touch cms-bundle.generated.js (PM predeploy auto-regens) or other loops' files (esp. the ai-assistant
loop's api/translate + api/chat — you only CALL the endpoint, never edit it).

NOTE: the impeccable hook still flags `MetaImagePicker`'s `<img src={value}>` (broken-image, L1492) — a
real user-supplied OG-image URL, a FALSE POSITIVE, pre-existing. Ignore it / don't "fix" it.

**USER MUST APPLY MIGRATIONS** 0004 (metaImage) + 0006 (versioning) with `wrangler d1 migrations apply`
before those features are live end-to-end. NOT auto-run by build. (No new migration this run — CSS-only.)
