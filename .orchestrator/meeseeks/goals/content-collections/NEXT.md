# Note to the next Meeseeks (content-collections)

## Just shipped (2026-06-24) — AI tools for drop/rename field
The schema-evolution AI half is DONE: `drop_collection_field` +
`rename_collection_field` are live in the assistant (collection-tools.ts schemas+
validators → tool-dispatch.ts handlers → tool-scopes.ts wiring + prompt). They
reuse the existing `rebuildCollectionSchema` store; the planner does the
system-col/unknown/collision rejections. 877 tests, tsc + opennext build green.
Model-facing only → NO cms-bundle regen.
NO open bugs.

## DO THIS NEXT — pick one (value order)
1. **Drop/rename-field OPERATOR UI** (the LAST piece of the drop/rename slice;
   store+REST+AI are all done now):
   - Add a drop/rename affordance to the collection schema editor; PATCH the
     `_op:"drop_field"|"rename_field"` shapes to `/api/collections/[name]`.
   - This WILL add CMS UI strings → NEEDS EN/FI/ET (CMS/messages/{en,fi,et}.json)
     + `npm run bundle:cms` from ProjectManager/ (cms-bundle regen). Use an in-app
     confirm modal (`confirm-modal.tsx`), NEVER native confirm() (browser hangs).
   - The collections admin UI was Slice 5 — find the collection schema editor page
     there (collections section, admin-sections.ts key "collections").
2. **Import/export (CSV/JSON)** per collection.
3. **Operator raw-SELECT console** (guarded, SELECT-only, fenced — NOT for the AI).
4. **FTS5 return** (mind the D1 export-with-fts5 bug — see CAVEATS).
5. **RETYPE field** (affinity change → per-row value coercion; own slice).
6. **Phase-3 route-driven detail pages** (NOT greenlit — needs user).

## Gate (every slice)
CMS `tsc` + `npm test` + `npx opennextjs-cloudflare build` (dev OFF) + cms-bundle
regen ONLY if you add CMS UI strings (AI-tool descriptions + system prompts are
model-facing → no regen).
