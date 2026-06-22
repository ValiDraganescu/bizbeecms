# Note to the next Meeseeks (content-collections)

BUGS: NONE OPEN. v1 (Slices 0–6) DONE. Phase-2 binding: **Slices A + B + C DONE**.

WHAT SLICE C ADDED (use it, don't reinvent):
- `lib/pages/page-blocks.ts`: `isList`, `addListBlock`/`addListToSection`,
  `setBlockField` (set/clear bindings/listSource/listMap/listRole — NON-prop fields,
  tree-walk, undefined deletes), `setBlockChildren` (List template/empty children).
- `lib/content/binding.ts`: `validateListBinding` (List analog of `validateBinding`).
- `page-builder-shell.tsx`: `/api/collections` fetch (graceful); rail List insert
  button; Block-tab `ListSettings` (List) + `BindingPanel` (single-item, key "item")
  + a reusable `QueryBuilder` (filter[]/sort[] over a collection's columns). All
  graceful. EN/FI/ET `pageBuilder.layoutList`/`bind.*`/`list.*` + cms-bundle regen.
- Tests: `node --test scripts/binding-ui.test.mjs` (11). Full suite (176):
  `node --test scripts/{binding,query-compiler,item-write,collection-plan,collection-schema,content-fence,collection-tools,render-tree,list-block,page-blocks,binding-ui}.test.mjs`.

PICK NEXT: **P2-bind Slice D — AI tools for binding.** Tools so the assistant authors
the SAME bindings: `bind_component` (set a block's single-item binding: collection +
first-match query + field→prop map) and `create_list`/`bind_list` (insert/configure a
`List` block: query + template component + map). REUSE `validateBinding`/
`validateListBinding` (lib/content/binding.ts) + `declaredPropNames`; reuse the Slice-A/B
data shapes — NO forked data path. Follow Slice 6's tool wiring EXACTLY (CAVEATS): PURE
`lib/chat/*-tools.ts` (no @/ imports → node-testable) + register in tool-dispatch.ts
(TOOL_BY_NAME + HANDLERS) + tool-scopes.ts (KNOWN_TOOL_NAMES + a context's
TOOLS_BY_CONTEXT) — name in ALL THREE or registry-coverage fails. Tool descriptions are
MODEL-facing → NO cms-bundle regen, NO EN/FI/ET (like Slice 6). The tools must MUTATE a
page's blocks — Slice 6 tools hit the collection STORES, but binding tools edit a page's
draft block tree; check how create_page/page tools persist blocks (likely the draft REST
/ a page-store mutate) and reuse that. Node tests per tool's validation + the block-edit.

GATE: `node --test scripts/...` + `npx tsc --noEmit` + `npx opennextjs-cloudflare build`
(dev server DOWN first). Slice D = AI-tool descs only → NO bundle regen, NO EN/FI/ET.

PARALLEL-SAFETY: another CMS worker owns `CMS/src/app/mcp/**` + `app/api/keys/**` +
settings UI + the cms-bundle regen. Slice D is `lib/chat/**` — Slice 6 collection-tools
already live there; the MCP worker also touches lib/chat tool-registry → COORDINATE
(message them) before editing tool-dispatch.ts/tool-scopes.ts to avoid a clash.

GOTCHAS: binding/list config lives OUTSIDE props (setBlockField, not mergeBlockProps).
renderer is lib/render/ NOT lib/content/. imports inside src/ need `.ts` ext.
List/binding filter `op` is loose `string` (compiler whitelists at runtime). Keep
planPage/planTree PURE+SYNC — hydrate in the async buildPlanFromPage. Empty-state List
child (`listRole:"empty"`) has NO operator UI yet (renderer supports it) — add if needed.
