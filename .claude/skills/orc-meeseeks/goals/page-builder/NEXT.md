# Note to the next Meeseeks (page-builder)

**THIS run (Schema field types DATE/TIME):** DONE. propsSchema now accepts `type:"date"`/`type:"time"`.
page-blocks.ts: union + FIELD_TYPES widened, `isValidDateTime`/`DATE_RE`/`TIME_RE`, validateBlockProps
date/time branch (keep valid ISO, drop malformed, required→declared default if valid). Storage is ISO
locale-agnostic (date YYYY-MM-DD, time HH:mm); display formatting is the component's job. Never
translatable. ComponentSettings (page-builder-shell.tsx) renders native `<input type=date|time>` (no dep).
Migrated blog-kit BlogPostHeader.date + PostListItem.date → `type:"date"` (ISO default 2026-01-01; markup
`{{date}}` unchanged). +2 page-blocks tests, blog-kit date assertions, and FIXED the hardcoded field-vocab
allowlist in all 5 kit tests. tsc clean, opennext build GREEN, 397/397 node tests. See CAVEATS
"DATE/TIME FIELD TYPES DONE".

**CHECK BUGS FIRST:** ALL bugs in BACKLOG `## Bugs` are DONE. If a fresh human bug appears, take it first.

**Top queued tasks now:**
- Adopt `<LocalePicker>`/`useLocalePicker` in C2 `pages-manager.tsx` + `pages/block-editor.tsx` (they
  still STACK all content locales; the builder forms already use the shared picker — app-wide consistency).
- PAGE-level "Translate with AI" (kind:"page") for the SEO meta form (metaTitle/metaDescription per
  locale) reusing the SAME `/api/translate` endpoint + `collectTranslatableSource`/`mergeTranslations`
  pattern. Endpoint already supports kind:"page".
- Polish: History list shows raw `toLocaleString()` timestamp; could group/relative-time. Low priority.
- POSSIBLE follow-on: a component COULD render a date/time nicely (the renderer binds `{{date}}` as raw
  ISO text today). If a kit wants formatted dates, that's a renderer/component feature, not a schema one.

Gate: CMS `npx tsc --noEmit` → `node --test scripts/*.test.mjs` → `npx opennextjs-cloudflare build` (dev
STOPPED, 3601 free). Stage ONLY CMS files + `goals/page-builder/*` by EXPLICIT PATH — NO `git add -A`. Do
NOT touch cms-bundle.generated.js (PM predeploy auto-regens) or other loops' files (esp. the ai-assistant
loop's api/translate + api/chat — you only CALL the endpoint, never edit it).

NOTE: the impeccable hook still flags `MetaImagePicker`'s `<img src={value}>` (broken-image) — a real
user-supplied OG-image URL, a FALSE POSITIVE, pre-existing. Ignore it / don't "fix" it.

**USER MUST APPLY MIGRATIONS** 0004 (metaImage) + 0006 (versioning) with `wrangler d1 migrations apply`
before those features are live end-to-end. NOT auto-run by build. (No new migration this run — date/time
are schema-vocab only, no D1 change.)
