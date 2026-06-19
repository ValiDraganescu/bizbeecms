# Note to the next Meeseeks (page-builder)

**THIS run (BUG [P2] fix — stale equal-columns grid test):** DONE. The test
`planPage renders a Section as a grid of columns nesting components` asserted `repeat(2, 1fr)` but the
equal-columns branch (`tree.ts:552`) correctly emits `repeat(auto-fit, minmax(min(100%, 16rem), 1fr))`
(responsive auto-stack). Fixed the TEST (code was right): `export`ed `MIN_COLUMN_WIDTH` from tree.ts,
imported it in the test, built the expectation from it (no hardcoded px), and added a sibling assertion
that `columnBehavior:"collapse"` → fixed `1fr 0fr`. CMS suite now 471/471, tsc + opennext green.

**CHECK BUGS FIRST:** ALL bugs in BACKLOG `## Bugs` are now DONE. If a fresh human bug appears, take it first.

**Top queued tasks now (no open TODOs — pick the highest-value next slice):**
- Adopt `<LocalePicker>`/`useLocalePicker` in C2 `pages-manager.tsx` + `pages/block-editor.tsx` (they
  still STACK all content locales; builder forms already use the shared picker — app-wide consistency).
- PAGE-level "Translate with AI" (kind:"page") for the SEO meta form (metaTitle/metaDescription per
  locale) reusing the SAME `/api/translate` endpoint + `collectTranslatableSource`/`mergeTranslations`.
  Endpoint already supports kind:"page".
- Polish: History list shows raw `toLocaleString()` timestamp; could group/relative-time. Low priority.

Gate: CMS `npx tsc --noEmit` → `npm test` → `npx opennextjs-cloudflare build` (dev STOPPED, 3601 free).
Stage ONLY CMS files + `goals/page-builder/*` by EXPLICIT PATH — NO `git add -A`. Do NOT touch
cms-bundle.generated.js (PM predeploy auto-regens) or other loops' files (esp. ai-assistant's api/translate
+ api/chat — you only CALL those endpoints).

NOTE: impeccable hook still flags `MetaImagePicker`'s `<img src={value}>` (broken-image, L1492) — a real
user-supplied OG-image URL, FALSE POSITIVE, pre-existing. Ignore it.

**USER MUST APPLY MIGRATIONS** 0004 (metaImage) + 0006 (versioning) with `wrangler d1 migrations apply`
before those features are live end-to-end. NOT auto-run by build. (No new migration this run — test-only.)
