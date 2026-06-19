# Note to the next Meeseeks (page-builder)

DONE so far: LAYOUT shell + page select/create + kit↔component GAP + Components rail (render + search +
CLICK-INSERT) + editor block-tree store + Save PERSISTS + Center Layers⟷Preview BOTH halves +
**Right-rail SEO form** (this run).

**SEO form — DONE this run.** Right rail SEO tab now edits the selected page's per-content-locale
metaTitle/metaDescription via a new `SeoForm` in `page-builder-shell.tsx`, pre-filled from the loaded
`PageSummary`, Save PUTs the FULL meta to the EXISTING `/api/pages` (id in body — there's NO
`/api/pages/[id]/route.ts`, only `[id]/blocks`). Server `page.tsx` now passes a `contentLocales` prop
(`getContentLocales()` + default fallback). Two PURE helpers added to `page-meta.ts`
(`setLocaleValue`, `buildSeoMetaBody`) + `page-meta.test.ts` 3/3; C2 pages-manager deduped onto
`setLocaleValue`. i18n `seo*` keys EN/FI/ET.

⚠️ DEFERRED (still): PM `npm run bundle:cms` regen of `cms-bundle.generated.js` NOT run — cross-loop
guardrail forbids touching ProjectManager files. THREE CMS render/builder changes (Save-persist
Sections, Preview route, this SEO form) sit un-bundled. Whoever owns the bundle MUST regen.

Strongest next tasks (BACKLOG order):
- **Right rail: Block props editor** — wire `selectedBlockId` to a props form using
  `parsePropsSchema`/`validateBlockProps`/`setLocalizedProp` (all in `page-blocks.ts`). The Block tab
  is still the empty state. After saving blocks, the preview iframe already reloads on Save.
- **Right rail: Page (technical) settings** — the Page tab is still empty; wire slug/parent/publish
  edit (reuse the SAME `/api/pages` PUT — `buildSeoMetaBody` is SEO-only; you'd want a sibling that
  carries slug/parent/publish, or extend it). Mirror the C2 PagesManager fields.
- **Layers reorder / visibility / delete** — Layers tree only selects; add drag-reorder + remove,
  persist via the C3 block PUT; add a pure tree-mutation helper + test.

Gate: CMS `npx tsc --noEmit` → `node --test '<helper>.test.ts'` (RELATIVE `.ts` imports) →
`npx opennextjs-cloudflare build` (dev STOPPED, port 3601 free) → PM `npm run bundle:cms` (ONLY when the
bundle file is free — currently contended). i18n under `pageBuilder.*` in `CMS/messages/{en,fi,et}.json`
(2-SPACE indent, not tabs). Stage ONLY CMS page-builder files + goals/page-builder/* by explicit path.
