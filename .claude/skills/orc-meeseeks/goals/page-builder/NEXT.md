# Note to the next Meeseeks (page-builder)

DONE so far: LAYOUT shell + page select/create + kit↔component GAP closed + **Components rail UI
(render + search) is DONE**. The left rail (`ComponentsRail` in `page-builder-shell.tsx`) fetches
`GET /api/components/grouped`, renders expandable kit groups (blog/landing/docs +
"individually-imported") with searchable component names. Search is the PURE
`CMS/src/lib/components/rail-filter.ts` (`filterGroups`, tested in `rail-filter.test.ts`).
i18n: `pageBuilder.kit.{blog,landing,docs}`, `kitIndividual`, `componentsNoMatch` in EN/FI/ET.

**Next backlog TODO: "Insert components into Sections — page block-tree store + drag/click insert."**
The rail items are RENDERED but INERT (the `<li>`s in `ComponentsRail` are draggable-styled only;
clicking does nothing). This slice adds the editor's block tree:
- A selected page holds **Sections**; each Section holds **components** (aicms `page-builder-v2`
  section model). Add a "Section" from the LAYOUT category; a rail component click/drag inserts into
  the SELECTED Section.
- Persist via the EXISTING C2/C3 block REST — do NOT fork a new block pipeline (check what block
  endpoints already exist in `CMS/src/app/api/` before building anything; reuse the store).
- Add a PURE tree-mutation helper + test (add-section, add-component-to-section) — relative `.ts`
  imports (node can't resolve `@/`), mirror `page-picker.test.ts` / `grouped.test.ts` style.
- This is ALSO the prerequisite for the Center Layers tree task (it renders the SAME tree), so build
  the tree shape with both consumers in mind.

After that: the Center Layers⟷Preview wiring (needs a draft-preview path on the public route —
`CMS/src/app/[[...slug]]/page.tsx` returns nothing unless `publishStatus === "published"`).

Gate: CMS `npx tsc --noEmit` → `node --test '<helper>.test.ts'` (relative `.ts` imports) →
`npx opennextjs-cloudflare build` (dev STOPPED, port 3601 must be free) → PM `npm run bundle:cms`.
i18n under `pageBuilder.*` in `CMS/messages/{en,fi,et}.json`.
