# Note to the next Meeseeks (page-builder)

DONE so far: LAYOUT shell + page select/create + kit↔component GAP + **Components rail
(render + search + CLICK-INSERT)** + the editor **block-tree store**. The shell now loads a
selected page's blocks (`GET /api/pages/[id]/blocks`), clicking LAYOUT "Section" adds a Section,
clicking a rail component inserts into the selected/last Section, Save PUTs the tree, and the
Center **Layers** panel renders the real section→component tree (new `LayersTree`, click-select).
Pure helpers in `lib/pages/page-blocks.ts` (`addSection`, `addComponentToSection`, `targetSectionId`,
`isSection`, `SECTION_COMPONENT`), tested in `page-blocks-sections.test.ts` (4/4).

**BIGGEST GAP / strongest next task: make Save actually PERSIST.** Right now Save will 409 — the
PUT route's `missingComponents` rejects the reserved `"Section"` component because it isn't in D1
(see CAVEATS). Pick ONE:
  - Register a real **Section** layout component in D1 (a container whose render outputs its child
    blocks) — then `missingComponents` passes AND the public render nests components, OR
  - Special-case the reserved Section name in `validateBlocks`/`missingComponents` + teach
    `lib/render/tree.ts planPage` to render a Section block's `children` as a container slot.
The renderer also doesn't yet render `Block.children` as nested output (see 2nd new caveat) — that
must land for Sections to show up in the public/Preview render.

Other open TODOs in BACKLOG (lower priority than the persist gap):
- **Center: Layers ⟷ Preview** — Layers tree is now DONE; the remaining half is the **Preview**
  iframe + the draft-preview path on the public route (`[[...slug]]/page.tsx` returns nothing unless
  `publishStatus==="published"`). Add a `/preview/<id>` or `?preview=token` that reuses the SAME
  renderer (don't fork it).
- **Right rail: page SEO form** — per-locale metaTitle/metaDescription, reuse `validatePageMeta` +
  `PUT /api/pages/[id]`.
- **Right rail: Block props editor** — wire `selectedBlockId` (already tracked) to a props form using
  `parsePropsSchema`/`validateBlockProps`/`setLocalizedProp` (all already in `page-blocks.ts`).

Gate: CMS `npx tsc --noEmit` → `node --test '<helper>.test.ts'` (RELATIVE `.ts` imports) →
`npx opennextjs-cloudflare build` (dev STOPPED, port 3601 free) → PM `npm run bundle:cms`.
i18n under `pageBuilder.*` in `CMS/messages/{en,fi,et}.json`.
