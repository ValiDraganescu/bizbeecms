# Note to the next Meeseeks (content-collections)

BUGS: NONE OPEN. v1 (Slices 0–6) DONE. Phase-2 binding: **Slice A + Slice B DONE**.

WHAT SLICE B ADDED (use it, don't reinvent):
- `CMS/src/lib/render/tree.ts`: `LIST_COMPONENT="List"` + `BUILTIN_COMPONENTS` +
  `isBuiltinComponent()`. `Block` grows List-only fields: `listSource`
  (query: collection+filter[]+sort[]+limit), `listMap` ({templateProp→rowField}),
  `listRows` (host-hydrated rows — NOT authored), `listRole` ("template"|"empty"
  on List children). PURE `planList` (dispatched in `planBlock` like `planSection`)
  partitions children → template vs empty-state, stamps the template per row via
  `stampRow` (injects mapped row fields into props; downstream `bindTree` gates by
  the component's propsSchema). Empty/dead/un-hydrated → empty-state slot or nothing.
- `CMS/src/lib/render/render-page.tsx`: `buildPlanFromPage` fetches List rows in the
  SAME hydrate-before-walk pass as Slice A (`queryCollection` → `listRows`, graceful);
  `List` dropped from the component fetch set.
- `CMS/src/lib/pages/page-blocks.ts`: existence-check drop now loops `isBuiltinComponent`.
- Tests: `node --test scripts/list-block.test.mjs` (10). Full suite (165):
  `node --test scripts/{binding,query-compiler,item-write,collection-plan,collection-schema,content-fence,collection-tools,render-tree,list-block,page-blocks}.test.mjs`.

PICK NEXT: **P2-bind Slice C — operator UI to author bindings.** Two panels in the
page-builder: (1) for a NORMAL component block, a "Bind to collection" panel (pick
collection → first-match query → map fields→declared props) writing the Slice-A
`bindings` map; (2) for a `List` block, a panel to pick collection + filter/sort/limit
+ drop the per-item TEMPLATE component + map its declared props (writes `listSource`/
`listMap`; mark a child `listRole:"empty"` for the empty-state). The page-builder must
also be able to INSERT a `List` block (today nothing emits one — add it like the
Section insert in `page-blocks.ts` `addSection`/`addColumn`). Reuse Slice-4's
query-builder bits + `field-input.tsx`/`confirm-modal.tsx`. Validate via Slice-A
`validateBinding` (single-item) and a List analog (collection/field/prop exist).
EN/FI/ET + cms-bundle regen (Slice C ADDS UI strings). Then Slice D (AI tools).

GATE every slice: `node --test scripts/...` + `npx tsc --noEmit` + `npx
opennextjs-cloudflare build` (dev server DOWN first). cms-bundle regen for Slice C/D
ONLY if they add CMS *UI* strings (Slice C yes; Slice D AI-tool descs = no, like Slice 6).

PARALLEL-SAFETY: another CMS worker owns `CMS/src/app/mcp/**` + `CMS/src/app/api/keys/**`
+ settings UI + the cms-bundle regen — STAY OUT. Slice C is page-builder UI (likely
`components/` + `lib/pages/`); Slice D touches `lib/chat/**` (coordinate then — that's
the other worker's turf for MCP, but chat collection-tools wiring was Slice 6's path).

GOTCHAS: renderer is `lib/render/` NOT `lib/content/`. imports inside src/ need `.ts`
ext. `SYSTEM_COLUMNS` is a string[]. List/binding filter `op` is loose `string` (cast
to QuerySpec — compiler whitelists at runtime). Keep `planPage`/`planTree` PURE+SYNC —
hydrate/fetch ALWAYS in the async `buildPlanFromPage` before the walk.
