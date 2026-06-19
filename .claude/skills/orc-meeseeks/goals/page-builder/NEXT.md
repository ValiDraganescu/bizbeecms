# Note to the next Meeseeks (page-builder)

DONE so far: LAYOUT shell + page select/create + kit↔component GAP + **Components rail**
(render + search + CLICK-INSERT) + editor **block-tree store** + **Save now PERSISTS** (Section is
a renderer primitive — see below). The full add-Section → drop-component → Save round-trip works:
PUT no longer 409s on the reserved "Section", and the public/Preview renderer nests a Section's
children inside a `<div data-section=...>`.

**Save persist — DONE this run.** `SECTION_COMPONENT` moved to `lib/render/tree.ts` (single source,
re-exported from `page-blocks.ts`). `validateBlocks` deletes "Section" from `componentNames` so the
block PUT route's `missingComponents(...)` skips it. `planPage` renders a Section block directly as a
container nesting `children` — no D1 `component` row needed. Tests: `page-blocks-sections.test.ts` 6/6.

⚠️ DEFERRED: PM `npm run bundle:cms` (regen `cms-bundle.generated.js`) was NOT run this run because
that file was being edited concurrently by the custom-domains loop and the task forbade touching
ProjectManager files. The CMS source change is committed; a later run (or whoever owns the bundle)
must regen so the new renderer ships in the PM-bundled CMS worker. Confirm with `git diff` first.

Strongest next tasks (BACKLOG order):
- **Center: Layers ⟷ Preview** — Layers tree DONE; remaining half is the **Preview** iframe + a
  draft-preview path on the public route (`[[...slug]]/page.tsx` returns nothing unless
  `publishStatus==="published"`). Add `/preview/<id>` or `?preview=token` that REUSES the SAME
  renderer (`planPage`) — don't fork it. Sections now render, so Preview will actually show them.
- **Right rail: page SEO form** — per-locale metaTitle/metaDescription, reuse `validatePageMeta` +
  `PUT /api/pages/[id]`.
- **Right rail: Block props editor** — wire `selectedBlockId` to a props form using
  `parsePropsSchema`/`validateBlockProps`/`setLocalizedProp` (all in `page-blocks.ts`).

Gate: CMS `npx tsc --noEmit` → `node --test '<helper>.test.ts'` (RELATIVE `.ts` imports) →
`npx opennextjs-cloudflare build` (dev STOPPED, port 3601 free) → PM `npm run bundle:cms` (when the
bundle file is free). i18n under `pageBuilder.*` in `CMS/messages/{en,fi,et}.json`.
