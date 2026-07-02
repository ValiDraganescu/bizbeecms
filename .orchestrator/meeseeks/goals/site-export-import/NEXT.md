# Note to the next Meeseeks (site-export-import)

This run took the manager-hinted gap-check: verified the CAVEATS-flagged
`MAX_READ_ROWS` (1000-row) truncation was a REAL bug, not just a documented
limitation. `contentSelect(\`SELECT * FROM content_x\`)` (no LIMIT/OFFSET)
silently `.slice(0, 1000)`s its result — a collection with >1000 rows would
export with only its first 1000 rows and zero indication of data loss.
Fixed with a new `contentSelectAll` pager (`CMS/src/lib/content/content-db.ts`)
used by both `GET /api/site-export` (the actual export) and
`POST /api/site-import/validate` (the dry-run's target-row counter). Regular
`contentSelect` is UNCHANGED — the cap is still correct for its other
ordinary-app-read callers; only export/dry-run-style "I need literally every
row" callers use the new pager. 4 new tests (`content-db.test.ts`), `npm test`
1505/1505, `tsc --noEmit` clean. FORMAT.md §3 documents the fix.

Also checked (per the hint) whether other tables have an equivalent cap:
pages/page-versions/components/assets/collections registry all go through
plain Drizzle `db.select().from(schema.x)`, which has NO row cap — confirmed
no equivalent gap there. Nothing else to fix on that front.

**This goal is very likely feature-complete + now gap-checked for its GOAL.md
scope.** Everything in BACKLOG.md's `## Tasks` and both rounds of "New TODOs"
is DONE except one deliberately-parked LOW-priority UX nit (confirm-string
copy — already fine, re-open only if reported). If you're picking this up
next, reasonable options:

1. **Flag to the curator that this goal is ready to archive** (like
   page-builder/ai-assistant/binding-adapters/deploy-audit-trail/
   custom-domains) — it's had a real cross-instance E2E pass, a completeness
   gap-check, wipe-loop atomicity hardening, and reusable 2nd-instance
   tooling. This is the strongest option if the user agrees there's no more
   must-have work.
2. If NOT archived yet, a genuinely fresh angle: performance, not
   correctness — the import EXECUTE path inserts collection rows one
   `contentWrite` call PER ROW (no batching), so a huge collection (say
   10k+ rows) would do 10k sequential D1 round-trips on import. Not
   incorrect, just slow. Only worth tackling if someone actually hits a
   large-collection import in practice — no evidence of that yet, so low
   priority; would want a realistic scale number before optimizing.
3. Re-run the scratch-instance E2E pass with a NON-empty target (the
   original E2E slice only tested an empty target) if you want a second
   layer of cross-instance confidence beyond what's already been done.
