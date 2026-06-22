# Note to the next Meeseeks (content-collections)

BUGS: NONE OPEN. v1 (Slices 0–6) DONE. Phase-2 binding: **Slice A DONE** (this run).

WHAT SLICE A ADDED (use it, don't reinvent):
- `CMS/src/lib/render/tree.ts`: `BindingRef` type + optional `bindings?:
  Record<string,BindingRef>` on `Block` (SEPARATE from `props`):
  `{ source:{collection, filter?, sort?}, map:{propName→fieldName} }`.
- PURE `CMS/src/lib/content/binding.ts`: `validateBinding(binding, fields|null, declared)`
  → ok|{errors[]}; `bindingQuerySpec(binding)` → first-match QuerySpec (limit 1);
  `hydrateProps(props, bindings, rows)` → new props (binding overwrites static when
  resolved, unresolved → graceful blank); `declaredPropNames(propsSchema)` → allowlist.
- `CMS/src/lib/render/render-page.tsx`: `buildPlanFromPage` now `await
  hydrateBlockBindings(blocks)` BEFORE `planPage` — recursive, parallel first-match
  `queryCollection`, graceful. `planPage`/`planTree` stay PURE+SYNC.
- Tests: `node --test scripts/binding.test.mjs` (15). Full suite (129):
  `node --test scripts/{binding,query-compiler,item-write,collection-plan,collection-schema,content-fence,collection-tools,render-tree}.test.mjs`.

PICK NEXT: **P2-bind Slice B — built-in `List` block (Section-style) + per-row stamp.**
Model it EXACTLY on `SECTION_COMPONENT`/`planSection` in `tree.ts` (a reserved built-in
type special-cased, NOT a user component). It holds a query (collection+filter/sort/
limit) + ONE child slot (template component) + field→prop `map`. Fetch rows in
`buildPlanFromPage` (same seam as Slice A's `hydrateBlockBindings` — add a List query
pass), then a PURE `planList` stamps the slot subtree once per row, binding each row's
mapped fields into the slotted component's declared props (reuse `bindTree` +
`declaredProps`). Empty result → nothing (optional empty-state child). Expose `List`
via a `list_builtin_types`-style export. Pure tests: N rows → N stamped subtrees,
empty → empty, map respects allowlist. Then Slice C (operator UI) + Slice D (AI tools).

GATE every slice: `node --test scripts/...` + `npx tsc --noEmit` + `npx
opennextjs-cloudflare build` (dev server DOWN first). cms-bundle regen ONLY if the
slice adds CMS *UI* strings (Slice A/B = renderer logic, none → no regen).

PARALLEL-SAFETY: another CMS worker owns `CMS/src/app/mcp/**` + `CMS/src/lib/chat/**`
+ the cms-bundle regen — STAY OUT of those for renderer slices (A/B). Slice D (AI
binding tools) WILL touch lib/chat — coordinate then.

GOTCHAS: renderer is `lib/render/` NOT `lib/content/`. imports inside src/ need `.ts`
extension. `SYSTEM_COLUMNS` is a string[]. BindingRef op is loose `string` (compiler
whitelists at runtime — cast to QuerySpec). Keep `planPage`/`planTree` PURE+SYNC —
hydrate/fetch ALWAYS in the async `buildPlanFromPage` before the walk.
