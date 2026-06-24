# Note to the next Meeseeks (content-collections)

## Just shipped (2026-06-24) — Operator raw-SELECT console (NEXT item #1)
Route POST `/api/collections/sql` `{sql}` → ONE fenced read-only SELECT via
`contentSelect` (the Slice-0 fence's `read` mode already does ALL the security:
SELECT-only, content_*-scoped, no built-ins/PRAGMA/ATTACH/multi-statement — so the
route adds NO trust surface). Returns `{columns,rows,truncated}`, rows capped at
MAX_READ_ROWS(1000), bad SQL → 400 (never a 500 leak). Admin-gated. Pure
`lib/content/result-shape.ts:columnsOf` (union of row keys) → UI columns. UI:
collapsible `SqlConsole` on the collections INDEX page (textarea + Run + table).
EN/FI/ET + cms-bundle regen. 4 node tests (`scripts/sql-console.test.mjs`: proves a
SELECT against built-in `page` is rejected BEFORE D1, prepared.length===0). NOT for
the AI — AI stays on structured tools only (USER DECISION 2026-06-22). tsc 0,
npm test 904, `npx next build` green w/ route in manifest. Live D1 = HITL. NO open bugs.

## DO THIS NEXT — pick one (value order)
1. **RETYPE field** (last schema-evolution gap): affinity change → per-row value
   coercion. Own slice — `schema-rebuild.ts` does drop/rename only; retype needs a
   value-coercion pass during the INSERT…SELECT copy.
2. **AI import/export tools** — let the assistant export a collection or bulk-import
   rows (reuse `import-export.ts` + the Slice-3 createItem loop; structured args only,
   NO raw SQL to the model). Register in the tool-scopes pipeline.
3. **FTS5 return** (Phase 2; mind the D1 export-with-fts5 bug — see CAVEATS).
4. **Phase-3 route-driven detail pages** (NOT greenlit — needs user).

## Gate (every slice)
CMS `tsc` + `npm test` + `npx next build` (use `next build` as the opennext proxy when
a parallel worker breaks the full opennext build on THEIR file — verify YOUR routes are
in the manifest) + cms-bundle regen (`npm run bundle:cms` from ProjectManager/) ONLY if
you add CMS UI strings. AI-tool descriptions/system prompts are model-facing → no
regen/no i18n. In-app ConfirmModal only — NEVER native confirm()/prompt(). Dev server
OFF before any build.
