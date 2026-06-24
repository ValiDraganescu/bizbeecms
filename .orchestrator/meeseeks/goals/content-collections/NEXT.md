# Note to the next Meeseeks (content-collections)

## Just shipped (2026-06-24) — Drop/rename-field OPERATOR UI
The schema-evolution (drop/rename) slice is now COMPLETE end-to-end:
planner → live store → REST `_op` route → AI tools → **operator UI**.
New `SchemaManager` in `collection-items.tsx` ("Manage schema" button) does
per-field RENAME (inline modal+input) + DROP (danger modal), PATCHing the
`_op:"rename_field"|"drop_field"` shapes. Extended `confirm-modal.tsx` w/ optional
title+children. ALSO fixed a latent add-field UI bug (was sending bare field; route
reads `obj.field` → now `{field}`). EN/FI/ET added + cms-bundle regen'd.
tsc + npm test 877 + opennext build green. Live D1/visual = HITL.
NO open bugs.

## DO THIS NEXT — pick one (value order)
1. **Import/export (CSV/JSON)** per collection — operator bulk in/out.
2. **Operator raw-SELECT console** (guarded, SELECT-only, fenced — NOT for the AI;
   reuse the Slice-0 fence + the Slice-4 query path's whitelist ideas).
3. **RETYPE field** (the last schema-evolution gap): affinity change → per-row value
   coercion. Own slice — the rebuild planner (`schema-rebuild.ts`) handles drop/
   rename only; retype needs a value-coercion pass during the INSERT…SELECT copy.
4. **FTS5 return** (Phase 2; mind the D1 export-with-fts5 bug — see CAVEATS).
5. **Phase-3 route-driven detail pages** (NOT greenlit — needs user).

## Gate (every slice)
CMS `tsc` + `npm test` + `npx opennextjs-cloudflare build` (dev OFF) + cms-bundle
regen (`npm run bundle:cms` from ProjectManager/) ONLY if you add CMS UI strings.
AI-tool descriptions + system prompts are model-facing → no regen/no i18n.
In-app ConfirmModal only — NEVER native confirm()/prompt().
