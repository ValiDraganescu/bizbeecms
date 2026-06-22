# Note to the next Meeseeks (content-collections)

BUGS: NONE OPEN. Slices 0 + 1 + 2 + 3 + 4 + 5 are DONE. v1 admin UI ships.

WHAT EXISTS NOW (use it, don't reinvent):
- Pure libs: `lib/content/{fence,collection-schema,collection-plan,item-write,query-compiler}.ts`.
- Stores: `db/{collection-store,item-store,query-store}.ts` (all `PlanResult<T>`).
- REST: `app/api/collections/route.ts`, `.../[name]/route.ts`, `.../[name]/items/route.ts`,
  `.../[name]/items/[id]/route.ts`, `.../[name]/query/route.ts` (Admin-gated; `[name]` = content_<slug>).
- **Slice 5 (NEW): admin UI.** Pages `app/admin/collections/page.tsx` (list+schema editor)
  + `app/admin/collections/[name]/page.tsx` (item manager). Client components in
  `components/content/`: `collections-manager.tsx`, `collection-items.tsx`,
  `field-input.tsx` (type-aware inputs — REUSE for Phase-2 binding UI), `confirm-modal.tsx`
  (in-app confirm — REUSE; never native confirm()). `collections` added to ADMIN_SECTIONS.
  EN/FI/ET `collections` namespace + `adminNav.collections` in CMS/messages/*.json. cms-bundle regen'd.
- Tests gate: `node --test scripts/query-compiler.test.mjs scripts/item-write.test.mjs scripts/collection-plan.test.mjs scripts/collection-schema.test.mjs scripts/content-fence.test.mjs` (67).

PICK NEXT: **Slice 6 — AI assistant collection tools (structured only).**
- Register in the existing pipeline: `lib/chat/{read-tools,write-tools,tool-scopes}.ts`
  + `app/api/chat/route.ts` (KNOWN_TOOL_NAMES + TOOLS_BY_CONTEXT + TOOL_BY_NAME).
- Tools: `create_collection`, `add_collection_item`, `update_collection_item`,
  `archive_collection_item`/`delete_collection_item`, `query_collection`
  (structured filter/sort/text-LIKE). Each calls the SAME store (Slices 2-4) — NO
  forked data path, NO raw SQL to the model (USER DECISION). New `collections` context
  in tool-scopes. Node tests per tool's arg-validation/execution (mock the store).
  No FTS search tool in v1. Gate (tsc + opennext build + node tests; +cms-bundle if it
  adds user-visible strings).
- After Slice 6, Phase-2 binding (P2-bind Slices A→D) is the next track — see BACKLOG.

GATE every slice: `node --test scripts/...` + `npx tsc --noEmit` +
`npx opennextjs-cloudflare build` (dev server DOWN first — corrupts .next). Regen
cms-bundle (`npm run bundle:cms` from ProjectManager/) ONLY if the slice adds CMS UI strings.

KEY DECISIONS (settled — don't relitigate): one real table/collection; runtime DDL
fenced to content_* + system-generated; 100-collection cap; registry canonical;
ADD-ONLY evolution v1; AI gets STRUCTURED tools only; NO FTS5 v1 (LIKE); refs/page-binding = Phase 2.

GOTCHAS: imports inside src/ need `.ts` extension or node --test can't resolve.
`[name]` URL segment IS the content_<slug> table name. Date/datetime stored as ISO
TEXT; multiselect as a JSON-array string. CMS i18n catalogs are in CMS/messages/*.json
(not src/); add nav sections to admin-sections.ts. Live D1 = HITL — node-test the PURE
modules, the UI/stores are build-verified.
