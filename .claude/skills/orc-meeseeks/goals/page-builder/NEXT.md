# Note to the next Meeseeks (page-builder)

**THIS run (Component "Translate with AI" button):** DONE. `ComponentSettings` (page-builder-shell.tsx)
now has a per-component "Translate with AI" button under the LocalePicker (only when multi-locale + the
component schema has a translatable field). It collects every translatable string/richtext prop's text in
the ACTIVE (source) locale and POSTs the ai-assistant loop's EXISTING `POST /api/translate`
(`{kind:"component", target:block.component, fields, fromLocale}`) — NO second model client. On
`{ok,translations}` it merges the returned `{loc:text}` maps into props for review before Save. Loading
("Translating…") + error states. PURE logic in page-blocks.ts: `collectTranslatableSource` +
`mergeTranslations` (4 node tests). EN/FI/ET `pageBuilder.translate.*`. tsc clean, opennext build green.
LIVE model call is HITL/build-verified only (needs a real AI binding; endpoint 503s without one). See
CAVEATS "TRANSLATE WITH AI BUTTON DONE".

**CHECK BUGS FIRST:** ALL bugs in BACKLOG `## Bugs` are DONE. If a fresh human bug appears, take it first.

**Top queued tasks now:**
- **Schema field types DATE/TIME** — native `<input type=date/time>` in ComponentSettings (parse+validate
  in page-blocks.ts; migrate BlogPostHeader.date etc. to `type:"date"`; node tests). Full spec in BACKLOG.
- Adopt `<LocalePicker>`/`useLocalePicker` in C2 `pages-manager.tsx` + `pages/block-editor.tsx` (they still
  STACK all content locales; the builder forms already use the shared picker — app-wide consistency).
- POSSIBLE follow-on: a PAGE-level "Translate with AI" (kind:"page") for the SEO meta form (metaTitle/
  metaDescription per locale) reusing the SAME endpoint + `collectTranslatableSource`/`mergeTranslations`
  pattern. Endpoint already supports kind:"page".
- Polish: History list shows raw `toLocaleString()` timestamp; could group/relative-time. Low priority.

Gate: CMS `npx tsc --noEmit` → `node --test scripts/*.test.mjs` → `npx opennextjs-cloudflare build` (dev
STOPPED, 3601 free). Stage ONLY CMS files + `goals/page-builder/*` by EXPLICIT PATH — NO `git add -A`. Do
NOT touch cms-bundle.generated.js (PM predeploy auto-regens) or other loops' files (esp. the ai-assistant
loop's api/translate + api/chat — you only CALL the endpoint, never edit it).

NOTE: the impeccable hook still flags `MetaImagePicker`'s `<img src={value}>` (broken-image) — a real
user-supplied OG-image URL, a FALSE POSITIVE, pre-existing. Ignore it / don't "fix" it.

**USER MUST APPLY MIGRATIONS** 0004 (metaImage) + 0006 (versioning) with `wrangler d1 migrations apply`
before those features are live end-to-end. NOT auto-run by build.
