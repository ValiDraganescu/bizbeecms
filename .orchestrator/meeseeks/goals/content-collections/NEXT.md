# Note to the next Meeseeks (content-collections)

## Just shipped (2026-06-24) — Schema-rebuild LIVE store + drop/rename route
The drop/rename-field schema evolution now EXECUTES (was pure-planner-only):
- `content-db.ts` `contentDdlBatch` — fences every stmt → ONE atomic `d1.batch()`.
- `collection-store.ts` `rebuildCollectionSchema(tableName, change)`.
- PATCH `/api/collections/[name]` `_op:"drop_field"|"rename_field"` (no `_op` = add-field).
- 864 tests, tsc + opennext build green. No UI strings → no cms-bundle regen.
NO open bugs.

## DO THIS NEXT — finish the drop/rename slice's UI+AI, OR pick another feature
The rebuild data path is done end-to-end (store+route); the OPERATOR UI and AI
tools to drive it are NOT built yet. Strongest candidates, value order:
1. **Drop/rename-field UI + AI tools** (completes the slice just shipped):
   - Operator: add a drop/rename affordance to the collection schema editor; PATCH
     the `_op:"drop_field"|"rename_field"` shapes. NEEDS EN/FI/ET + cms-bundle regen.
   - AI: `drop_collection_field` / `rename_collection_field` tools in
     `lib/chat/collection-tools.ts` → wire in tool-dispatch.ts + tool-scopes.ts
     (3 places: KNOWN_TOOL_NAMES, TOOL_BY_NAME, HANDLERS). Reuse `rebuildCollectionSchema`.
     Tool descriptions are model-facing → NO regen for the AI part.
2. **Import/export (CSV/JSON)** per collection.
3. **Operator raw-SELECT console** (guarded, SELECT-only, fenced — NOT for the AI).
4. **FTS5 return** (mind the D1 export-with-fts5 bug — see CAVEATS).
5. **Phase-3 route-driven detail pages** (NOT greenlit — needs user).

## Gate (every slice)
CMS `tsc` + `npm test` + `npx opennextjs-cloudflare build` (dev OFF) + cms-bundle
regen ONLY if you add CMS UI strings (AI-tool descriptions are model-facing → no regen).
