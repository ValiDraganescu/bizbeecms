# Note to the next Meeseeks (content-collections)

BUGS: NONE OPEN. Slices 0–6 are ALL DONE. v1 is COMPLETE: fence + registry +
runtime create + items CRUD + structured query + admin UI + **AI tools**.

WHAT EXISTS NOW (use it, don't reinvent):
- Pure libs: `CMS/src/lib/content/{fence,collection-schema,collection-plan,item-write,query-compiler}.ts`.
- Stores: `CMS/src/db/{collection-store,item-store,query-store}.ts` (all `PlanResult<T>`).
- REST: `app/api/collections/...` (Admin-gated; `[name]` = content_<slug> table name).
- Admin UI (Slice 5): `app/admin/collections/{page,[name]/page}.tsx` +
  `components/content/{collections-manager,collection-items,field-input,confirm-modal}.tsx`.
- **AI tools (Slice 6, NEW):** `lib/chat/collection-tools.ts` (5 PURE tool schemas +
  validators) wired into the SHARED registry (`tool-dispatch.ts` TOOL_BY_NAME +
  HANDLERS) calling the Slice 2-4 stores directly; `collections` context in
  `tool-scopes.ts`. Tools: create_collection, add_collection_item,
  update_collection_item, archive_collection_item (op-switches archive|unarchive|
  delete), query_collection. NO raw SQL to the model; NO forked data path.
- Tests gate: `node --test scripts/query-compiler.test.mjs scripts/item-write.test.mjs
  scripts/collection-plan.test.mjs scripts/collection-schema.test.mjs
  scripts/content-fence.test.mjs scripts/collection-tools.test.mjs` (78). Also keep
  `scripts/{tool-dispatch,tool-scopes}.test.mjs` green (registry coverage).

PICK NEXT: **Phase 2 — Component ↔ Collection BINDING (greenlit).** Start with
**P2-bind Slice A — block `bindings` model + hydrate-before-walk seam** (single-item
first-match binding only this slice). See BACKLOG Phase-2 section + the CAVEATS on
keeping `planPage`/`planTree` PURE+SYNC (hydrate in async `buildPlanFromPage` BEFORE
the walk) and `List` being a BUILT-IN block modeled on `Section`. P2-bind A→B→C→D
is the remaining track; Phase 3 (route-driven detail pages + cross-collection refs)
and the deferred drop/rename-field + FTS5 items are later/not-greenlit.

GATE every slice: `node --test scripts/...` + `npx tsc --noEmit` +
`npx opennextjs-cloudflare build` (dev server DOWN first — corrupts .next). Regen
cms-bundle (`npm run bundle:cms` from ProjectManager/) ONLY if the slice adds CMS
*UI* strings — AI-tool descriptions are model-facing, NOT UI strings (no regen).

KEY DECISIONS (settled — don't relitigate): one real table/collection; runtime DDL
fenced to content_* + system-generated; 100-collection cap; registry canonical;
ADD-ONLY evolution v1; AI gets STRUCTURED tools only; NO FTS5 v1 (LIKE);
refs/page-binding = Phase 2 (single-item = query first-match, List = Section-style
built-in block).

GOTCHAS: imports inside src/ need `.ts` extension or node --test can't resolve.
`[name]` / the `collection` tool arg IS the content_<slug> table name. New AI tools
go in THREE places (KNOWN_TOOL_NAMES, TOOL_BY_NAME, HANDLERS) — chat route
auto-derives, no route edit. Live D1 = HITL — node-test the PURE modules, the
UI/stores/tools are build-verified.
