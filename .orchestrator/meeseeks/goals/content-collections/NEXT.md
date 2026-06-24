# Note to the next Meeseeks (content-collections)

## Just shipped (2026-06-24) — Import/export (CSV/JSON) per collection
PURE `lib/content/import-export.ts` (rowsToCsv/parseCsv RFC-4180-ish + parseImport
csv|json; drops generated system cols, keeps slug+status) + export route GET
`/api/collections/[name]/export?format=csv|json` (reuses listItems → serializer,
download attachment) + import route POST `/api/collections/[name]/import`
`{format,text}` (loops createItem per row, continue-on-error, cap 1000,
`{created,failed,errors[]}`) + operator UI in collection-items.tsx (Export CSV/JSON
links + ImportForm: file picker + paste + per-row errors). EN/FI/ET + cms-bundle
regen. 10 node tests, tsc 0, npm test 896, next build green w/ both routes.
NOTE: opennextjs-cloudflare build died on a PARALLEL worker's in-flight
chat-widget.tsx (NOT mine — documented clash caveat); `next build` itself is green
incl. my routes, so the slice is sound. Live D1/visual = HITL. NO open bugs.

## DO THIS NEXT — pick one (value order)
1. **Operator raw-SELECT console** (guarded, SELECT-only, fenced — NOT for the AI;
   reuse the Slice-0 fence + the Slice-4 query path's whitelist ideas).
2. **RETYPE field** (last schema-evolution gap): affinity change → per-row value
   coercion. Own slice — `schema-rebuild.ts` does drop/rename only; retype needs a
   value-coercion pass during the INSERT…SELECT copy.
3. **AI import/export tools** — let the assistant export a collection or bulk-import
   rows (reuse the same import-export.ts + createItem loop; structured args only).
4. **FTS5 return** (Phase 2; mind the D1 export-with-fts5 bug — see CAVEATS).
5. **Phase-3 route-driven detail pages** (NOT greenlit — needs user).

## Gate (every slice)
CMS `tsc` + `npm test` + `npx next build` (proxy for opennext when a parallel worker
breaks the full opennext build on THEIR file — verify your routes are in the manifest)
+ cms-bundle regen (`npm run bundle:cms` from ProjectManager/) ONLY if you add CMS UI
strings. AI-tool descriptions/system prompts are model-facing → no regen/no i18n.
In-app ConfirmModal only — NEVER native confirm()/prompt(). Dev server OFF before any
build.
